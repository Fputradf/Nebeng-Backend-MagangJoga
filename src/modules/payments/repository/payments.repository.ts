import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  EscrowStatus,
  OrderStatus,
  PaymentStatus,
  TransactionType,
  TripStatus,
} from '../../../generated/prisma/enums';

@Injectable()
export class PaymentsRepository {
  private readonly logger = new Logger(PaymentsRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  private safeParseBigInt(id: string): bigint | null {
    try {
      return BigInt(id);
    } catch {
      return null;
    }
  }

  async processCheckoutTransaction(
    orderIdStr: string,
    mitraUserIdStr: string,
    paymentGateway: string,
    transactionId: string,
    totalAmount: number,
    adminFeeAmount: number,
    netMitraAmount: number,
    isWebhook: boolean = false,
  ) {
    const parsedOrderId = this.safeParseBigInt(orderIdStr);
    const parsedMitraId = this.safeParseBigInt(mitraUserIdStr);

    if (!parsedOrderId || !parsedMitraId) {
      throw new BadRequestException('Format ID Order atau Mitra tidak valid');
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Query order awal hanya untuk mendapat tripId, tanpa mengubah apa pun
      const currentOrder = await tx.order.findUnique({
        where: { id: parsedOrderId },
        select: { id: true, tripId: true },
      });

      if (!currentOrder) {
        throw new BadRequestException('Order tidak ditemukan.');
      }

      // 2. Lock trip dengan SELECT ... FOR UPDATE
      const tripLockResult = await tx.$queryRaw<Array<{ id: bigint; status: string }>>`
        SELECT id, status FROM trips WHERE id = ${currentOrder.tripId} FOR UPDATE
      `;

      if (!tripLockResult || tripLockResult.length === 0) {
        throw new BadRequestException('Trip terkait tidak ditemukan.');
      }

      const tripStatus = tripLockResult[0].status as TripStatus;

      // 3. Baca ulang order dengan SELECT ... FOR UPDATE untuk mendapatkan snapshot terbaru
      const orderLockResult = await tx.$queryRaw<Array<{ id: bigint; status: string; escrow_status: string }>>`
        SELECT id, status, escrow_status FROM orders WHERE id = ${parsedOrderId} FOR UPDATE
      `;

      if (!orderLockResult || orderLockResult.length === 0) {
        throw new BadRequestException('Order tidak ditemukan setelah lock.');
      }

      const orderStatus = orderLockResult[0].status as string;
      const orderEscrowStatus = orderLockResult[0].escrow_status as string;

      if (!isWebhook) {
        // === JALUR CHECKOUT LANGSUNG ===
        // 4. Validasi status order dan trip tanpa mengubah data
        if (orderStatus !== 'pending_payment') {
          throw new BadRequestException(
            'Order sudah dibayar, dibatalkan, atau tidak valid untuk pembayaran.',
          );
        }

        if (tripStatus !== TripStatus.scheduled) {
          throw new BadRequestException(
            'Trip sudah dibatalkan atau sedang berjalan. Pembayaran tidak dapat diproses.',
          );
        }

        // 5. Lanjut ke logika asli: buat Payment dan proses pembayaran
        const payment = await tx.payment.create({
          data: {
            orderId: parsedOrderId,
            paymentGateway,
            transactionId,
            amount: totalAmount,
            status: PaymentStatus.success,
          },
        });

        const order = await tx.order.update({
          where: { id: parsedOrderId },
          data: {
            status: OrderStatus.paid,
            escrowStatus: EscrowStatus.held,
          },
          include: {
            trip: true,
          },
        });

        let mitraWallet = await tx.wallet.findUnique({
          where: { userId: parsedMitraId },
        });

        if (!mitraWallet) {
          mitraWallet = await tx.wallet.create({
            data: {
              userId: parsedMitraId,
              balance: 0,
              heldEscrowBalance: 0,
            },
          });
        }

        const updatedWallet = await tx.wallet.update({
          where: { id: mitraWallet.id },
          data: {
            heldEscrowBalance: { increment: netMitraAmount },
          },
        });

        await tx.walletTransaction.create({
          data: {
            walletId: updatedWallet.id,
            orderId: parsedOrderId,
            amount: netMitraAmount,
            type: TransactionType.escrow_hold,
            description: `Dana ditahan Escrow Order #${orderIdStr} (Net Mitra setelah potongan admin)`,
          },
        });

        const systemAdminIdEnv = process.env.SYSTEM_ADMIN_USER_ID;
        const parsedSystemAdminId = systemAdminIdEnv
          ? this.safeParseBigInt(systemAdminIdEnv)
          : null;

        const adminUser = parsedSystemAdminId
          ? await tx.user.findUnique({ where: { id: parsedSystemAdminId } })
          : await tx.user.findFirst({
              where: { role: 'admin' },
              orderBy: { id: 'asc' },
            });

        if (adminUser) {
          let adminWallet = await tx.wallet.findUnique({
            where: { userId: adminUser.id },
          });

          if (!adminWallet) {
            adminWallet = await tx.wallet.create({
              data: { userId: adminUser.id, balance: 0, heldEscrowBalance: 0 },
            });
          }

          await tx.wallet.update({
            where: { id: adminWallet.id },
            data: { balance: { increment: adminFeeAmount } },
          });

          await tx.walletTransaction.create({
            data: {
              walletId: adminWallet.id,
              orderId: parsedOrderId,
              amount: adminFeeAmount,
              type: TransactionType.credit,
              description: `Pendapatan Admin Fee Order #${orderIdStr}`,
            },
          });
        }

        return { payment, order };
      } else {
        // === JALUR WEBHOOK ===
        // 4. Baca Payment dengan FOR UPDATE untuk idempotensi
        const paymentLockResult = await tx.$queryRaw<Array<{ id: bigint; status: string; refund_required_at: string | null }>>`
          SELECT id, status, refund_required_at FROM payments WHERE transaction_id = ${transactionId} AND order_id = ${parsedOrderId} FOR UPDATE
        `;

        if (!paymentLockResult || paymentLockResult.length === 0) {
          throw new BadRequestException('Payment tidak ditemukan untuk transactionId ini.');
        }

        if (paymentLockResult.length > 1) {
          throw new BadRequestException('Terdapat lebih dari satu Payment untuk transactionId ini. Hubungi administrator.');
        }

        const existingPayment = paymentLockResult[0];

        // a. Payment.refundRequiredAt sudah terisi: kembalikan sukses
        if (existingPayment.refund_required_at) {
          const payment = await tx.payment.findUnique({
            where: { id: existingPayment.id },
          });
          return { payment, order: null };
        }

        // b. Payment sudah success: kembalikan sukses (replay webhook)
        if (existingPayment.status === 'success') {
          const payment = await tx.payment.findUnique({
            where: { id: existingPayment.id },
          });
          return { payment, order: null };
        }

        // c. Payment masih pending, order pending_payment, trip scheduled: jalur normal
        if (existingPayment.status === 'pending' && orderStatus === 'pending_payment' && tripStatus === TripStatus.scheduled) {
          // Jalur normal - lanjut ke kode yang sudah ada di bawah
        } else {
          // d. Selain itu: UPDATE Payment yang sudah ada
          const refundNoteRaw = `LATE_PAYMENT_REFUND_REQUIRED | orderId=${orderIdStr} | tripId=${currentOrder.tripId} | nominal=${totalAmount} | alasan=trip ${tripStatus}, order ${orderStatus}`;
          const refundNote = refundNoteRaw.length > 500 ? refundNoteRaw.substring(0, 500) : refundNoteRaw;

          await tx.payment.update({
            where: { id: existingPayment.id },
            data: {
              status: PaymentStatus.success,
              refundRequiredAt: new Date(),
              refundNote,
            },
          });

          // Order.status diubah ke cancelled HANYA kalau saat ini pending_payment
          if (orderStatus === 'pending_payment') {
            await tx.order.update({
              where: { id: parsedOrderId },
              data: {
                status: OrderStatus.cancelled,
              },
            });
          }

          this.logger.warn(
            `Webhook Xendit terlambat untuk order #${orderIdStr} di trip #${currentOrder.tripId}. PaymentId: ${existingPayment.id}, Nominal: ${totalAmount}`,
          );

          const payment = await tx.payment.findUnique({
            where: { id: existingPayment.id },
          });
          return { payment, order: null };
        }

        // Jalur normal webhook: update Payment yang sudah ada dari pending ke success
        const payment = await tx.payment.update({
          where: { id: existingPayment.id },
          data: {
            status: PaymentStatus.success,
          },
        });

        const order = await tx.order.update({
          where: { id: parsedOrderId },
          data: {
            status: OrderStatus.paid,
            escrowStatus: EscrowStatus.held,
          },
          include: {
            trip: true,
          },
        });

        let mitraWallet = await tx.wallet.findUnique({
          where: { userId: parsedMitraId },
        });

        if (!mitraWallet) {
          mitraWallet = await tx.wallet.create({
            data: {
              userId: parsedMitraId,
              balance: 0,
              heldEscrowBalance: 0,
            },
          });
        }

        const updatedWallet = await tx.wallet.update({
          where: { id: mitraWallet.id },
          data: {
            heldEscrowBalance: { increment: netMitraAmount },
          },
        });

        await tx.walletTransaction.create({
          data: {
            walletId: updatedWallet.id,
            orderId: parsedOrderId,
            amount: netMitraAmount,
            type: TransactionType.escrow_hold,
            description: `Dana ditahan Escrow Order #${orderIdStr} (Net Mitra setelah potongan admin)`,
          },
        });

        const systemAdminIdEnv = process.env.SYSTEM_ADMIN_USER_ID;
        const parsedSystemAdminId = systemAdminIdEnv
          ? this.safeParseBigInt(systemAdminIdEnv)
          : null;

        const adminUser = parsedSystemAdminId
          ? await tx.user.findUnique({ where: { id: parsedSystemAdminId } })
          : await tx.user.findFirst({
              where: { role: 'admin' },
              orderBy: { id: 'asc' },
            });

        if (adminUser) {
          let adminWallet = await tx.wallet.findUnique({
            where: { userId: adminUser.id },
          });

          if (!adminWallet) {
            adminWallet = await tx.wallet.create({
              data: { userId: adminUser.id, balance: 0, heldEscrowBalance: 0 },
            });
          }

          await tx.wallet.update({
            where: { id: adminWallet.id },
            data: { balance: { increment: adminFeeAmount } },
          });

          await tx.walletTransaction.create({
            data: {
              walletId: adminWallet.id,
              orderId: parsedOrderId,
              amount: adminFeeAmount,
              type: TransactionType.credit,
              description: `Pendapatan Admin Fee Order #${orderIdStr}`,
            },
          });
        }

        return { payment, order };
      }
    });
  }

  async getPaymentsByOperator(
    operatorUserIdStr: string,
    page: number = 1,
    limit: number = 10,
  ) {
    const parsedOperatorId = this.safeParseBigInt(operatorUserIdStr);
    if (!parsedOperatorId) {
      throw new BadRequestException('Format ID Operator tidak valid');
    }

    const assignedPos = await this.prisma.pickupPoint.findFirst({
      where: { operatorId: parsedOperatorId },
    });

    const skip = (page - 1) * limit;

    const whereCondition = {
      order: {
        trip: {
          originPoint: {
            operatorId: parsedOperatorId,
          },
        },
      },
    };

    const [payments, totalItems] = await Promise.all([
      this.prisma.payment.findMany({
        where: whereCondition,
        skip,
        take: limit,
        include: {
          order: {
            include: {
              customer: true,
              trip: {
                include: {
                  originPoint: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.payment.count({ where: whereCondition }),
    ]);

    return { payments, totalItems, assignedPos };
  }
}
