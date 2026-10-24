import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TrackingRepository {
  constructor(private readonly prisma: PrismaService) {}

  private safeParseBigInt(id: string): bigint | null {
    try {
      return BigInt(id);
    } catch {
      return null;
    }
  }

  async findTripById(tripIdStr: string) {
    const parsedTripId = this.safeParseBigInt(tripIdStr);
    if (!parsedTripId) return null;

    return this.prisma.trip.findUnique({
      where: { id: parsedTripId },
      select: { id: true, mitraId: true, status: true },
    });
  }

  async findTripWithDetails(tripId: bigint) {
    return this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        originPoint: true,
        destinationPoint: true,
      },
    });
  }

  async createTrackingLog(
    tripId: bigint,
    latitude: number,
    longitude: number,
    altitude?: number,
    speed?: number,
    heading?: number,
    accuracy?: number,
  ) {
    return this.prisma.tripTracking.create({
      data: {
        tripId,
        latitude,
        longitude,
        altitude,
        speed,
        heading,
        accuracy,
      },
    });
  }

  async getRecentTrackingLogs(tripId: bigint, limit = 50) {
    return this.prisma.tripTracking.findMany({
      where: { tripId },
      orderBy: { recordedAt: 'desc' },
      take: limit,
    });
  }

  async getLatestTrackingLog(tripId: bigint) {
    return this.prisma.tripTracking.findFirst({
      where: { tripId },
      orderBy: { recordedAt: 'desc' },
    });
  }

  async deleteOldTrackingLogs(cutoffDate: Date) {
    return this.prisma.tripTracking.deleteMany({
      where: {
        recordedAt: {
          lt: cutoffDate,
        },
      },
    });
  }
}
