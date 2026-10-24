import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { OrdersRepository } from './repository/orders.repository';
import { TripsRepository } from '../trips/repository/trips.repository';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderMapper } from './mappers/order.mapper';
import {
  OrderType,
  OrderStatus,
  ParcelSize,
  ServiceType,
  TripStatus,
  Role,
} from '../../generated/prisma/enums';
import { randomBytes, randomInt } from 'crypto';
import { NotificationHelperService } from '../notifications/notification-helper.service';

@Injectable()
export class OrdersService {
  constructor(
    private readonly ordersRepository: OrdersRepository,
    private readonly tripsRepository: TripsRepository,
    private readonly prisma: PrismaService,
    private readonly notificationHelper: NotificationHelperService,
  ) {}

  private async generateUniqueTicketQr(): Promise<string> {
    const maxRetries = 10;
    for (let i = 0; i < maxRetries; i++) {
      const hex = randomBytes(4).toString('hex').toUpperCase();
      const qrCodeTiket = `TKT-${hex}`;
      const existing = await this.ordersRepository.findByTicketQr(qrCodeTiket);
      if (!existing) {
        return qrCodeTiket;
      }
    }
    throw new InternalServerErrorException(
      'Gagal menghasilkan Kode QR Tiket unik. Silakan coba kembali.',
    );
  }

  private safeParseBigInt(id: string): bigint {
    try {
      return BigInt(id);
    } catch {
      throw new BadRequestException(`Format ID '${id}' tidak valid`);
    }
  }

  private generateOtp(): string {
    return randomInt(100000, 999999).toString();
  }

  private getTripDepartureDateTime(
    departureDate: Date,
    departureTime: Date,
  ): Date {
    const dateStr = new Date(departureDate).toISOString().split('T')[0];
    const timeStr = new Date(departureTime).toISOString().split('T')[1];
    return new Date(`${dateStr}T${timeStr}`);
  }

