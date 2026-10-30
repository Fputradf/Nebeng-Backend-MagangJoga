import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import {
  TripStatus,
  OrderStatus,
  EscrowStatus,
  TransactionType,
  SanctionViolationType,
} from '../../generated/prisma/enums';
import { SanctionService } from '../admin/sanction.service';
import { NotificationHelperService } from '../notifications/notification-helper.service';
import { computeOrderFinancials } from '../../common/utils/financial.util';

@Injectable()
export class TripsExpirationCron {
  private readonly logger = new Logger(TripsExpirationCron.name);
  private readonly sentAlerts = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly sanctionService: SanctionService,
    private readonly notificationHelper: NotificationHelperService,
  ) {}

  /**
   * Berjalan setiap 2 menit untuk memeriksa trip yang telah melewati batas toleransi 15 menit.
   * Toleransi keterlambatan mitra adalah 15 menit setelah jadwal keberangkatan.
   * Jika lebih dari 15 menit mitra belum hadir/check-in di pos asal:
   * - Trip dibatalkan / mitra_no_show
   * - Skenario C: Hanya customer yang sudah check-in di pos asal yang mendapat refund 100%.
   *   Customer yang belum check-in dianggap no-show (tanpa refund).
   * - Mitra dikenakan sanksi (skor -30, akun disuspend 1 hari).
   */
  @Cron('*/2 * * * *')
  async handleExpiredTrips() {
    try {
      const now = new Date();
      const TOLERANCE_MINUTES = 15;
      const TOLERANCE_MS = TOLERANCE_MINUTES * 60 * 1000;

      // Cari trip yang masih scheduled dengan departureDate <= hari ini
      const scheduledTrips = await this.prisma.trip.findMany({
        where: {
          status: TripStatus.scheduled,
          departureDate: {
            lte: now,
          },
        },
        include: {
          originPoint: true,
          orders: {
            where: {
              status: {
                notIn: [
                  OrderStatus.cancelled,
                  OrderStatus.cancelled_by_mitra,
                  OrderStatus.no_show,
                  OrderStatus.completed,
                ],
              },
            },
          },
        },
        take: 100,
      });

      if (scheduledTrips.length === 0) {
        return;
      }

      for (const trip of scheduledTrips) {
        try {
          const datePart = trip.departureDate.toISOString().split('T')[0];
          let timePart = '23:59:59';

          if (trip.departureTime) {
            const timeIso = trip.departureTime.toISOString();
            timePart = timeIso.includes('T')
              ? timeIso.split('T')[1].substring(0, 8)
              : timeIso.substring(0, 8);
          }

          const departureDateTime = new Date(`${datePart}T${timePart}Z`);
          if (isNaN(departureDateTime.getTime())) {
            continue;
          }

          const expirationThreshold = new Date(
            departureDateTime.getTime() + TOLERANCE_MS,
          );

          // Hanya proses jika sudah lewat toleransi 15 menit
          if (now < expirationThreshold) {
            continue;
          }

          // A. Trip Kosong (Tidak ada order aktif)
          if (trip.orders.length === 0) {
            await this.prisma.trip.update({
              where: { id: trip.id },
              data: {
                status: TripStatus.cancelled,
              },
            });
            this.logger.log(
              `Trip #${trip.id} otomatis dibatalkan (toleransi 15 menit terlewat tanpa pesanan aktif).`,
            );
            continue;
          }

          // B. Trip Memiliki Order Aktif -> Mitra No-Show & Skenario C
          await this.prisma.$transaction(async (tx) => {
            const activeOrders = trip.orders;

            for (const order of activeOrders) {
              const isCustomerCheckedIn =
                order.status === OrderStatus.checked_in_origin;

              const adminFeePercentage = Number(order.adminFeePercentage || 10);
              const financials = computeOrderFinancials({
                subtotal: (order as any).subtotal || order.totalPrice,
                totalPrice: order.totalPrice,
                discountAmount: (order as any).discountAmount,
                adminFeePercentage,
              });

              // Skenario C: Refund HANYA untuk customer yang sudah check-in di pos asal
              if (isCustomerCheckedIn) {
                let customerWallet = await tx.wallet.findUnique({
                  where: { userId: order.customerId },
                });
                if (!customerWallet) {
                  customerWallet = await tx.wallet.create({
                    data: {
                      userId: order.customerId,
                      balance: 0,
                      heldEscrowBalance: 0,
                    },
                  });
                }
                await tx.wallet.update({
                  where: { id: customerWallet.id },
                  data: { balance: { increment: financials.customerPaid } },
                });
                await tx.walletTransaction.create({
                  data: {
                    walletId: customerWallet.id,
                    orderId: order.id,
                    amount: financials.customerPaid,
                    type: TransactionType.credit,
                    description: `Refund (Mitra No-Show, Customer Hadir di Pos) #${order.id}`,
                  },
                });
              }

              // Tarik dana escrow mitra
              const mitraWallet = await tx.wallet.findUnique({
                where: { userId: trip.mitraId },
              });
              if (mitraWallet) {
                await tx.wallet.update({
                  where: { id: mitraWallet.id },
                  data: {
                    heldEscrowBalance: { decrement: financials.netMitra },
                  },
                });
                await tx.walletTransaction.create({
                  data: {
                    walletId: mitraWallet.id,
                    orderId: order.id,
                    amount: financials.netMitra,
                    type: TransactionType.debit,
                    description: `Penarikan Escrow (Mitra No-Show) #${order.id}`,
                  },
                });
              }

              // Update status order
              await tx.order.update({
                where: { id: order.id },
                data: {
                  status: isCustomerCheckedIn
                    ? OrderStatus.cancelled
                    : OrderStatus.no_show,
                  escrowStatus: EscrowStatus.refunded,
                  ...(isCustomerCheckedIn
                    ? {}
                    : {
                        noShowMarkedAt: now,
                        noShowReason:
                          'Customer tidak hadir / check in di pos asal saat jadwal trip',
                      }),
                },
              });

              // Release voucher jika ada
              await tx.voucherRedemption.updateMany({
                where: { orderId: order.id },
                data: { status: 'released' },
              });
            }

            // Update status trip ke mitra_no_show
            await tx.trip.update({
              where: { id: trip.id },
              data: {
                status: TripStatus.mitra_no_show,
                mitraNoShowMarkedAt: now,
                mitraNoShowReason:
                  'Mitra tidak hadir ke pos asal melewati toleransi 15 menit',
              },
            });

            // Terapkan sanksi otomatis ke mitra (skor -30, suspend akun 1 hari)
            await this.sanctionService.applySanction(
              trip.mitraId,
              trip.id,
              SanctionViolationType.MITRA_NO_SHOW,
              1,
              tx,
            );
          });

          // Notifikasi No Show & Sanksi
          await this.notificationHelper.notifyMitraNoShow(
            trip.mitraId.toString(),
            trip.id.toString(),
          );

          try {
            await this.notificationHelper.notifyMitraLateSanction(
              trip.mitraId.toString(),
              trip.id.toString(),
              (trip as any).originPoint?.name || 'Pos Asal',
            );
          } catch (notifErr: any) {
            this.logger.warn(`Gagal kirim notif sanksi no-show mitra: ${notifErr.message}`);
          }

          this.logger.log(
            `Trip #${trip.id} otomatis diproses mitra_no_show setelah lewat toleransi 15 menit. Mitra disanksi suspend 1 hari.`,
          );
        } catch (tripErr: any) {
          this.logger.error(
            `Gagal memproses kedaluwarsa Trip #${trip.id}: ${tripErr.message}`,
          );
        }
      }
    } catch (err: any) {
      this.logger.error(
        `Gagal menjalankan handleExpiredTrips: ${err.message}`,
        err.stack,
      );
    }
  }

  /**
   * Berjalan setiap menit untuk mengecek jadwal keberangkatan trip yang mepet:
   * 1. Alert H-30 Menit: Peringatan awal bagi mitra & pengingat bagi penumpang aktif.
   * 2. Alert H-0 Menit: Waktu keberangkatan telah tiba, mendesak mitra hadir di pos agar tidak terkena penalti.
   */
  @Cron('*/1 * * * *')
  async handleTripDepartureAlerts() {
    try {
      const now = new Date();
      const lookAhead = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      const lookBehind = new Date(now.getTime() - 30 * 60 * 1000);

      const scheduledTrips = await this.prisma.trip.findMany({
        where: {
          status: TripStatus.scheduled,
          departureDate: {
            gte: new Date(lookBehind.toISOString().split('T')[0]),
            lte: new Date(lookAhead.toISOString().split('T')[0]),
          },
        },
        include: {
          originPoint: true,
          orders: {
            where: {
              status: {
                in: [OrderStatus.paid, OrderStatus.checked_in_origin],
              },
            },
          },
        },
        take: 100,
      });

      // Cleanup cache yang lebih tua dari 24 jam
      const oneDayAgo = now.getTime() - 24 * 60 * 60 * 1000;
      for (const [key, timestamp] of this.sentAlerts.entries()) {
        if (timestamp < oneDayAgo) {
          this.sentAlerts.delete(key);
        }
      }

      for (const trip of scheduledTrips) {
        try {
          const datePart = trip.departureDate.toISOString().split('T')[0];
          let timePart = '23:59:59';
          if (trip.departureTime) {
            const timeIso = trip.departureTime.toISOString();
            timePart = timeIso.includes('T')
              ? timeIso.split('T')[1].substring(0, 8)
              : timeIso.substring(0, 8);
          }

          const departureDateTime = new Date(`${datePart}T${timePart}Z`);
          if (isNaN(departureDateTime.getTime())) continue;

          // Selisih menit dari sekarang hingga waktu keberangkatan
          const diffMinutes = Math.round(
            (departureDateTime.getTime() - now.getTime()) / (60 * 1000),
          );
          const posName = trip.originPoint?.name || 'Pos Asal';
          const customerIds = [
            ...new Set(trip.orders.map((o) => o.customerId.toString())),
          ];

          // 1. Alert H-30 Menit (Window: 25 - 35 menit sebelum keberangkatan)
          if (diffMinutes >= 25 && diffMinutes <= 35) {
            const alertKey = `${trip.id}_h30`;
            if (!this.sentAlerts.has(alertKey)) {
              this.sentAlerts.set(alertKey, now.getTime());

              // Notifikasi ke Mitra
              await this.notificationHelper.notifyTripDepartureReminderH30(
                trip.mitraId.toString(),
                trip.id.toString(),
                'mitra',
                posName,
                30,
              );

              // Notifikasi ke Penumpang
              for (const cid of customerIds) {
                await this.notificationHelper.notifyTripDepartureReminderH30(
                  cid,
                  trip.id.toString(),
                  'customer',
                  posName,
                  30,
                );
              }

              this.logger.log(
                `[Alert H-30] Berhasil mengirim peringatan keberangkatan 30 menit untuk Trip #${trip.id}`,
              );
            }
          }

          // 2. Alert H-0 Menit (Window: -5 s.d. +2 menit saat waktu keberangkatan tiba)
          // Masih scheduled berarti mitra belum tiba/check-in di pos asal
          if (diffMinutes <= 2 && diffMinutes >= -5) {
            const alertKey = `${trip.id}_h0`;
            if (!this.sentAlerts.has(alertKey)) {
              this.sentAlerts.set(alertKey, now.getTime());

              // Urgent Alert ke Mitra (High priority)
              await this.notificationHelper.notifyTripDepartureUrgencyH0(
                trip.mitraId.toString(),
                trip.id.toString(),
                'mitra',
                posName,
              );

              // Update info ke Penumpang
              for (const cid of customerIds) {
                await this.notificationHelper.notifyTripDepartureUrgencyH0(
                  cid,
                  trip.id.toString(),
                  'customer',
                  posName,
                );
              }

              this.logger.log(
                `[Alert H-0] Berhasil mengirim alert urgensi waktu keberangkatan untuk Trip #${trip.id}`,
              );
            }
          }
        } catch (err: any) {
          this.logger.warn(
            `Error pemrosesan alert waktu untuk Trip #${trip.id}: ${err.message}`,
          );
        }
      }
    } catch (err: any) {
      this.logger.error(
        `Gagal menjalankan handleTripDepartureAlerts: ${err.message}`,
        err.stack,
      );
    }
  }
}
