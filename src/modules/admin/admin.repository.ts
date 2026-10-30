import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  UserStatus,
  TransactionType,
  OrderStatus,
  TripStatus,
  VerificationStatus,
  ServiceType,
  ParcelSize,
} from '../../generated/prisma/enums';
import { UpdatePricingPolicyDto } from './dto/update-pricing-policy.dto';

@Injectable()
export class AdminRepository {
  constructor(private readonly prisma: PrismaService) {}

  private safeParseBigInt(id: string): bigint | null {
    try {
      return BigInt(id);
    } catch {
      return null;
    }
  }

  async getGlobalAnalytics() {
    const [
      paidOrdersAggregate,
      activeTripsCount,
      totalTransactionsCount,
      regionalSummary,
    ] = await Promise.all([
      this.prisma.order.aggregate({
        where: {
          status: {
            in: [
              OrderStatus.paid,
              OrderStatus.completed,
              OrderStatus.in_transit,
              OrderStatus.arrived_destination,
            ],
          },
        },
        _sum: {
          totalPrice: true,
          discountAmount: true,
        },
      }),
      this.prisma.trip.count({
        where: {
          status: {
            in: [
              TripStatus.scheduled,
              TripStatus.in_transit,
              TripStatus.in_origin_pos,
            ],
          },
        },
      }),
      this.prisma.order.count(),
      this.prisma.region.findMany({
        where: { isActive: true },
        include: {
          _count: {
            select: {
              pickupPoints: true,
              users: true,
            },
          },
        },
      }),
    ]);

    const totalRevenue = Number(paidOrdersAggregate._sum.totalPrice || 0);
    const totalDiscount = Number(paidOrdersAggregate._sum.discountAmount || 0);
    const platformCommission = totalRevenue * 0.1;

    return {
      totalRevenue,
      totalDiscount,
      platformCommission,
      activeTripsCount,
      totalTransactionsCount,
      regionalSummary,
    };
  }

  async getAllPricingSettings() {
    const settings = await this.prisma.pricingSetting.findMany();

    return settings.map((setting) => ({
      id: setting.id.toString(),
      serviceType: setting.serviceType,
      size: setting.size,
      baseFare: Number(setting.baseFare),
      farePerKm: Number(setting.farePerKm),
      farePerKg: setting.farePerKg ? Number(setting.farePerKg) : null,
      maxWeightKg: setting.maxWeightKg ? Number(setting.maxWeightKg) : null,
      adminFeePercentage: Number(setting.adminFeePercentage),
    }));
  }

  async updatePricingPolicy(dto: UpdatePricingPolicyDto) {
    const existingMotor = await this.prisma.pricingSetting.findFirst({
      where: { serviceType: ServiceType.motor, size: null },
    });

    if (existingMotor) {
      await this.prisma.pricingSetting.update({
        where: { id: existingMotor.id },
        data: {
          baseFare: dto.motorBaseFare,
          farePerKm: dto.motorPerKm,
          farePerKg: null,
          maxWeightKg: null,
          adminFeePercentage: dto.rideFeePercent,
        },
      });
    } else {
      await this.prisma.pricingSetting.create({
        data: {
          serviceType: ServiceType.motor,
          size: null as any,
          baseFare: dto.motorBaseFare,
          farePerKm: dto.motorPerKm,
          farePerKg: null,
          maxWeightKg: null,
          adminFeePercentage: dto.rideFeePercent,
        },
      });
    }

    const existingMobil = await this.prisma.pricingSetting.findFirst({
      where: { serviceType: ServiceType.mobil, size: null },
    });

    if (existingMobil) {
      await this.prisma.pricingSetting.update({
        where: { id: existingMobil.id },
        data: {
          baseFare: dto.carBaseFare,
          farePerKm: dto.carPerKm,
          farePerKg: null,
          maxWeightKg: null,
          adminFeePercentage: dto.rideFeePercent,
        },
      });
    } else {
      await this.prisma.pricingSetting.create({
        data: {
          serviceType: ServiceType.mobil,
          size: null as any,
          baseFare: dto.carBaseFare,
          farePerKm: dto.carPerKm,
          farePerKg: null,
          maxWeightKg: null,
          adminFeePercentage: dto.rideFeePercent,
        },
      });
    }

    const sizeMapping: Record<string, ParcelSize> = {
      XXS: ParcelSize.xxs,
      XS: ParcelSize.xs,
      S: ParcelSize.s,
      M: ParcelSize.m,
      L: ParcelSize.l,
      XL: ParcelSize.xl,
    };

    await this.prisma.pricingSetting.deleteMany({
      where: { serviceType: ServiceType.barang },
    });

    const parcelDataToCreate = dto.parcelMatrix.map((item) => {
      const parcelSizeEnum = sizeMapping[item.size];

      if (!parcelSizeEnum) {
        throw new BadRequestException(
          `Ukuran parcel tidak valid: ${item.size}`,
        );
      }

      return {
        serviceType: ServiceType.barang,
        size: parcelSizeEnum,
        baseFare: item.baseRate,
        farePerKm: 2000,
        farePerKg: null,
        maxWeightKg: item.maxWeightKg,
        adminFeePercentage: dto.parcelFeePercent,
      };
    });

    await this.prisma.pricingSetting.createMany({
      data: parcelDataToCreate,
    });
  }

