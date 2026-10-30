import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  TripStatus,
  OrderStatus,
  OrderType,
  VoucherRedemptionStatus,
} from '../../../generated/prisma/enums';
import { calculateVoucherDiscount } from '../../vouchers/vouchers.service';

@Injectable()
export class OrdersRepository {
  constructor(private readonly prisma: PrismaService) {}

  private safeParseBigInt(id: string): bigint | null {
    try {
      return BigInt(id);
    } catch {
      return null;
    }
  }

  async createOrderWithTransaction(
    tripId: string,
    customerId: string,
    orderData: any,
    itemsData: any[],
    seatsToDeduct: number,
    weightToDeduct: number,
    passengersData?: any[],
  ) {
    const parseTripId = this.safeParseBigInt(tripId);
    const parseCustomerId = this.safeParseBigInt(customerId);

    if (!parseTripId || !parseCustomerId) {
      throw new BadRequestException(
        'Format ID trip atau customer tidak valid.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      let discountAmount = 0;
      let finalTotalPrice = Number(orderData.totalPrice);
      let voucherIdToRedeem: bigint | null = null;
      let voucherCodeToSave: string | null = null;

      if (orderData.voucherCode && String(orderData.voucherCode).trim() !== '') {
        const normalizedCode = String(orderData.voucherCode).trim().toUpperCase();

        // Kunci baris voucher secara atomik dengan SELECT ... FOR UPDATE
        const lockedVouchers: any[] = await tx.$queryRaw`
          SELECT * FROM vouchers WHERE code = ${normalizedCode} FOR UPDATE
        `;

        if (!lockedVouchers || lockedVouchers.length === 0) {
          throw new NotFoundException('Kode voucher tidak ditemukan.');
        }

        const voucher = lockedVouchers[0];

        // 1. Status aktif
        const isActive =
          voucher.is_active === true ||
          voucher.is_active === 1 ||
          voucher.isActive === true;
        if (!isActive) {
          throw new BadRequestException('Voucher ini sudah tidak aktif.');
        }

        // 2. Masa berlaku
        const now = new Date();
        const validFrom = new Date(voucher.valid_from || voucher.validFrom);
        const validUntil = new Date(voucher.valid_until || voucher.validUntil);
        if (now < validFrom) {
          throw new BadRequestException('Voucher belum dapat digunakan.');
        }
        if (now > validUntil) {
          throw new BadRequestException('Voucher sudah kedaluwarsa.');
        }

        // 2b. Jika voucher bertipe klaim kode (code_redemption), pastikan customer sudah mengklaimnya
        const claimType =
          voucher.claim_type || voucher.claimType || 'direct_platform';
        if (claimType === 'code_redemption') {
          const userClaim = await tx.userVoucher.findUnique({
            where: {
              userId_voucherId: {
                userId: BigInt(customerId),
                voucherId: BigInt(voucher.id),
              },
            },
          });
          if (!userClaim) {
            throw new BadRequestException(
              'Voucher ini memerlukan klaim kode terlebih dahulu. Silakan klaim voucher di menu Voucher Saya.',
            );
          }
        }

        // 3. appliesTo cocok order.type
        const appliesTo = voucher.applies_to || voucher.appliesTo;
        if (appliesTo && appliesTo !== orderData.type) {
          const typeLabel =
            appliesTo === OrderType.passenger
              ? 'penumpang'
              : 'pengiriman paket';
          throw new BadRequestException(
            `Voucher ini hanya berlaku untuk jenis layanan ${typeLabel}.`,
          );
        }

        // 4. subtotal >= minOrderAmount
        const minOrder = Number(
          voucher.min_order_amount ?? voucher.minOrderAmount ?? 0,
        );
        if (orderData.subtotal < minOrder) {
          throw new BadRequestException(
            `Subtotal pemesanan belum memenuhi syarat minimum voucher (minimal Rp ${minOrder.toLocaleString('id-ID')}).`,
          );
        }

        // 5. Kuota global (hitung redemption reserved + used)
        const usageLimit = voucher.usage_limit ?? voucher.usageLimit;
        if (usageLimit !== null && usageLimit !== undefined) {
          const globalUsageCount = await tx.voucherRedemption.count({
            where: {
              voucherId: BigInt(voucher.id),
              status: {
                in: [
                  VoucherRedemptionStatus.reserved,
                  VoucherRedemptionStatus.used,
                ],
              },
            },
          });
          if (globalUsageCount >= Number(usageLimit)) {
            throw new BadRequestException(
              'Kuota penggunaan voucher ini sudah habis.',
            );
          }
        }

        // 6. Batas per user (hitung redemption reserved + used)
        const usagePerUserLimit = Number(
          voucher.usage_per_user_limit ?? voucher.usagePerUserLimit ?? 1,
        );
        const userUsageCount = await tx.voucherRedemption.count({
          where: {
            voucherId: BigInt(voucher.id),
            userId: parseCustomerId,
            status: {
              in: [
                VoucherRedemptionStatus.reserved,
                VoucherRedemptionStatus.used,
              ],
            },
          },
        });
        if (userUsageCount >= usagePerUserLimit) {
          throw new BadRequestException(
            'Anda sudah mencapai batas maksimum penggunaan voucher ini.',
          );
        }

        // 7. Hitung diskon murni
        const minPayable = Number(process.env.VOUCHER_MIN_PAYABLE || 10000);
        const calculation = calculateVoucherDiscount({
          discountType: voucher.discount_type || voucher.discountType,
          discountValue: Number(
            voucher.discount_value ?? voucher.discountValue,
          ),
          maxDiscountAmount:
            voucher.max_discount_amount !== null &&
            voucher.max_discount_amount !== undefined
              ? Number(voucher.max_discount_amount)
              : voucher.maxDiscountAmount
                ? Number(voucher.maxDiscountAmount)
                : null,
          subtotal: orderData.subtotal,
          minPayable,
        });

        voucherIdToRedeem = BigInt(voucher.id);
        voucherCodeToSave = voucher.code;
        discountAmount = calculation.discountAmount;
        finalTotalPrice = calculation.totalPrice;
      }

      const updateTripResult = await tx.trip.updateMany({
        where: {
          id: parseTripId,
          status: TripStatus.scheduled,
          seatAvailable: { gte: seatsToDeduct },
          remainingWeightCapacityKg: { gte: weightToDeduct },
        },
        data: {
          seatAvailable: { decrement: seatsToDeduct },
          remainingWeightCapacityKg: { decrement: weightToDeduct },
        },
      });

      if (updateTripResult.count === 0) {
        throw new BadRequestException(
          'Pemesanan gagal: Sisa kursi/kapasitas bagasi tidak mencukupi atau status trip sudah tidak aktif.',
        );
      }

      const createdOrder = await tx.order.create({
        data: {
          tripId: parseTripId,
          customerId: parseCustomerId,
          type: orderData.type,
          seatsBooked: orderData.seatsBooked,
          totalItemsCount: orderData.totalItemsCount,
          adminFeePercentage: orderData.adminFeePercentage,
          totalWeightKg: orderData.totalWeightKg,
          subtotal: orderData.subtotal,
          discountAmount: discountAmount,
          voucherCode: voucherCodeToSave,
          totalPrice: finalTotalPrice,
          qrCodeTicket: orderData.qrCodeTicket,
          otpClaim: orderData.otpClaim,
          status: OrderStatus.pending_payment,
          escrowStatus: 'pending',
        },
      });

      if (voucherIdToRedeem) {
        await tx.voucherRedemption.create({
          data: {
            voucherId: voucherIdToRedeem,
            userId: parseCustomerId,
            orderId: createdOrder.id,
            discountAmount: discountAmount,
            status: VoucherRedemptionStatus.reserved,
          },
        });
      }

      if (itemsData && itemsData.length > 0) {
        await tx.itemOrder.createMany({
          data: itemsData.map((item) => ({
            orderId: createdOrder.id,
            itemName: item.itemName,
            itemCategory: item.itemCategory,
            quantity: item.quantity,
            weightPerItemKg: item.weightPerItemKg,
            totalItemWeightKg: item.totalItemWeightKg,
            sizeEnum: item.sizeEnum,
            photoUrl: item.photoUrl,
            recipientName: item.recipientName,
            recipientPhone: item.recipientPhone,
          })),
        });
      }

      if (passengersData && passengersData.length > 0) {
        await tx.orderPassenger.createMany({
          data: passengersData.map((p, idx) => ({
            orderId: createdOrder.id,
            name: p.name,
            phone: p.phone,
            seatNumber: p.seatNumber ?? (idx + 1),
            isContact: p.isContact ?? (idx === 0),
          })),
        });
      }

      return tx.order.findUnique({
        where: { id: createdOrder.id },
        include: {
          trip: {
            include: {
              originPoint: true,
              destinationPoint: true,
              mitra: true,
            },
          },
          customer: true,
          passengers: true,
          itemOrders: true,
          voucherRedemption: true,
        },
      });
    });
  }