  async createOrder(customerIdStr: string, dto: CreateOrderDto) {
    const trip = await this.tripsRepository.findById(dto.tripId);
    if (!trip) {
      throw new NotFoundException('Jadwal Trip tidak ditemukan.');
    }

    if (trip.mitraId.toString() === customerIdStr) {
      throw new BadRequestException(
        'Anda tidak dapat memesan tiket pada jadwal trip milik Anda sendiri.',
      );
    }

    if (trip.status !== TripStatus.scheduled) {
      throw new BadRequestException(
        'Trip ini sudah tidak menerima pemesanan baru.',
      );
    }

    const tripDepartureDateTime = this.getTripDepartureDateTime(
      trip.departureDate,
      trip.departureTime,
    );
    if (tripDepartureDateTime < new Date()) {
      throw new BadRequestException(
        'Tidak dapat memesan trip yang jam keberangkatannya telah lewat.',
      );
    }

    const existingActiveOrder = await this.prisma.order.findFirst({
      where: {
        tripId: this.safeParseBigInt(dto.tripId),
        customerId: this.safeParseBigInt(customerIdStr),
        status: {
          in: ['pending_payment', 'paid', 'checked_in_origin', 'in_transit'],
        },
      },
    });

    if (existingActiveOrder) {
      throw new BadRequestException(
        'Anda sudah memiliki pesanan aktif pada jadwal trip ini.',
      );
    }

    const regionData = trip.originPoint?.regionId
      ? await this.prisma.region.findUnique({
          where: { id: trip.originPoint.regionId },
        })
      : null;

    const regionPricePerKm = regionData?.pricePerKm
      ? Number(regionData.pricePerKm)
      : 3000;

    let seatsBooked = 0;
    let totalItemsCount = 0;
    let totalWeightKg = 0;
    let totalPrice = 0;
    let adminFeePercentage = 10;
    let otpClaim: string | null = null;
    const itemsDataProcessed: any[] = [];

    if (dto.type === OrderType.passenger) {
      const serviceType =
        trip.vehicleType === 'motor' ? ServiceType.motor : ServiceType.mobil;
      const pricingSetting = await this.prisma.pricingSetting.findFirst({
        where: { serviceType, size: null },
      });

      adminFeePercentage = pricingSetting
        ? Number(pricingSetting.adminFeePercentage)
        : 10;

      const baseFare = pricingSetting ? Number(pricingSetting.baseFare) : 5000;
      const farePerKm = pricingSetting
        ? Number(pricingSetting.farePerKm)
        : regionPricePerKm;
      const unitPrice =
        Number(trip.price) > 0 ? Number(trip.price) : baseFare + farePerKm;

      seatsBooked = dto.seatsBooked ?? 1;

      if (trip.vehicleType === 'motor' && seatsBooked > 1) {
        throw new BadRequestException(
          'Pemesanan trip motor hanya diperbolehkan maksimal 1 kursi.',
        );
      }

      if (trip.seatAvailable < seatsBooked) {
        throw new BadRequestException(
          `Sisa kursi tidak mencukupi. Tersedia: ${trip.seatAvailable}, Diminta: ${seatsBooked}`,
        );
      }

      totalPrice = unitPrice * seatsBooked;
    }

    if (dto.type === OrderType.parcel) {
      if (!dto.items || dto.items.length === 0) {
        throw new BadRequestException(
          'Item barang wajib diisi untuk pemesanan jenis Parcel.',
        );
      }

      totalItemsCount = dto.items.length;

      const defaultParcelSetting = await this.prisma.pricingSetting.findFirst({
        where: { serviceType: ServiceType.barang },
      });
      adminFeePercentage = defaultParcelSetting
        ? Number(defaultParcelSetting.adminFeePercentage)
        : 12;

      for (const item of dto.items) {
        const itemTotalWeight = item.weightPerItemKg * item.quantity;
        totalWeightKg += itemTotalWeight;

        const sizeEnum = item.sizeEnum as unknown as ParcelSize;
        const parcelPricing = await this.prisma.pricingSetting.findFirst({
          where: {
            serviceType: ServiceType.barang,
            size: sizeEnum,
          },
        });

        if (!parcelPricing) {
          throw new BadRequestException(
            `Konfigurasi tarif untuk ukuran paket ${item.sizeEnum} tidak ditemukan.`,
          );
        }

        if (
          parcelPricing.maxWeightKg &&
          item.weightPerItemKg > Number(parcelPricing.maxWeightKg)
        ) {
          throw new BadRequestException(
            `Berat item "${item.itemName}" (${item.weightPerItemKg} KG) melebihi batas maksimum untuk ukuran ${item.sizeEnum} (${parcelPricing.maxWeightKg} KG).`,
          );
        }

        const itemBaseRate = Number(parcelPricing.baseFare);
        const itemFarePerKm = Number(parcelPricing.farePerKm) || 2000;

        const singleItemPrice = (itemBaseRate + itemFarePerKm) * item.quantity;
        totalPrice += singleItemPrice;

        itemsDataProcessed.push({
          ...item,
          totalItemWeightKg: itemTotalWeight,
        });
      }

      const remainingWeight = Number(trip.remainingWeightCapacityKg);
      if (remainingWeight < totalWeightKg) {
        throw new BadRequestException(
          `Sisa kapasitas bagasi tidak mencukupi. Tersedia: ${remainingWeight} KG, Total Paket: ${totalWeightKg} KG`,
        );
      }

      otpClaim = this.generateOtp();
    }

    const qrCodeTicket = await this.generateUniqueTicketQr();

    const orderPayload = {
      type: dto.type,
      seatsBooked,
      totalItemsCount,
      totalWeightKg,
      totalPrice,
      qrCodeTicket,
      otpClaim,
      adminFeePercentage,
    };

    const order = await this.ordersRepository.createOrderWithTransaction(
      dto.tripId,
      customerIdStr,
      orderPayload,
      itemsDataProcessed,
      seatsBooked,
      totalWeightKg,
    );

    if (order) {
      await this.notificationHelper.notifyOrderCreated(
        customerIdStr,
        order.id.toString(),
        {
          origin: trip.originPoint.name,
          destination: trip.destinationPoint.name,
          departureDate: trip.departureDate,
        },
      );

      await this.notificationHelper.notifyTripBookingRequest(
        trip.mitraId.toString(),
        order.id.toString(),
        trip.mitra.name,
      );
    }

    return OrderMapper.toResponse(order);
  }