  async getRegionalAnalytics(regionIdStr: string) {
    const parsedRegionId = this.safeParseBigInt(regionIdStr);
    if (!parsedRegionId) {
      throw new BadRequestException(
        'Format ID Wilayah (Region ID) tidak valid',
      );
    }

    const region = await this.prisma.region.findUnique({
      where: { id: parsedRegionId },
    });

    const [
      activePosCount,
      departedTripsCount,
      arrivedTripsCount,
      pendingVerificationsCount,
    ] = await Promise.all([
      this.prisma.pickupPoint.count({
        where: { regionId: parsedRegionId, isActive: true },
      }),
      this.prisma.trip.count({
        where: {
          originPoint: { regionId: parsedRegionId },
          status: {
            in: [TripStatus.in_transit, TripStatus.completed],
          },
        },
      }),
      this.prisma.trip.count({
        where: {
          destinationPoint: { regionId: parsedRegionId },
          status: { in: [TripStatus.completed, TripStatus.arrived_dest_pos] },
        },
      }),
      this.prisma.verification.count({
        where: {
          user: { regionId: parsedRegionId },
          status: VerificationStatus.pending,
        },
      }),
    ]);

    return {
      regionName: region ? region.name : 'Unknown Region',
      activePosCount,
      departedTripsCount,
      arrivedTripsCount,
      pendingVerificationsCount,
    };
  }

  async getEscrowLedger(page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const [
      heldAggregate,
      releasedAggregate,
      recentTransactions,
      totalTransactions,
    ] = await Promise.all([
      this.prisma.wallet.aggregate({
        _sum: { heldEscrowBalance: true },
      }),
      this.prisma.walletTransaction.aggregate({
        where: { type: TransactionType.escrow_release },
        _sum: { amount: true },
      }),
      this.prisma.walletTransaction.findMany({
        where: {
          type: {
            in: [TransactionType.escrow_hold, TransactionType.escrow_release],
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: skip,
        take: limit,
      }),
      this.prisma.walletTransaction.count({
        where: {
          type: {
            in: [TransactionType.escrow_hold, TransactionType.escrow_release],
          },
        },
      }),
    ]);

    return {
      totalHeldEscrow: Number(heldAggregate._sum.heldEscrowBalance || 0),
      totalReleasedEscrow: Number(releasedAggregate._sum.amount || 0),
      pagination: {
        totalData: totalTransactions,
        currentPage: page,
        totalPages: Math.ceil(totalTransactions / limit) || 1,
        limit: limit,
      },
      recentTransactions,
    };
  }

  async updateRegionPriceRate(regionIdStr: string, pricePerKm: number) {
    const parsedRegionId = this.safeParseBigInt(regionIdStr);
    if (!parsedRegionId) {
      throw new BadRequestException(
        'Format ID Wilayah (Region ID) tidak valid',
      );
    }

    const region = await this.prisma.region.findUnique({
      where: { id: parsedRegionId },
    });

    if (!region) return null;

    return this.prisma.region.update({
      where: { id: parsedRegionId },
      data: { pricePerKm },
    });
  }

  async updatePlatformCommissionRate(percentage: number) {
    await this.prisma.pricingSetting.updateMany({
      data: { adminFeePercentage: percentage },
    });

    return percentage;
  }

  async updateUserStatus(userIdStr: string, status: UserStatus) {
    const parsedUserId = this.safeParseBigInt(userIdStr);
    if (!parsedUserId) {
      throw new BadRequestException('Format ID User tidak valid');
    }

    return this.prisma.user.update({
      where: { id: parsedUserId },
      data: { status },
    });
  }

  async findUserById(userIdStr: string) {
    const parsedUserId = this.safeParseBigInt(userIdStr);
    if (!parsedUserId) return null;

    return this.prisma.user.findUnique({
      where: { id: parsedUserId },
    });
  }
}
