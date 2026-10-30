import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  EscrowStatus,
  OrderStatus,
  NoShowAuditType,
  RewardType,
  ScanType,
  ServiceType,
  TransactionType,
  TripStatus,
} from '../../../generated/prisma/enums';
import { randomBytes } from 'crypto';
import { computeOrderFinancials } from '../../../common/utils/financial.util';

@Injectable()
export class CheckpointsRepository {
  private readonly logger = new Logger(CheckpointsRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  private safeParseBigInt(id: string): bigint | null {
    try {
      return BigInt(id);
    } catch {
      return null;
    }
  }

  async findTripByQr(qrCodeTrip: string) {
    return this.prisma.trip.findUnique({
      where: { qrCodeTrip },
      include: { originPoint: true, destinationPoint: true },
    });
  }

  async findTripById(tripId: string) {
    const parsedId = this.safeParseBigInt(tripId);
    if (!parsedId) return null;
    return this.prisma.trip.findUnique({
      where: { id: parsedId },
      include: { originPoint: true, destinationPoint: true },
    });
  }

  async findOrderByQr(qrCodeTicket: string) {
    return this.prisma.order.findUnique({
      where: { qrCodeTicket },
      include: { itemOrders: true },
    });
  }

  async findOrderById(orderId: string) {
    const parsedId = this.safeParseBigInt(orderId);
    if (!parsedId) return null;
    return this.prisma.order.findUnique({
      where: { id: parsedId },
      include: { itemOrders: true },
    });
  }

  async processCheckinOrigin(
    tripId: bigint,
    orderId: bigint,
    posIdStr: string,
    scannedByUserIdStr: string,
    securitySealQr?: string,
    photoUrl?: string,
  ) {
    const parsedPosId = this.safeParseBigInt(posIdStr) ?? BigInt(1);
    const parsedUserId = this.safeParseBigInt(scannedByUserIdStr);
    if (!parsedPosId || !parsedUserId) {
      throw new BadRequestException('Format ID Pos atau ID User tidak valid');
    }
    // Buat kode tiket baru yang unik khusus fase Pos Tujuan
    const nextDestQrToken = `TKT-DEST-${randomBytes(4).toString('hex').toUpperCase()}`;
    const now = new Date();
    const tokenExpiry = new Date(now.getTime() + 48 * 60 * 60 * 1000); // Aktif 48 jam
    return this.prisma.$transaction(async (tx) => {
      // 1. Update status trip menjadi in_transit
      await tx.trip.update({
        where: { id: tripId },
        data: { status: TripStatus.in_transit },
      });
      // 2. Hanguskan sesi QR sebelumnya (Pos Asal)
      await tx.orderQrSession.updateMany({
        where: { orderId, isUsed: false },
        data: { isUsed: true, usedAt: now },
      });
      // 3. Buat sesi QR baru untuk Pos Tujuan
      await tx.orderQrSession.create({
        data: {
          orderId,
          qrToken: nextDestQrToken,
          scanPhase: ScanType.checkin_destination,
          isUsed: false,
          expiredAt: tokenExpiry,
        },
      });
      // 4. Update order dengan kode QR tujuan baru & status in_transit
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.checked_in_origin,
          qrCodeTicket: nextDestQrToken, // Rotasi QR tiket
        },
      });
      // 5. Simpan segel fisik jika pengiriman paket barang
      if (securitySealQr || photoUrl) {
        await tx.itemOrder.updateMany({
          where: { orderId },
          data: {
            ...(securitySealQr && { securitySealQr }),
            ...(photoUrl && { photoUrl }),
          },
        });
      }
      // 6. Catat riwayat log checkpoint
      return tx.checkpointsLog.create({
        data: {
          tripId,
          orderId,
          posId: parsedPosId,
          scannedByUserId: parsedUserId,
          scanType: ScanType.checkin_origin,
        },
        include: { trip: true, order: true, pos: true },
      });
    });
  }

  async processCheckinDestinationAndReleaseEscrow(
    tripId: bigint,
    orderId: bigint,
    posIdStr: string,
    scannedByUserIdStr: string,
    mitraUserId: bigint,
    customerId: bigint,
    totalPrice: number,
    adminFeePercentage: number = 10,
    recipientName?: string,
    subtotal?: number,
    discountAmount?: number,
  ) {
    const parsedPosId = this.safeParseBigInt(posIdStr) ?? BigInt(1);
    const parsedUserId = this.safeParseBigInt(scannedByUserIdStr);

    if (!parsedUserId || !parsedPosId) {
      throw new BadRequestException('Format ID Pos atau ID User tidak valid');
    }

    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        select: {
          subtotal: true,
          totalPrice: true,
          discountAmount: true,
          adminFeePercentage: true,
        },
      });

      const financials = computeOrderFinancials({
        subtotal: order?.subtotal ?? subtotal ?? totalPrice,
        totalPrice: order?.totalPrice ?? totalPrice,
        discountAmount: order?.discountAmount ?? discountAmount ?? 0,
        adminFeePercentage: Number(order?.adminFeePercentage ?? adminFeePercentage),
      });

      const mitraEarnings = financials.netMitra;

      await tx.trip.update({
        where: { id: tripId },
        data: { status: TripStatus.completed },
      });

      await tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.completed,
          escrowStatus: EscrowStatus.released,
        },
      });

      if (recipientName) {
        await tx.itemOrder.updateMany({
          where: { orderId },
          data: { recipientName },
        });
      }

      let mitraWallet = await tx.wallet.findUnique({
        where: { userId: mitraUserId },
      });

      if (!mitraWallet) {
        mitraWallet = await tx.wallet.create({
          data: { userId: mitraUserId, balance: 0, heldEscrowBalance: 0 },
        });
      }

      await tx.wallet.update({
        where: { id: mitraWallet.id },
        data: {
          heldEscrowBalance: { decrement: mitraEarnings },
          balance: { increment: mitraEarnings },
        },
      });

      await tx.walletTransaction.create({
        data: {
          walletId: mitraWallet.id,
          orderId,
          amount: mitraEarnings,
          type: TransactionType.escrow_release,
          description: `Pencairan dana Escrow order #${orderId} (setelah dipotong komisi platform ${adminFeePercentage}%)`,
        },
      });

      // Admin fee is already credited at checkout in payments.repository.ts

      const rewardSetting = await tx.pricingSetting.findFirst({
        where: { serviceType: ServiceType.barang },
        select: { farePerKg: true },
      });

      const multiplier =
        rewardSetting?.farePerKg && Number(rewardSetting.farePerKg) > 0
          ? Number(rewardSetting.farePerKg)
          : 10000;

      const earnedPoints = Math.max(1, Math.floor(totalPrice / multiplier));

      await tx.user.update({
        where: { id: customerId },
        data: { rewardPoints: { increment: earnedPoints } },
      });

      await tx.rewardTransaction.create({
        data: {
          userId: customerId,
          points: earnedPoints,
          type: RewardType.earn,
          description: `Reward ${earnedPoints} poin (Rasio kelipatan Rp ${multiplier.toLocaleString()}) atas penyelesaian order #${orderId}`,
        },
      });

      return tx.checkpointsLog.create({
        data: {
          tripId,
          orderId,
          posId: parsedPosId,
          scannedByUserId: parsedUserId,
          scanType: ScanType.checkin_destination,
        },
        include: { trip: true, order: true, pos: true },
      });
    });
  }

  async processManualForceCompleteAndRelease(
    tripId: bigint,
    orderId: bigint,
    posIdStr: string,
    scannedByUserIdStr: string,
    mitraUserId: bigint,
    customerId: bigint,
    totalPrice: number,
    adminFeePercentage: number = 10,
  ) {
    const parsedPosId = this.safeParseBigInt(posIdStr) ?? BigInt(1);
    const parsedUserId = this.safeParseBigInt(scannedByUserIdStr);

    if (!parsedUserId || !parsedPosId) {
      throw new BadRequestException('Format ID Pos atau ID User tidak valid');
    }

    return this.prisma.$transaction(async (tx) => {
      const platformFee = totalPrice * (adminFeePercentage / 100);
      const mitraEarnings = totalPrice - platformFee;

      await tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.completed,
          escrowStatus: EscrowStatus.released,
        },
      });

      let mitraWallet = await tx.wallet.findUnique({
        where: { userId: mitraUserId },
      });

      if (!mitraWallet) {
        mitraWallet = await tx.wallet.create({
          data: { userId: mitraUserId, balance: 0, heldEscrowBalance: 0 },
        });
      }

      await tx.wallet.update({
        where: { id: mitraWallet.id },
        data: {
          heldEscrowBalance: { decrement: mitraEarnings },
          balance: { increment: mitraEarnings },
        },
      });

      await tx.walletTransaction.create({
        data: {
          walletId: mitraWallet.id,
          orderId,
          amount: mitraEarnings,
          type: TransactionType.escrow_release,
          description: `Force Release Escrow (Manual Operator Pos) order #${orderId} (setelah komisi ${adminFeePercentage}%)`,
        },
      });

      // Admin fee is already credited at checkout in payments.repository.ts

      return tx.checkpointsLog.create({
        data: {
          tripId,
          orderId,
          posId: parsedPosId,
          scannedByUserId: parsedUserId,
          scanType: ScanType.checkin_destination,
        },
        include: { trip: true, order: true, pos: true },
      });
    });
  }

  async processOperatorCancelOrder(
    orderId: bigint,
    tripId: bigint,
    seatsToRestore: number,
    weightToRestore: number,
  ) {
    return this.prisma.$transaction(async (tx) => {
      // 1. Dapatkan informasi Order untuk kalkulasi refund
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { trip: true },
      });

      if (!order) {
        throw new BadRequestException('Order tidak ditemukan');
      }

      // 2. Process Refund jika order sudah dibayar
      if (
        order.status === 'paid' ||
        order.status === 'checked_in_origin' ||
        order.escrowStatus === 'held'
      ) {
        const adminFeePercentage = Number(order.adminFeePercentage || 10);
        const financials = computeOrderFinancials({
          subtotal: (order as any).subtotal || order.totalPrice,
          totalPrice: order.totalPrice,
          discountAmount: (order as any).discountAmount,
          adminFeePercentage,
        });

        // a. Refund Customer
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
            description: `Refund Order Dibatalkan Operator #${order.id}`,
          },
        });

        // b. Deduct Escrow from Mitra
        const mitraWallet = await tx.wallet.findUnique({
          where: { userId: order.trip.mitraId },
        });
        if (mitraWallet) {
          await tx.wallet.update({
            where: { id: mitraWallet.id },
            data: { heldEscrowBalance: { decrement: financials.netMitra } },
          });
          await tx.walletTransaction.create({
            data: {
              walletId: mitraWallet.id,
              orderId: order.id,
              amount: financials.netMitra,
              type: TransactionType.debit,
              description: `Pengembalian Dana Escrow (Order Dibatalkan) #${order.id}`,
            },
          });
        }

        // c. Deduct Admin Fee / Return Subsidy
        const systemAdminIdEnv = process.env.SYSTEM_ADMIN_USER_ID;
        const parsedSystemAdminId = systemAdminIdEnv
          ? BigInt(systemAdminIdEnv)
          : null;
        const adminUser = parsedSystemAdminId
          ? await tx.user.findUnique({ where: { id: parsedSystemAdminId } })
          : await tx.user.findFirst({
              where: { role: 'admin' },
              orderBy: { id: 'asc' },
            });

        if (adminUser) {
          const adminWallet = await tx.wallet.findUnique({
            where: { userId: adminUser.id },
          });
          if (adminWallet) {
            if (financials.adminNet >= 0) {
              if (financials.adminNet > 0) {
                await tx.wallet.update({
                  where: { id: adminWallet.id },
                  data: { balance: { decrement: financials.adminNet } },
                });
                await tx.walletTransaction.create({
                  data: {
                    walletId: adminWallet.id,
                    orderId: order.id,
                    amount: financials.adminNet,
                    type: TransactionType.debit,
                    description: `Pengembalian Admin Fee (Order Dibatalkan) #${order.id}`,
                  },
                });
              }
            } else {
              const refundSubsidy = Math.abs(financials.adminNet);
              await tx.wallet.update({
                where: { id: adminWallet.id },
                data: { balance: { increment: refundSubsidy } },
              });
              await tx.walletTransaction.create({
                data: {
                  walletId: adminWallet.id,
                  orderId: order.id,
                  amount: refundSubsidy,
                  type: TransactionType.credit,
                  description: `Pengembalian Subsidi Voucher (Order Dibatalkan) #${order.id}`,
                },
              });
            }
          }
        }
      }

      // 2b. Release Voucher Redemption
      await tx.voucherRedemption.updateMany({
        where: { orderId: order.id },
        data: { status: 'released' },
      });

      // 3. Update Order Status
      const updatedOrder = await tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.cancelled,
          escrowStatus: EscrowStatus.refunded,
        },
      });

      // 4. Kembalikan Kuota
      await tx.trip.update({
        where: { id: tripId },
        data: {
          seatAvailable: { increment: seatsToRestore },
          remainingWeightCapacityKg: { increment: weightToRestore },
        },
      });

      return updatedOrder;
    });
  }

  async processPassengerNoShow(
    orderId: bigint,
    tripId: bigint,
    posIdStr: string,
    scannedByUserIdStr: string,
  ) {
    const parsedPosId = this.safeParseBigInt(posIdStr) ?? BigInt(1);
    const parsedUserId = this.safeParseBigInt(scannedByUserIdStr);

    if (!parsedPosId || !parsedUserId) {
      throw new BadRequestException('Format ID Pos atau ID User tidak valid');
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Dapatkan informasi Order
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { trip: true },
      });

      if (!order) {
        throw new BadRequestException('Order tidak ditemukan');
      }

      // Validasi: Hanya bisa no-show jika statusnya 'paid'
      if (order.status !== 'paid') {
        throw new BadRequestException(
          'Penumpang no-show hanya dapat diproses untuk order dengan status paid',
        );
      }

      const seatsToRestore = order.seatsBooked || 0;
      const weightToRestore = Number(order.totalWeightKg) || 0;

      // 2. TIDAK ADA REFUND - Penumpang dianggap telah datang terlambat dan kehilangan hak refund
      // Dana escrow tetap di hold untuk mitra
      // Admin fee sudah dikreditkan ke admin sebelumnya

      // 3. Update Order Status ke no_show
      const updatedOrder = await tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.no_show,
          // escrowStatus tetap 'held' karena dana masih dalam escrow
        },
      });

      // 4. Kembalikan Kuota (kursi/bagasi tetap dibuka untuk orang lain)
      await tx.trip.update({
        where: { id: tripId },
        data: {
          seatAvailable: { increment: seatsToRestore },
          remainingWeightCapacityKg: { increment: weightToRestore },
        },
      });

      // 5. Catat riwayat log checkpoint sebagai bukti
      await tx.checkpointsLog.create({
        data: {
          tripId,
          orderId,
          posId: parsedPosId,
          scannedByUserId: parsedUserId,
          scanType: ScanType.checkin_origin, // Tetap catat sebagai checkin_origin tapi dengan status no_show
        },
      });

      return updatedOrder;
    });
  }

  async processMitraNoShow(
    tripId: bigint,
    posIdStr: string,
    scannedByUserIdStr: string,
  ) {
    const parsedPosId = this.safeParseBigInt(posIdStr) ?? BigInt(1);
    const parsedUserId = this.safeParseBigInt(scannedByUserIdStr);

    if (!parsedPosId || !parsedUserId) {
      throw new BadRequestException('Format ID Pos atau ID User tidak valid');
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Guard level trip: updateMany dengan where id + status asal yang sah
      const tripUpdateCount = await tx.trip.updateMany({
        where: {
          id: tripId,
          status: { in: [TripStatus.scheduled, TripStatus.in_origin_pos] },
        },
        data: {
          status: TripStatus.mitra_no_show,
          mitraNoShowMarkedAt: new Date(),
          mitraNoShowMarkedBy: parsedUserId,
        },
      });

      if (tripUpdateCount.count === 0) {
        throw new BadRequestException(
          'Trip ini sudah dibatalkan, sedang berjalan, atau tidak dapat diproses mitra no-show pada status saat ini.',
        );
      }

      // 2. Dapatkan informasi Trip dan semua Orders aktif (setelah update berhasil)
      const trip = await tx.trip.findUnique({
        where: { id: tripId },
        include: {
          orders: {
            where: {
              status: { notIn: [OrderStatus.cancelled, OrderStatus.completed, OrderStatus.no_show] },
            },
          },
        },
      });

      if (!trip) {
        throw new BadRequestException('Trip tidak ditemukan');
      }

      // Ambil mitra wallet di luar loop untuk digunakan berulang
      let mitraWallet = await tx.wallet.findUnique({
        where: { userId: trip.mitraId },
      });

      if (!mitraWallet) {
        throw new BadRequestException(
          'Wallet mitra tidak ditemukan. Hubungi administrator untuk pembuatan wallet.',
        );
      }

      // 3. Process Skenario C: Hanya customer yang sudah check-in di pos asal yang berhak refund
      for (const order of trip.orders) {
        const isCustomerCheckedIn = order.status === OrderStatus.checked_in_origin;

        // Guard level order: updateMany dengan where id + status aktif yang sah
        const orderUpdateCount = await tx.order.updateMany({
          where: {
            id: order.id,
            status: { in: [OrderStatus.paid, OrderStatus.checked_in_origin] },
            escrowStatus: EscrowStatus.held,
          },
          data: {
            status: isCustomerCheckedIn ? OrderStatus.cancelled : OrderStatus.no_show,
            escrowStatus: EscrowStatus.refunded,
            ...(isCustomerCheckedIn
              ? {}
              : {
                  noShowMarkedAt: new Date(),
                  noShowMarkedBy: parsedUserId,
                  noShowReason: 'Customer tidak hadir / check in di pos asal saat jadwal trip',
                }),
          },
        });

        // Handle orderUpdateCount === 0
        if (orderUpdateCount.count === 0) {
          // Baca ulang order untuk cek status aktual
          const currentOrder = await tx.order.findUnique({
            where: { id: order.id },
            select: { status: true, escrowStatus: true },
          });

          if (currentOrder) {
            const isAlreadyRefunded =
              (currentOrder.status === OrderStatus.cancelled ||
                currentOrder.status === OrderStatus.cancelled_by_mitra ||
                currentOrder.status === OrderStatus.no_show) &&
              currentOrder.escrowStatus === EscrowStatus.refunded;

            if (isAlreadyRefunded) {
              // Lewati order ini dengan log
              this.logger.log(
                `Order #${order.id} sudah di-refund (status: ${currentOrder.status}, escrow: ${currentOrder.escrowStatus}). Melompati refund.`,
              );
              continue;
            }
          }

          // Status lain: arahkan ke pending_admin_review
          throw new BadRequestException(
            `Order #${order.id} dalam status tidak dapat di-refund. Status: ${currentOrder?.status}, Escrow: ${currentOrder?.escrowStatus}. Arahkan ke pending_admin_review.`,
          );
        }

        // Kredit dompet customer, debit escrow mitra, dan debit admin fee HANYA jika count === 1
        const adminFeePercentage = Number(order.adminFeePercentage || 10);
        const financials = computeOrderFinancials({
          subtotal: (order as any).subtotal || order.totalPrice,
          totalPrice: order.totalPrice,
          discountAmount: (order as any).discountAmount,
          adminFeePercentage,
        });

        // Cari WalletTransaction escrow_hold untuk nominal tersimpan
        const escrowTransaction = await tx.walletTransaction.findFirst({
          where: {
            orderId: order.id,
            type: TransactionType.escrow_hold,
          },
          select: { amount: true },
        });

        if (!escrowTransaction) {
          throw new BadRequestException(
            `Data escrow tersimpan tidak ditemukan untuk order #${order.id}. Tidak dapat memverifikasi nominal.`,
          );
        }

        const storedEscrowAmount = Number(escrowTransaction.amount);

        // Invariant konsistensi: subtotal === storedEscrowAmount + fee
        if (financials.subtotal !== storedEscrowAmount + financials.fee) {
          throw new BadRequestException(
            `Konsistensi uang terganggu untuk order #${order.id}. Subtotal: ${financials.subtotal}, Escrow tersimpan: ${storedEscrowAmount}, Admin: ${financials.fee}`,
          );
        }

        // a. Refund Customer HANYA jika customer sudah check-in di pos asal
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

        // b. Deduct Escrow from Mitra dengan syarat saldo mencukupi
        const mitraEscrowUpdateCount = await tx.wallet.updateMany({
          where: {
            id: mitraWallet.id,
            heldEscrowBalance: { gte: financials.netMitra },
          },
          data: {
            heldEscrowBalance: { decrement: financials.netMitra },
          },
        });

        if (mitraEscrowUpdateCount.count === 0) {
          this.logger.error(
            `Saldo escrow mitra tidak mencukupi. Mitra: ${trip.mitraId}, Trip: ${tripId}, Order: ${order.id}, Saldo: ${mitraWallet.heldEscrowBalance}, Dibutuhkan: ${financials.netMitra}`,
          );
          throw new BadRequestException(
            'Saldo escrow mitra tidak mencukupi untuk pengembalian dana. Arahkan ke pending_admin_review.',
          );
        }

        await tx.walletTransaction.create({
          data: {
            walletId: mitraWallet.id,
            orderId: order.id,
            amount: financials.netMitra,
            type: TransactionType.debit,
            description: `Pengembalian Dana Escrow (Mitra No-Show) #${order.id}`,
          },
        });

        // c. Deduct Admin Fee / Return Subsidy (tanpa guard gte, saldo negatif diizinkan)
        const systemAdminIdEnv = process.env.SYSTEM_ADMIN_USER_ID;
        const parsedSystemAdminId = systemAdminIdEnv
          ? BigInt(systemAdminIdEnv)
          : null;
        const adminUser = parsedSystemAdminId
          ? await tx.user.findUnique({ where: { id: parsedSystemAdminId } })
          : await tx.user.findFirst({
              where: { role: 'admin' },
              orderBy: { id: 'asc' },
            });

        if (adminUser) {
          const adminWallet = await tx.wallet.findUnique({
            where: { userId: adminUser.id },
          });
          if (adminWallet) {
            if (financials.adminNet >= 0) {
              if (financials.adminNet > 0) {
                const updatedAdmin = await tx.wallet.update({
                  where: { id: adminWallet.id },
                  data: { balance: { decrement: financials.adminNet } },
                });
                if (Number(updatedAdmin.balance) < 0) {
                  this.logger.warn(
                    `Saldo admin menjadi negatif (${updatedAdmin.balance}) setelah pengembalian admin fee mitra no-show order #${order.id}`,
                  );
                }
                await tx.walletTransaction.create({
                  data: {
                    walletId: adminWallet.id,
                    orderId: order.id,
                    amount: financials.adminNet,
                    type: TransactionType.debit,
                    description: `Pengembalian Admin Fee (Mitra No-Show) #${order.id}`,
                  },
                });
              }
            } else {
              const refundSubsidy = Math.abs(financials.adminNet);
              await tx.wallet.update({
                where: { id: adminWallet.id },
                data: { balance: { increment: refundSubsidy } },
              });
              await tx.walletTransaction.create({
                data: {
                  walletId: adminWallet.id,
                  orderId: order.id,
                  amount: refundSubsidy,
                  type: TransactionType.credit,
                  description: `Pengembalian Subsidi Voucher (Mitra No-Show) #${order.id}`,
                },
              });
            }
          }
        }

        // d. Release voucher redemption
        await tx.voucherRedemption.updateMany({
          where: { orderId: order.id },
          data: { status: 'released' },
        });
      }

      // 4. Catat riwayat log checkpoint sebagai bukti
      await tx.checkpointsLog.create({
        data: {
          tripId,
          orderId: BigInt(0), // Placeholder untuk audit log trip-level
          posId: parsedPosId,
          scannedByUserId: parsedUserId,
          scanType: ScanType.checkin_origin, // Tetap catat sebagai checkin_origin tapi dengan status no_show
        },
      });

      return await tx.trip.findUnique({
        where: { id: tripId },
        include: { originPoint: true, destinationPoint: true },
      });
    });
  }

  async getManifestForPos(posId: bigint | bigint[], dateStr: string) {
    const startOfDay = new Date(`${dateStr}T00:00:00.000Z`);
    const endOfDay = new Date(`${dateStr}T23:59:59.999Z`);
    const posIdArray = Array.isArray(posId) ? posId : [posId];

    const trips = await this.prisma.trip.findMany({
      where: {
        OR: [
          { originPointId: { in: posIdArray } },
          { destinationPointId: { in: posIdArray } },
        ],
        departureDate: {
          gte: startOfDay,
          lte: endOfDay,
        },
        status: {
          in: [TripStatus.scheduled, TripStatus.in_origin_pos, TripStatus.in_transit, TripStatus.mitra_no_show],
        },
      },
      include: {
        mitra: true,
        vehicle: true,
        originPoint: true,
        destinationPoint: true,
        orders: {
          include: {
            customer: true,
            passengers: true,
          },
        },
        checkpointsLogs: {
          where: { posId: { in: posIdArray } },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: {
        departureTime: 'asc',
      },
    });

    return trips;
  }

  async processTripOnlyCheckin(
    tripId: bigint,
    posIdStr: string,
    scannedByUserIdStr: string,
    scanType: ScanType,
  ) {
    const parsedPosId = this.safeParseBigInt(posIdStr) ?? BigInt(1);
    const parsedUserId = this.safeParseBigInt(scannedByUserIdStr);

    return this.prisma.$transaction(async (tx) => {
      const newStatus =
        scanType === ScanType.checkin_origin
          ? TripStatus.in_origin_pos
          : TripStatus.arrived_dest_pos;

      const updatedTrip = await tx.trip.update({
        where: { id: tripId },
        data: { status: newStatus },
        include: { originPoint: true, destinationPoint: true, mitra: true, vehicle: true },
      });

      const log = await tx.checkpointsLog.create({
        data: {
          tripId,
          orderId: null,
          posId: parsedPosId,
          scannedByUserId: parsedUserId,
          scanType,
        },
        include: { trip: true, pos: true },
      });

      return { trip: updatedTrip, checkpoint: log };
    });
  }

  async processPassengerNoShowById(
    orderId: bigint,
    tripId: bigint,
    posId: bigint,
    operatorId: bigint,
    reason?: string,
  ) {
    const now = new Date();
    const disputeWindowHours = Number(process.env.DISPUTE_WINDOW_HOURS || '24');
    const disputeDeadline = new Date(now.getTime() + disputeWindowHours * 60 * 60 * 1000);

    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { trip: true },
      });

      if (!order) {
        throw new BadRequestException('Order tidak ditemukan');
      }

      if (order.status !== OrderStatus.paid) {
        throw new BadRequestException(
          'Penumpang no-show hanya dapat diproses untuk order dengan status paid',
        );
      }

      const seatsToRestore = order.seatsBooked || 0;
      const weightToRestore = Number(order.totalWeightKg) || 0;

      // Update order status ke no_show dengan audit fields
      const updatedOrder = await tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.no_show,
          noShowMarkedAt: now,
          noShowMarkedBy: operatorId,
          noShowReason: reason,
          disputeDeadline,
        },
      });

      // Kembalikan kuota
      await tx.trip.update({
        where: { id: tripId },
        data: {
          seatAvailable: { increment: seatsToRestore },
          remainingWeightCapacityKg: { increment: weightToRestore },
        },
      });

      // Catat audit log
      await tx.noShowAuditLog.create({
        data: {
          type: NoShowAuditType.passenger_no_show,
          orderId,
          tripId,
          posId,
          operatorId,
          reason: reason || 'Penumpang tidak datang setelah grace period',
        },
      });

      // Catat checkpoint log
      await tx.checkpointsLog.create({
        data: {
          tripId,
          orderId,
          posId,
          scannedByUserId: operatorId,
          scanType: ScanType.checkin_origin,
        },
      });

      return updatedOrder;
    });
  }

  async processMitraNoShowById(
    tripId: bigint,
    posId: bigint,
    operatorId: bigint,
    reason: string,
    evidenceUrl?: string,
  ) {
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const trip = await tx.trip.findUnique({
        where: { id: tripId },
        include: {
          orders: {
            where: {
              status: { notIn: [OrderStatus.cancelled, OrderStatus.completed, OrderStatus.no_show] },
            },
          },
        },
      });

      if (!trip) {
        throw new BadRequestException('Trip tidak ditemukan');
      }

      if (
        trip.status !== TripStatus.scheduled &&
        trip.status !== TripStatus.in_origin_pos
      ) {
        throw new BadRequestException(
          'Mitra no-show hanya dapat diproses untuk trip dengan status scheduled atau in_origin_pos',
        );
      }

      // Cek jika trip sudah melewati pos sebelumnya (multi-pos)
      // Untuk sekarang, tolak jika sudah ada checkpoint di pos lain
      const previousCheckpoints = await tx.checkpointsLog.findMany({
        where: {
          tripId,
          posId: { not: posId },
        },
      });

      if (previousCheckpoints.length > 0) {
        throw new BadRequestException(
          'Trip ini sudah melewati pos lain. Mitra no-show tidak dapat diproses. Hubungi admin untuk verifikasi.',
        );
      }

      // Process Skenario C untuk active orders:
      // Hanya customer yang sudah check-in di pos asal (checked_in_origin) yang berhak mendapat refund.
      // Customer yang belum check-in (paid) dianggap tidak hadir (no_show) sehingga tiket hangus tanpa refund.
      for (const order of trip.orders) {
        const isCustomerCheckedIn = order.status === OrderStatus.checked_in_origin;

        if (
          order.status === 'paid' ||
          order.status === 'checked_in_origin' ||
          order.escrowStatus === 'held'
        ) {
          const adminFeePercentage = Number(order.adminFeePercentage || 10);
          const financials = computeOrderFinancials({
            subtotal: (order as any).subtotal || order.totalPrice,
            totalPrice: order.totalPrice,
            discountAmount: (order as any).discountAmount,
            adminFeePercentage,
          });

          // a. Refund Customer HANYA jika customer sudah check-in di pos asal
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

          // b. Deduct Escrow from Mitra (karena mitra no show, uang ditarik dari escrow mitra)
          const mitraWallet = await tx.wallet.findUnique({
            where: { userId: trip.mitraId },
          });
          if (mitraWallet) {
            await tx.wallet.update({
              where: { id: mitraWallet.id },
              data: { heldEscrowBalance: { decrement: financials.netMitra } },
            });
            await tx.walletTransaction.create({
              data: {
                walletId: mitraWallet.id,
                orderId: order.id,
                amount: financials.netMitra,
                type: TransactionType.debit,
                description: `Penarikan Dana Escrow (Mitra No-Show) #${order.id}`,
              },
            });
          }

          // c. Deduct Admin Fee / Return Subsidy jika customer di-refund
          if (isCustomerCheckedIn) {
            const systemAdminIdEnv = process.env.SYSTEM_ADMIN_USER_ID;
            const parsedSystemAdminId = systemAdminIdEnv
              ? BigInt(systemAdminIdEnv)
              : null;
            const adminUser = parsedSystemAdminId
              ? await tx.user.findUnique({ where: { id: parsedSystemAdminId } })
              : await tx.user.findFirst({
                  where: { role: 'admin' },
                  orderBy: { id: 'asc' },
                });

            if (adminUser) {
              const adminWallet = await tx.wallet.findUnique({
                where: { userId: adminUser.id },
              });
              if (adminWallet) {
                if (financials.adminNet >= 0) {
                  if (financials.adminNet > 0) {
                    await tx.wallet.update({
                      where: { id: adminWallet.id },
                      data: { balance: { decrement: financials.adminNet } },
                    });
                    await tx.walletTransaction.create({
                      data: {
                        walletId: adminWallet.id,
                        orderId: order.id,
                        amount: financials.adminNet,
                        type: TransactionType.debit,
                        description: `Pengembalian Admin Fee (Mitra No-Show) #${order.id}`,
                      },
                    });
                  }
                } else {
                  const refundSubsidy = Math.abs(financials.adminNet);
                  await tx.wallet.update({
                    where: { id: adminWallet.id },
                    data: { balance: { increment: refundSubsidy } },
                  });
                  await tx.walletTransaction.create({
                    data: {
                      walletId: adminWallet.id,
                      orderId: order.id,
                      amount: refundSubsidy,
                      type: TransactionType.credit,
                      description: `Pengembalian Subsidi Voucher (Mitra No-Show) #${order.id}`,
                    },
                  });
                }
              }
            }
          }

          // Release voucher redemption
          await tx.voucherRedemption.updateMany({
            where: { orderId: order.id },
            data: { status: 'released' },
          });
        }

        // Update status order: checked_in_origin -> cancelled (refunded), paid -> no_show (tanpa refund)
        await tx.order.update({
          where: { id: order.id },
          data: {
            status: isCustomerCheckedIn ? OrderStatus.cancelled : OrderStatus.no_show,
            escrowStatus: EscrowStatus.refunded,
            ...(isCustomerCheckedIn
              ? {}
              : {
                  noShowMarkedAt: now,
                  noShowMarkedBy: operatorId,
                  noShowReason: 'Customer tidak hadir / check in di pos asal',
                }),
          },
        });
      }

      // Update Trip Status ke mitra_no_show dengan audit fields
      const updatedTrip = await tx.trip.update({
        where: { id: tripId },
        data: {
          status: TripStatus.mitra_no_show,
          mitraNoShowMarkedAt: now,
          mitraNoShowMarkedBy: operatorId,
          mitraNoShowReason: reason,
          mitraNoShowEvidenceUrl: evidenceUrl,
        },
      });

      // Catat audit log
      await tx.noShowAuditLog.create({
        data: {
          type: NoShowAuditType.mitra_no_show,
          tripId,
          posId,
          operatorId,
          reason,
          evidenceUrl,
        },
      });

      // Catat checkpoint log
      await tx.checkpointsLog.create({
        data: {
          tripId,
          orderId: null,
          posId,
          scannedByUserId: operatorId,
          scanType: ScanType.checkin_origin,
        },
      });

      return updatedTrip;
    });
  }
}