  async cancelOrder(currentUser: any, orderIdStr: string) {
    const order = await this.ordersRepository.findById(orderIdStr);
    if (!order) {
      throw new NotFoundException('Pesanan tidak ditemukan.');
    }

    const currentUserId = String(currentUser.id);
    const userRole = currentUser.role;

    if (userRole === Role.customer) {
      if (order.customerId.toString() !== currentUserId) {
        throw new ForbiddenException(
          'Anda tidak berhak membatalkan pesanan ini.',
        );
      }
      if (order.status !== 'pending_payment') {
        throw new BadRequestException(
          'Pesanan yang sudah dibayar atau berjalan tidak dapat dibatalkan secara mandiri. Silakan hubungi petugas pos.',
        );
      }
    }

    if (order.status === 'completed' || order.status === 'cancelled') {
      throw new BadRequestException(
        'Pesanan sudah selesai atau sudah dibatalkan sebelumnya.',
      );
    }

    const seatsToRestore = order.seatsBooked || 0;
    const weightToRestore = Number(order.totalWeightKg) || 0;

    return this.prisma.$transaction(async (tx) => {
      // 1. Process Refund for Paid/Escrow Orders
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
            type: 'credit', // Credit back to customer
            description: `Refund Order Dibatalkan #${order.id}`,
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
              type: 'debit',
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
                type: 'debit',
                description: `Pengembalian Admin Fee (Order Dibatalkan) #${order.id}`,
              },
            });
          }
        }
      }

      // 2. Update Order Status
      const updatedCount = await tx.order.updateMany({
        where: {
          id: order.id,
          status: { notIn: ['cancelled', 'completed'] },
        },
        data: {
          status: 'cancelled',
          escrowStatus: 'refunded',
        },
      });

      if (updatedCount.count === 0) {
        throw new BadRequestException(
          'Gagal membatalkan pesanan. Pesanan mungkin telah dibatalkan atau diselesaikan oleh proses lain.',
        );
      }

      // 3. Restore Quota
      await tx.trip.update({
        where: { id: order.tripId },
        data: {
          seatAvailable: { increment: seatsToRestore },
          remainingWeightCapacityKg: { increment: weightToRestore },
        },
      });

      const updatedOrder = await tx.order.findUnique({
        where: { id: order.id },
        include: { trip: true, itemOrders: true },
      });

      return {
        message:
          'Pesanan berhasil dibatalkan dan kuota kursi/bagasi trip telah dikembalikan.',
        order: OrderMapper.toResponse(updatedOrder),
      };
    });
  }

  async getMyOrders(customerIdStr: string) {
    const orders = await this.ordersRepository.findByCustomerId(customerIdStr);
    return OrderMapper.toResponseList(orders);
  }

  async getOrderById(currentUser: any, idStr: string) {
    const order = await this.ordersRepository.findById(idStr);
    if (!order) {
      throw new NotFoundException('Order tidak ditemukan.');
    }

    const currentUserId = String(currentUser.id);
    const userRole = currentUser.role;

    if (userRole === Role.customer) {
      if (order.customerId.toString() !== currentUserId) {
        throw new ForbiddenException(
          'Anda tidak memiliki akses ke pesanan ini.',
        );
      }
    }

    if (userRole === Role.mitra) {
      if (order.trip.mitraId.toString() !== currentUserId) {
        throw new ForbiddenException(
          'Anda hanya dapat melihat pesanan pada trip milik Anda.',
        );
      }
    }

    if (userRole === Role.regional) {
      const userRegionId = currentUser.regionId
        ? currentUser.regionId.toString()
        : null;
      const originRegionId = order.trip.originPoint?.regionId?.toString();
      const destRegionId = order.trip.destinationPoint?.regionId?.toString();

      if (
        !userRegionId ||
        (userRegionId !== originRegionId && userRegionId !== destRegionId)
      ) {
        throw new ForbiddenException(
          'Anda hanya dapat melihat pesanan di wilayah operasional Anda.',
        );
      }
    }

    return OrderMapper.toResponse(order);
  }

  async disputeNoShow(customerIdStr: string, orderIdStr: string, reason: string) {
    const order = await this.ordersRepository.findById(orderIdStr);
    if (!order) {
      throw new NotFoundException('Order tidak ditemukan');
    }

    const currentUserId = String(customerIdStr);
    if (order.customerId.toString() !== currentUserId) {
      throw new ForbiddenException(
        'Anda tidak berhak mengajukan keberatan untuk order ini.',
      );
    }

    if (order.status !== OrderStatus.no_show) {
      throw new BadRequestException(
        'Keberatan hanya dapat diajukan untuk order dengan status no_show',
      );
    }

    if (order.isDisputed) {
      throw new BadRequestException(
        'Keberatan sudah pernah diajukan untuk order ini',
      );
    }

    if (!order.disputeDeadline) {
      throw new BadRequestException(
        'Jendela keberatan tidak tersedia untuk order ini',
      );
    }

    const now = new Date();
    if (now > order.disputeDeadline) {
      throw new BadRequestException(
        'Jendela keberatan sudah berakhir. Tidak dapat mengajukan keberatan.',
      );
    }

    const updatedOrder = await this.prisma.order.update({
      where: { id: order.id },
      data: {
        isDisputed: true,
      },
    });

    // TODO: Kirim notifikasi ke admin untuk review
    // await this.notificationHelper.notifyDisputeSubmitted(...);

    return {
      message: 'Keberatan berhasil diajukan. Tim admin akan meninjau kasus Anda.',
      order: OrderMapper.toResponse(updatedOrder),
    };
  }
}
