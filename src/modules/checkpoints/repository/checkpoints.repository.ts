import { Injectable, BadRequestException } from '@nestjs/common';
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

@Injectable()
export class CheckpointsRepository {
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
    const parsedPosId = this.safeParseBigInt(posIdStr);
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
  ) {
    const parsedPosId = this.safeParseBigInt(posIdStr);
    const parsedUserId = this.safeParseBigInt(scannedByUserIdStr);

    if (!parsedUserId || !parsedPosId) {
      throw new BadRequestException('Format ID Pos atau ID User tidak valid');
    }

    return this.prisma.$transaction(async (tx) => {
      const platformFee = totalPrice * (adminFeePercentage / 100);
      const mitraEarnings = totalPrice - platformFee;

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
    const parsedPosId = this.safeParseBigInt(posIdStr);
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
        const totalPrice = Number(order.totalPrice);
        const adminFeePercentage = Number(order.adminFeePercentage || 10);
        const adminFeeAmount = Math.round(
          (totalPrice * adminFeePercentage) / 100,
        );
        const netMitraAmount = totalPrice - adminFeeAmount;

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
          data: { balance: { increment: totalPrice } },
        });
        await tx.walletTransaction.create({
          data: {
            walletId: customerWallet.id,
            orderId: order.id,
            amount: totalPrice,
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
            data: { heldEscrowBalance: { decrement: netMitraAmount } },
          });
          await tx.walletTransaction.create({
            data: {
              walletId: mitraWallet.id,
              orderId: order.id,
              amount: netMitraAmount,
              type: TransactionType.debit,
              description: `Pengembalian Dana Escrow (Order Dibatalkan) #${order.id}`,
            },
          });
        }

        // c. Deduct Admin Fee from System Admin
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
            await tx.wallet.update({
              where: { id: adminWallet.id },
              data: { balance: { decrement: adminFeeAmount } },
            });
            await tx.walletTransaction.create({
              data: {
                walletId: adminWallet.id,
                orderId: order.id,
                amount: adminFeeAmount,
                type: TransactionType.debit,
                description: `Pengembalian Admin Fee (Order Dibatalkan) #${order.id}`,
              },
            });
          }
        }
      }

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
    const parsedPosId = this.safeParseBigInt(posIdStr);
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
    const parsedPosId = this.safeParseBigInt(posIdStr);
    const parsedUserId = this.safeParseBigInt(scannedByUserIdStr);

    if (!parsedPosId || !parsedUserId) {
      throw new BadRequestException('Format ID Pos atau ID User tidak valid');
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Dapatkan informasi Trip dan semua Orders aktif
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

      // Validasi: Hanya bisa mitra no-show jika statusnya 'scheduled' atau 'in_origin_pos'
      if (
        trip.status !== TripStatus.scheduled &&
        trip.status !== TripStatus.in_origin_pos
      ) {
        throw new BadRequestException(
          'Mitra no-show hanya dapat diproses untuk trip dengan status scheduled atau in_origin_pos',
        );
      }

      // 2. Process Refund untuk semua active orders
      for (const order of trip.orders) {
        if (
          order.status === 'paid' ||
          order.status === 'checked_in_origin' ||
          order.escrowStatus === 'held'
        ) {
          const totalPrice = Number(order.totalPrice);
          const adminFeePercentage = Number(order.adminFeePercentage || 10);
          const adminFeeAmount = Math.round(
            (totalPrice * adminFeePercentage) / 100,
          );
          const netMitraAmount = totalPrice - adminFeeAmount;

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
            data: { balance: { increment: totalPrice } },
          });
          await tx.walletTransaction.create({
            data: {
              walletId: customerWallet.id,
              orderId: order.id,
              amount: totalPrice,
              type: TransactionType.credit,
              description: `Refund (Mitra No-Show) #${order.id}`,
            },
          });

          // b. Deduct Escrow from Mitra
          const mitraWallet = await tx.wallet.findUnique({
            where: { userId: trip.mitraId },
          });
          if (mitraWallet) {
            await tx.wallet.update({
              where: { id: mitraWallet.id },
              data: { heldEscrowBalance: { decrement: netMitraAmount } },
            });
            await tx.walletTransaction.create({
              data: {
                walletId: mitraWallet.id,
                orderId: order.id,
                amount: netMitraAmount,
                type: TransactionType.debit,
                description: `Pengembalian Dana Escrow (Mitra No-Show) #${order.id}`,
              },
            });
          }

          // c. Deduct Admin Fee from System Admin
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
              await tx.wallet.update({
                where: { id: adminWallet.id },
                data: { balance: { decrement: adminFeeAmount } },
              });
              await tx.walletTransaction.create({
                data: {
                  walletId: adminWallet.id,
                  orderId: order.id,
                  amount: adminFeeAmount,
                  type: TransactionType.debit,
                  description: `Pengembalian Admin Fee (Mitra No-Show) #${order.id}`,
                },
              });
            }
          }
        }

        // 3. Update semua orders ke cancelled
        await tx.order.update({
          where: { id: order.id },
          data: {
            status: OrderStatus.cancelled,
            escrowStatus: EscrowStatus.refunded,
          },
        });
      }

      // 4. Update Trip Status ke mitra_no_show
      const updatedTrip = await tx.trip.update({
        where: { id: tripId },
        data: {
          status: TripStatus.mitra_no_show,
        },
      });

      // 5. Catat riwayat log checkpoint
      await tx.checkpointsLog.create({
        data: {
          tripId,
          orderId: BigInt(0), // Gunakan 0 sebagai placeholder karena ini berlaku untuk semua orders
          posId: parsedPosId,
          scannedByUserId: parsedUserId,
          scanType: ScanType.checkin_origin,
        },
      });

      return updatedTrip;
    });
  }

  async getManifestForPos(posId: bigint, dateStr: string) {
    const startOfDay = new Date(`${dateStr}T00:00:00.000Z`);
    const endOfDay = new Date(`${dateStr}T23:59:59.999Z`);

    const trips = await this.prisma.trip.findMany({
      where: {
        OR: [
          { originPointId: posId },
          { destinationPointId: posId },
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
          },
        },
        checkpointsLogs: {
          where: { posId },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: {
        departureTime: 'asc',
      },
    });

    return trips;
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

      // Process refund untuk semua active orders
      for (const order of trip.orders) {
        if (
          order.status === 'paid' ||
          order.status === 'checked_in_origin' ||
          order.escrowStatus === 'held'
        ) {
          const totalPrice = Number(order.totalPrice);
          const adminFeePercentage = Number(order.adminFeePercentage || 10);
          const adminFeeAmount = Math.round(
            (totalPrice * adminFeePercentage) / 100,
          );
          const netMitraAmount = totalPrice - adminFeeAmount;

          // Refund Customer
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
            data: { balance: { increment: totalPrice } },
          });
          await tx.walletTransaction.create({
            data: {
              walletId: customerWallet.id,
              orderId: order.id,
              amount: totalPrice,
              type: TransactionType.credit,
              description: `Refund (Mitra No-Show) #${order.id}`,
            },
          });

          // Deduct Escrow from Mitra
          const mitraWallet = await tx.wallet.findUnique({
            where: { userId: trip.mitraId },
          });
          if (mitraWallet) {
            await tx.wallet.update({
              where: { id: mitraWallet.id },
              data: { heldEscrowBalance: { decrement: netMitraAmount } },
            });
            await tx.walletTransaction.create({
              data: {
                walletId: mitraWallet.id,
                orderId: order.id,
                amount: netMitraAmount,
                type: TransactionType.debit,
                description: `Pengembalian Dana Escrow (Mitra No-Show) #${order.id}`,
              },
            });
          }

          // Deduct Admin Fee from System Admin
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
              await tx.wallet.update({
                where: { id: adminWallet.id },
                data: { balance: { decrement: adminFeeAmount } },
              });
              await tx.walletTransaction.create({
                data: {
                  walletId: adminWallet.id,
                  orderId: order.id,
                  amount: adminFeeAmount,
                  type: TransactionType.debit,
                  description: `Pengembalian Admin Fee (Mitra No-Show) #${order.id}`,
                },
              });
            }
          }
        }

        // Update semua orders ke cancelled
        await tx.order.update({
          where: { id: order.id },
          data: {
            status: OrderStatus.cancelled,
            escrowStatus: EscrowStatus.refunded,
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
          orderId: BigInt(0),
          posId,
          scannedByUserId: operatorId,
          scanType: ScanType.checkin_origin,
        },
      });

      return updatedTrip;
    });
  }
}
