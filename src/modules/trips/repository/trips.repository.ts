import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { TripStatus } from '../../../generated/prisma/enums';

@Injectable()
export class TripsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private safeParseBigInt(id: string): bigint | null {
    try {
      return BigInt(id);
    } catch {
      return null;
    }
  }

  async create(data: any) {
    return this.prisma.trip.create({
      data,
      include: {
        mitra: true,
        vehicle: true,
        originPoint: {
          include: { region: true },
        },
        destinationPoint: {
          include: { region: true },
        },
      },
    });
  }

  async findConflictingTrip(vehicleId: bigint, departureDate: Date) {
    const startOfDay = new Date(departureDate);
    startOfDay.setUTCHours(0, 0, 0, 0);

    const endOfDay = new Date(departureDate);
    endOfDay.setUTCHours(23, 59, 59, 999);

    return this.prisma.trip.findFirst({
      where: {
        vehicleId,
        OR: [
          { status: TripStatus.in_transit },
          {
            status: TripStatus.scheduled,
            departureDate: {
              gte: startOfDay,
              lte: endOfDay,
            },
          },
        ],
      },
    });
  }

  async findAll(filters: any, page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.trip.findMany({
        where: filters,
        skip,
        take: limit,
        include: {
          mitra: true,
          vehicle: true,
          originPoint: { include: { region: true } },
          destinationPoint: { include: { region: true } },
          orders: true,
        },
        orderBy: [{ departureDate: 'asc' }, { departureTime: 'asc' }],
      }),
      this.prisma.trip.count({ where: filters }),
    ]);

    return { data, total };
  }

  async findById(id: string) {
    const parsedId = this.safeParseBigInt(id);
    if (!parsedId) return null;

    return this.prisma.trip.findUnique({
      where: { id: parsedId },
      include: {
        mitra: true,
        vehicle: true,
        originPoint: {
          include: { region: true },
        },
        destinationPoint: {
          include: { region: true },
        },
      },
    });
  }

  async findByQrCode(qrCodeTrip: string) {
    return this.prisma.trip.findUnique({
      where: { qrCodeTrip },
      include: {
        originPoint: {
          include: { region: true },
        },
        destinationPoint: {
          include: { region: true },
        },
      },
    });
  }

  async update(id: string, data: any) {
    const parsedId = this.safeParseBigInt(id);
    if (!parsedId) {
      throw new BadRequestException('Format id trip tidak valid');
    }

    return this.prisma.trip.update({
      where: { id: parsedId },
      data,
      include: {
        mitra: true,
        vehicle: true,
        originPoint: {
          include: { region: true },
        },
        destinationPoint: {
          include: { region: true },
        },
      },
    });
  }
}