  async findByCustomerId(customerId: string) {
    const parseCustomerId = this.safeParseBigInt(customerId);
    if (!parseCustomerId) return [];

    return this.prisma.order.findMany({
      where: { customerId: parseCustomerId },
      include: {
        trip: {
          include: {
            originPoint: true,
            destinationPoint: true,
            mitra: true,
            vehicle: true,
            checkpointsLogs: {
              include: {
                pos: true,
                scannedByUser: true,
              },
              orderBy: { createdAt: 'asc' },
            },
          },
        },
        itemOrders: true,
        passengers: true,
        checkpointsLogs: {
          include: {
            pos: true,
            scannedByUser: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string) {
    const parseId = this.safeParseBigInt(id);
    if (!parseId) return null;

    return this.prisma.order.findUnique({
      where: { id: parseId },
      include: {
        trip: {
          include: {
            originPoint: {
              include: {
                region: true,
              },
            },
            destinationPoint: true,
            mitra: true,
            vehicle: true,
            checkpointsLogs: {
              include: {
                pos: true,
                scannedByUser: true,
              },
              orderBy: { createdAt: 'asc' },
            },
          },
        },
        customer: true,
        passengers: true,
        itemOrders: true,
        checkpointsLogs: {
          include: {
            pos: true,
            scannedByUser: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  async findByTicketQr(qrCodeTicket: string) {
    return this.prisma.order.findUnique({
      where: { qrCodeTicket },
      include: {
        customer: true,
        passengers: true,
        trip: true,
      },
    });
  }

  async updateStatus(id: string, status: any, escrowStatus?: any) {
    const parseId = this.safeParseBigInt(id);
    if (!parseId) {
      throw new BadRequestException('Format ID order tidak valid');
    }

    return this.prisma.order.update({
      where: { id: parseId },
      data: {
        status,
        ...(escrowStatus && { escrowStatus }),
      },
      include: {
        trip: true,
        itemOrders: true,
      },
    });
  }
}
