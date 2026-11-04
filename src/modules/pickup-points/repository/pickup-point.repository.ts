import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class PickupPointRepository {
  constructor(private readonly prisma: PrismaService) {}

  private safeParseBigInt(id: string) {
    try {
      return BigInt(id);
    } catch {
      return null;
    }
  }

  async create(data: {
    regionId: bigint;
    cityId: bigint;
    operatorId?: bigint | null;
    name: string;
    address: string;
    latitude: number;
    longitude: number;
    qrCodePos: string;
  }) {
    return this.prisma.pickupPoint.create({
      data: {
        regionId: data.regionId,
        cityId: data.cityId,
        operatorId: data.operatorId ?? null,
        name: data.name.trim(),
        address: data.address.trim(),
        latitude: data.latitude,
        longitude: data.longitude,
        qrCodePos: data.qrCodePos,
      },
      include: {
        region: true,
        city: true,
        operator: true,
      },
    });
  }

  async findById(id: string) {
    const parseId = this.safeParseBigInt(id);
    if (!parseId) return null;

    return this.prisma.pickupPoint.findUnique({
      where: { id: parseId },
      include: {
        region: true,
        city: true,
        operator: true,
      },
    });
  }

  async findByQrCode(qrCodePos: string) {
    return this.prisma.pickupPoint.findUnique({
      where: { qrCodePos },
    });
  }

  async findUserById(userId: string) {
    const parseid = this.safeParseBigInt(userId);
    if (!parseid) return null;

    return this.prisma.user.findUnique({
      where: { id: parseid },
      select: { id: true, role: true, status: true, regionId: true },
    });
  }

  async findRegionById(regionId: string) {
    const parseId = this.safeParseBigInt(regionId);
    if (!parseId) return null;

    return this.prisma.region.findUnique({
      where: { id: parseId },
    });
  }

  async findCityById(cityId: string) {
    const parseId = this.safeParseBigInt(cityId);
    if (!parseId) return null;

    return this.prisma.city.findUnique({
      where: { id: parseId },
    });
  }

  async findCityByRegionName(regionName: string) {
    return this.prisma.city.findFirst({
      where: {
        OR: [
          { name: { contains: regionName } },
          { province: { contains: regionName } },
        ],
      },
    });
  }

  async findFirstCity() {
    return this.prisma.city.findFirst();
  }

  async createCity(name: string, province: string) {
    return this.prisma.city.create({
      data: { name, province },
    });
  }

  async assignOperatorRegion(operatorId: string, regionId: string) {
    const parseUserId = this.safeParseBigInt(operatorId);
    const parseRegionId = this.safeParseBigInt(regionId);
    if (!parseUserId || !parseRegionId) return;

    await this.prisma.user.update({
      where: { id: parseUserId },
      data: { regionId: parseRegionId },
    });
  }

  async findAll(regionId?: string, cityId?: string, onlyActive = false) {
    const parsedRegionId = regionId
      ? this.safeParseBigInt(regionId)
      : undefined;
    const parsedCityId = cityId ? this.safeParseBigInt(cityId) : undefined;
    return this.prisma.pickupPoint.findMany({
      where: {
        ...(parsedRegionId && { regionId: parsedRegionId }),
        ...(parsedCityId && { cityId: parsedCityId }),
        ...(onlyActive && { isActive: true }),
      },
      include: {
        region: true,
        city: true,
        operator: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  async update(
    id: string,
    data: {
      regionId?: bigint;
      cityId?: bigint;
      operatorId?: bigint | null;
      name?: string;
      address?: string;
      latitude?: number;
      longitude?: number;
      isActive?: boolean;
    },
  ) {
    const parseId = this.safeParseBigInt(id);
    if (!parseId) {
      throw new BadRequestException('Format id pos/pickup point tidak valid');
    }

    return this.prisma.pickupPoint.update({
      where: { id: parseId },
      data: {
        ...(data.regionId && { regionId: data.regionId }),
        ...(data.cityId && { cityId: data.cityId }),
        ...(data.operatorId !== undefined && { operatorId: data.operatorId }),
        ...(data.name && { name: data.name.trim() }),
        ...(data.address && { address: data.address.trim() }),
        ...(data.latitude !== undefined && { latitude: data.latitude }),
        ...(data.longitude !== undefined && { longitude: data.longitude }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
      include: {
        region: true,
        city: true,
        operator: true,
      },
    });
  }
}
