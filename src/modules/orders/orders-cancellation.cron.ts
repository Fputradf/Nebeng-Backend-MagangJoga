import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import {
  OrderStatus,
  OrderType,
  ServiceType,
  VoucherRedemptionStatus,
  NotificationType,
} from '../../generated/prisma/enums';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class OrdersExpirationCron {
  private readonly logger = new Logger(OrdersExpirationCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Cron('*/5 * * * *')
  async handleExpiredOrders() {
    // Batalkan order pending_payment yang createdAt < sekarang - (24 jam + 5 menit)
    const threshold = new Date(Date.now() - (24 * 60 + 5) * 60 * 1000);

    const expiredOrders = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.pending_payment,
        createdAt: { lt: threshold },
      },
      select: { id: true },
      take: 100,
    });

    if (expiredOrders.length === 0) {
      return;
    }

    this.logger.log(
      `Ditemukan ${expiredOrders.length} order pending_payment kedaluwarsa untuk dibatalkan.`,
    );

    for (const expOrder of expiredOrders) {
      try {
        await this.cancelSingleExpiredOrder(expOrder.id);
      } catch (err: any) {
        this.logger.error(
          `Gagal membatalkan order kedaluwarsa #${expOrder.id}: ${err.message}`,
          err.stack,
        );
      }
    }
  }

  async cancelSingleExpiredOrder(orderId: bigint) {
    const cancelledOrderData = await this.prisma.$transaction(async (tx) => {
      // Kunci baris order dengan FOR UPDATE agar tidak bertabrakan dengan webhook pembayaran
      const lockedOrders: any[] = await tx.$queryRaw`
        SELECT id, trip_id, customer_id, type, seats_booked, total_weight_kg, status
        FROM orders
        WHERE id = ${orderId}
        FOR UPDATE
      `;

      if (!lockedOrders || lockedOrders.length === 0) {
        return null;
      }

      const lockedOrder = lockedOrders[0];

      // Batalkan HANYA jika statusnya masih pending_payment
      if (lockedOrder.status !== OrderStatus.pending_payment) {
        return null;
      }

      // 1. Update status order menjadi cancelled
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.cancelled,
        },
      });

      // 2. Kembalikan kuota kursi & bagasi
      const seatsToRestore =
        lockedOrder.type === OrderType.passenger
          ? Number(lockedOrder.seats_booked || 0)
          : 0;
      const weightToRestore = Number(lockedOrder.total_weight_kg || 0);

      const trip = await tx.trip.findUnique({
        where: { id: lockedOrder.trip_id },
        select: { id: true, serviceType: true },
      });

      if (trip) {
        const updateData: any = {};
        if (weightToRestore > 0) {
          updateData.remainingWeightCapacityKg = { increment: weightToRestore };
        }
        if (trip.serviceType !== ServiceType.barang && seatsToRestore > 0) {
          updateData.seatAvailable = { increment: seatsToRestore };
        }

        if (Object.keys(updateData).length > 0) {
          await tx.trip.update({
            where: { id: trip.id },
            data: updateData,
          });
        }
      }

      // 3. Release voucher redemption jika ada
      await tx.voucherRedemption.updateMany({
        where: { orderId },
        data: { status: VoucherRedemptionStatus.released },
      });

      return {
        orderId: lockedOrder.id,
        customerId: lockedOrder.customer_id,
      };
    });

    if (cancelledOrderData) {
      this.logger.log(
        `Order #${orderId} berhasil dibatalkan karena batas waktu pembayaran habis.`,
      );
      try {
        await this.notificationsService.sendNotification({
          userId: cancelledOrderData.customerId.toString(),
          type: NotificationType.order_cancelled,
          payload: {
            title: 'Pesanan Dibatalkan',
            body: `Pesanan #${cancelledOrderData.orderId} telah dibatalkan karena batas waktu pembayaran habis.`,
            data: { orderId: cancelledOrderData.orderId.toString() },
          },
        });
      } catch (notifErr: any) {
        this.logger.warn(
          `Gagal mengirim notifikasi pembatalan kedaluwarsa untuk order #${orderId}: ${notifErr.message}`,
        );
      }
    }
  }
}
