import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { TripsRepository } from './repository/trips.repository';
import { VehiclesRepository } from '../vehicles/repository/vehicles.repository';
import { CreateTripDto } from './dto/create-trip.dto';
import { QueryTripDto } from './dto/query-trip.dto';
import { UpdateTripDto } from './dto/update-trip.dto';
import { TripMapper } from './mappers/trip.mapper';
import {
  TripStatus,
  VehicleType,
  VerificationStatus,
} from '../../generated/prisma/enums';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TripsService {
  constructor(
    private readonly tripsRepository: TripsRepository,
    private readonly vehiclesRepository: VehiclesRepository,
    private readonly prisma: PrismaService,
  ) {}

  private async generateUniqueTripQr(): Promise<string> {
    const maxRetries = 10;
    for (let i = 0; i < maxRetries; i++) {
      const hex = randomBytes(4).toString('hex').toUpperCase();
      const qrCodeTrip = `TRIP-${hex}`;
      const existing = await this.tripsRepository.findByQrCode(qrCodeTrip);
      if (!existing) {
        return qrCodeTrip;
      }
    }
    throw new InternalServerErrorException(
      'Gagal menghasilkan Kode QR Trip unik. Silakan coba kembali.',
    );
  }

  private safeParseBigInt(id: string): bigint {
    try {
      return BigInt(id);
    } catch {
      throw new BadRequestException(`Format ID '${id}' tidak valid`);
    }
  }

  private combineDateAndTime(
    departureDateStr: string,
    departureTimeStr: string,
  ): Date {
    const datePart = new Date(departureDateStr).toISOString().split('T')[0];
    let timePart = departureTimeStr;

    if (departureTimeStr.includes('T')) {
      timePart = new Date(departureTimeStr)
        .toISOString()
        .split('T')[1]
        .substring(0, 8);
    } else if (departureTimeStr.endsWith('Z')) {
      timePart = departureTimeStr.replace('Z', '');
    }

    const combined = new Date(`${datePart}T${timePart}`);
    if (isNaN(combined.getTime())) {
      throw new BadRequestException(
        'Format tanggal atau jam keberangkatan tidak valid.',
      );
    }
    return combined;
  }

  async createTrip(userIdStr: string, dto: CreateTripDto) {
    const parsedUserId: string = userIdStr;
    if (!parsedUserId || parsedUserId === 'undefined') {
      throw new ForbiddenException(
        'Sesi user tidak valid. Silakan login kembali.',
      );
    }

    const user =
      await this.vehiclesRepository.findUserVerificationStatus(parsedUserId);

    if (!user) {
      throw new NotFoundException(
        `User dengan ID ${parsedUserId} tidak ditemukan.`,
      );
    }

    if (user.statusVerification !== VerificationStatus.approved) {
      throw new ForbiddenException(
        'Hanya Mitra terverifikasi (approved) yang dapat membuat jadwal trip.',
      );
    }

    const vehicle = await this.vehiclesRepository.findById(dto.vehicleId);
    if (!vehicle) {
      throw new NotFoundException('Kendaraan tidak ditemukan.');
    }

    if (vehicle.userId.toString() !== parsedUserId) {
      throw new ForbiddenException('Kendaraan ini bukan milik Anda.');
    }

    if (dto.originPointId === dto.destinationPointId) {
      throw new BadRequestException(
        'Pos Asal dan Pos Tujuan tidak boleh sama.',
      );
    }

    const departureCombinedDate = this.combineDateAndTime(
      dto.departureDate,
      dto.departureTime,
    );
    const now = new Date();

    if (departureCombinedDate < now) {
      throw new BadRequestException(
        'Waktu keberangkatan tidak boleh di masa lalu.',
      );
    }

    const parsedVehicleId = this.safeParseBigInt(dto.vehicleId);
    const targetDepartureDate = new Date(dto.departureDate);

    const conflictingTrip = await this.tripsRepository.findConflictingTrip(
      parsedVehicleId,
      targetDepartureDate,
    );

    if (conflictingTrip) {
      throw new BadRequestException(
        'Kendaraan ini sedang aktif dalam trip lain atau sudah dijadwalkan pada tanggal yang sama.',
      );
    }

    let seatTotal = dto.totalSeats ?? vehicle.capacitySeats;
    let maxWeightKg =
      dto.maxWeightCapacityKg ?? Number(vehicle.maxWeightCapacityKg);

    if (vehicle.type === VehicleType.motor) {
      seatTotal = 1;
      if (maxWeightKg > 15) {
        maxWeightKg = 15.0;
      }
    } else {
      if (seatTotal > vehicle.capacitySeats) {
        throw new BadRequestException(
          `Jumlah kursi (${seatTotal}) melebihi kapasitas maksimal kendaraan (${vehicle.capacitySeats} kursi).`,
        );
      }
      if (maxWeightKg > Number(vehicle.maxWeightCapacityKg)) {
        throw new BadRequestException(
          `Kapasitas berat bagasi (${maxWeightKg} kg) melebihi batas kendaraan (${vehicle.maxWeightCapacityKg} kg).`,
        );
      }
    }

    const qrCodeTrip = await this.generateUniqueTripQr();

    let parsedDepartureTime: Date;
    if (dto.departureTime.includes('T')) {
      parsedDepartureTime = new Date(dto.departureTime);
    } else {
      parsedDepartureTime = new Date(`1970-01-01T${dto.departureTime}Z`);
    }

    const tripData = {
      mitraId: this.safeParseBigInt(parsedUserId),
      vehicleId: parsedVehicleId,
      originPointId: this.safeParseBigInt(dto.originPointId),
      destinationPointId: this.safeParseBigInt(dto.destinationPointId),
      vehicleType: vehicle.type,
      departureDate: targetDepartureDate,
      departureTime: parsedDepartureTime,
      price: dto.price,
      seatTotal,
      seatAvailable: seatTotal,
      maxWeightCapacityKg: maxWeightKg,
      remainingWeightCapacityKg: maxWeightKg,
      qrCodeTrip,
      serviceType: dto.serviceType,
      status: TripStatus.scheduled,
    };

    const trip = await this.tripsRepository.create(tripData);
    return TripMapper.toResponse(trip);
  }

  async getTrips(query: QueryTripDto, currentUserIdStr?: string) {
    const filters: any = {};

    if (query.status) {
      filters.status = query.status;
    }

    if (query.date) {
      const cleanDateStr = query.date.split('T')[0];
      const startOfDay = new Date(`${cleanDateStr}T00:00:00.000Z`);
      const endOfDay = new Date(`${cleanDateStr}T23:59:59.999Z`);

      filters.departureDate = {
        gte: startOfDay,
        lte: endOfDay,
      };
    }

    if (query.search) {
      filters.OR = [
        {
          originPoint: {
            name: { contains: query.search, mode: 'insensitive' },
          },
        },
        {
          destinationPoint: {
            name: { contains: query.search, mode: 'insensitive' },
          },
        },
        {
          originPoint: {
            region: { name: { contains: query.search, mode: 'insensitive' } },
          },
        },
        {
          destinationPoint: {
            region: { name: { contains: query.search, mode: 'insensitive' } },
          },
        },
      ];
    }

    if (query.originPointId) {
      filters.originPointId = this.safeParseBigInt(query.originPointId);
    }
    if (query.destinationPointId) {
      filters.destinationPointId = this.safeParseBigInt(
        query.destinationPointId,
      );
    }

    if (query.posId) {
      const posIdBigInt = this.safeParseBigInt(query.posId);
      filters.OR = [
        { originPointId: posIdBigInt },
        { destinationPointId: posIdBigInt },
      ];
    }

    if (query.regionId) {
      const regionIdBigInt = this.safeParseBigInt(query.regionId);
      filters.AND = filters.AND || [];
      filters.AND.push({
        OR: [
          { originPoint: { regionId: regionIdBigInt } },
          { destinationPoint: { regionId: regionIdBigInt } },
        ],
      });
    }

    if (query.vehicleType) {
      filters.vehicleType = query.vehicleType;
    }

    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;

    const { data: trips, total } = await this.tripsRepository.findAll(
      filters,
      page,
      limit,
    );
    const bookedTripIds = new Set<string>();

    if (currentUserIdStr) {
      const userOrders = await this.prisma.order.findMany({
        where: {
          customerId: this.safeParseBigInt(currentUserIdStr),
          status: { notIn: ['cancelled'] },
        },
        select: { tripId: true },
      });
      userOrders.forEach((o) => bookedTripIds.add(o.tripId.toString()));
    }

    const mappedTrips = TripMapper.toResponseList(trips) as any[];
    const responseList = mappedTrips.map((trip) => ({
      ...trip,
      isBookedByMe: bookedTripIds.has(trip.id),
    }));

    return {
      data: responseList,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getTripsByMitra(mitraIdStr: string, query: QueryTripDto) {
    const parsedMitraId = this.safeParseBigInt(mitraIdStr);

    const filters: any = {
      mitraId: parsedMitraId,
    };

    if (query.activeEscrow === 'true') {
      filters.status = {
        in: ['scheduled', 'in_origin_pos', 'in_transit', 'arrived_dest_pos'],
      };
    } else if (query.status) {
      filters.status = query.status;
    } else {
      filters.status = {
        in: ['scheduled', 'in_transit', 'completed'],
      };
    }

    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;

    const { data: trips, total } = await this.tripsRepository.findAll(
      filters,
      page,
      limit,
    );

    return {
      data: TripMapper.toResponseList(trips),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getTripById(idStr: string) {
    const trip = await this.tripsRepository.findById(idStr);
    if (!trip) {
      throw new NotFoundException('Trip tidak ditemukan.');
    }
    return TripMapper.toResponse(trip);
  }

  async updateTrip(idStr: string, userIdStr: string, dto: UpdateTripDto) {
    const trip = await this.tripsRepository.findById(idStr);
    if (!trip) {
      throw new NotFoundException('Trip tidak ditemukan.');
    }

    if (trip.mitraId.toString() !== userIdStr) {
      throw new ForbiddenException(
        'Anda tidak berhak mengubah trip orang lain.',
      );
    }

    const updateData: any = {};

    if (dto.status) {
      if (
        dto.status === TripStatus.in_transit ||
        dto.status === TripStatus.completed ||
        dto.status === TripStatus.arrived_dest_pos
      ) {
        throw new BadRequestException(
          'Perubahan status Trip menjadi In-Transit atau Completed hanya dapat dilakukan via QR Checkpoint Scanner Operator Pos.',
        );
      }

      if (dto.status === TripStatus.cancelled) {
        const tripIdBigInt = this.safeParseBigInt(idStr);
        const activeOrders = await this.prisma.order.findMany({
          where: {
            tripId: tripIdBigInt,
            status: { notIn: ['cancelled', 'completed'] },
          },
        });

        if (activeOrders.length > 0) {
          // Perform emergency cancellation and refund all passengers
          await this.prisma.$transaction(async (tx) => {
            for (const order of activeOrders) {
              if (
                order.status === 'paid' ||
                order.status === 'checked_in_origin' ||
                order.escrowStatus === 'held'
              ) {
                const totalPrice = Number(order.totalPrice);
                const adminFeePercentage = Number(
                  order.adminFeePercentage || 10,
                );
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
                    type: 'credit',
                    description: `Refund (Trip Dibatalkan Mitra) #${order.id}`,
                  },
                });

                // Deduct Escrow
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
                      type: 'debit',
                      description: `Pengembalian Dana Escrow (Trip Dibatalkan) #${order.id}`,
                    },
                  });
                }

                // Deduct Admin Fee
                const sysAdminEnv = process.env.SYSTEM_ADMIN_USER_ID;
                const adminId = sysAdminEnv ? BigInt(sysAdminEnv) : null;
                const adminUser = adminId
                  ? await tx.user.findUnique({ where: { id: adminId } })
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
                        description: `Pengembalian Admin Fee (Trip Dibatalkan) #${order.id}`,
                      },
                    });
                  }
                }
              }
            }

            // Update all active orders to cancelled
            await tx.order.updateMany({
              where: {
                tripId: tripIdBigInt,
                status: { notIn: ['cancelled', 'completed'] },
              },
              data: { status: 'cancelled', escrowStatus: 'refunded' },
            });
          });
        }
      }

      updateData.status = dto.status;
    }

    const targetDateStr =
      dto.departureDate ?? trip.departureDate.toISOString().split('T')[0];
    const targetTimeStr = dto.departureTime ?? trip.departureTime.toISOString();

    if (dto.departureDate || dto.departureTime) {
      const combinedDate = this.combineDateAndTime(
        targetDateStr,
        targetTimeStr,
      );
      if (combinedDate < new Date()) {
        throw new BadRequestException(
          'Waktu keberangkatan tidak boleh diubah ke masa lalu.',
        );
      }
    }

    if (dto.departureDate) {
      updateData.departureDate = new Date(dto.departureDate);
    }
    if (dto.departureTime) {
      updateData.departureTime = new Date(dto.departureTime);
    }

    const updated = await this.tripsRepository.update(idStr, updateData);
    return TripMapper.toResponse(updated);
  }
}
