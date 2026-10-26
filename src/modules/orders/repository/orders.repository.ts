import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { TripStatus, OrderStatus } from '../../../generated/prisma/enums';

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
  ) {
    const parseTripId = this.safeParseBigInt(tripId);
    const parseCustomerId = this.safeParseBigInt(customerId);

    if (!parseTripId || !parseCustomerId) {
      throw new BadRequestException(
        'Format ID trip atau customer tidak valid.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
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
          totalPrice: orderData.totalPrice,
          qrCodeTicket: orderData.qrCodeTicket,
          otpClaim: orderData.otpClaim,
          status: OrderStatus.pending_payment,
          escrowStatus: 'pending',
        },
      });

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
          itemOrders: true,
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
          },
        },
        itemOrders: true,
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
          },
        },
        customer: true,
        itemOrders: true,
      },
    });
  }

  async findByTicketQr(qrCodeTicket: string) {
    return this.prisma.order.findUnique({
      where: { qrCodeTicket },
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
