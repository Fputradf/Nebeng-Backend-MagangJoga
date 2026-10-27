import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PickupPointRepository } from './repository/pickup-point.repository';
import { CreatePickupPointDto } from './dto/create-pickup-point.dto';
import { UpdatePickupPointDto } from './dto/update-pickup-point.dto';
import { PickupPointMapper } from './mappers/pickup-point.mapper';
import { randomBytes } from 'crypto';
import { Role } from '../../generated/prisma/enums';
import { isPointInPolygon, haversineDistance } from '../../common/utils/geo.util';

@Injectable()
export class PickupPointService {
  constructor(private readonly pickupPointRepo: PickupPointRepository) {}

  private async generateUniqueQrCodePos(): Promise<string> {
    let qrCodePos = '';
    let isUnique = false;

    while (!isUnique) {
      qrCodePos = `POS-${randomBytes(4).toString('hex').toUpperCase()}`;
      const existing = await this.pickupPointRepo.findByQrCode(qrCodePos);
      if (!existing) {
        isUnique = true;
      }
    }

    return qrCodePos;
  }

  private async validateOperatorUser(operatorIdStr: string) {
    const user = await this.pickupPointRepo.findUserById(operatorIdStr);

    if (!user) {
      throw new NotFoundException('User operator tidak ditemukan');
    }

    if (user.role !== Role.operator) {
      throw new BadRequestException(
        'User yang dipilih harus mempunyai role operator pos',
      );
    }
  }

  private async validateRegionAndCity(regionIdStr: string, cityIdStr: string) {
    const region = await this.pickupPointRepo.findRegionById(regionIdStr);
    if (!region) {
      throw new NotFoundException(
        `Region dengan ID ${regionIdStr} tidak ditemukan`,
      );
    }

    const city = await this.pickupPointRepo.findCityById(cityIdStr);
    if (!city) {
      throw new NotFoundException(
        `Kota dengan ID ${cityIdStr} tidak ditemukan`,
      );
    }
  }

  private async validateCoordinatesInRegion(
    regionIdStr: string,
    latitude: number,
    longitude: number,
  ) {
    const region = await this.pickupPointRepo.findRegionById(regionIdStr);
    if (!region) return;

    if (region.boundaryPolygon) {
      const isInside = isPointInPolygon(
        { latitude, longitude },
        region.boundaryPolygon,
      );
      if (!isInside) {
        throw new BadRequestException(
          `Koordinat Pos Resmi (${latitude}, ${longitude}) berada di luar batas poligon wilayah ${region.name}. Silakan tentukan titik pos di dalam area batas wilayah.`,
        );
      }
    } else if (region.latitude && region.longitude && region.radiusKm) {
      const distance = haversineDistance(
        Number(region.latitude),
        Number(region.longitude),
        latitude,
        longitude,
      );
      const maxRadius = Number(region.radiusKm);
      if (distance > maxRadius) {
        throw new BadRequestException(
          `Koordinat Pos Resmi berjarak ${distance.toFixed(1)} km dari pusat ${region.name}, melebihi radius batas operasional maksimum (${maxRadius} km).`,
        );
      }
    }
  }

  async create(dto: CreatePickupPointDto) {
    await this.validateRegionAndCity(dto.regionId, dto.cityId);
    await this.validateCoordinatesInRegion(
      dto.regionId,
      dto.latitude,
      dto.longitude,
    );

    if (dto.operatorId) {
      await this.validateOperatorUser(dto.operatorId);
    }

    const qrCodePos = await this.generateUniqueQrCodePos();

    const created = await this.pickupPointRepo.create({
      regionId: BigInt(dto.regionId),
      cityId: BigInt(dto.cityId),
      operatorId: dto.operatorId ? BigInt(dto.operatorId) : null,
      name: dto.name,
      address: dto.address,
      latitude: dto.latitude,
      longitude: dto.longitude,
      qrCodePos,
    });

    return PickupPointMapper.toResponse(created);
  }

  async findAll(regionId?: string, cityId?: string, onlyActive = false) {
    const list = await this.pickupPointRepo.findAll(
      regionId,
      cityId,
      onlyActive,
    );
    return list.map(PickupPointMapper.toResponse);
  }

  async findOne(id: string) {
    const pos = await this.pickupPointRepo.findById(id);
    if (!pos) {
      throw new NotFoundException('Pickup Point/Pos tidak ditemukan');
    }
    return PickupPointMapper.toResponse(pos);
  }

  async update(id: string, currentUser: any, dto: UpdatePickupPointDto) {
    const pos = await this.pickupPointRepo.findById(id);
    if (!pos) {
      throw new NotFoundException('Pickup Point/Pos tidak ditemukan');
    }

    if (
      currentUser?.role === Role.regional ||
      currentUser?.role === 'regional'
    ) {
      const adminRegionId = currentUser.regionId
        ? currentUser.regionId.toString()
        : null;
      const posRegionId = pos.regionId.toString();

      if (!adminRegionId || adminRegionId !== posRegionId) {
        throw new ForbiddenException(
          'Anda hanya berhak memperbarui Pos Resmi di wilayah Anda sendiri.',
        );
      }
    }

    if (dto.regionId || dto.cityId) {
      const targetRegionId = dto.regionId || pos.regionId.toString();
      const targetCityId = dto.cityId || pos.cityId.toString();
      await this.validateRegionAndCity(targetRegionId, targetCityId);
    }

    if (
      dto.latitude !== undefined ||
      dto.longitude !== undefined ||
      dto.regionId
    ) {
      const targetRegionId = dto.regionId || pos.regionId.toString();
      const targetLat =
        dto.latitude !== undefined ? dto.latitude : Number(pos.latitude);
      const targetLng =
        dto.longitude !== undefined ? dto.longitude : Number(pos.longitude);
      await this.validateCoordinatesInRegion(
        targetRegionId,
        targetLat,
        targetLng,
      );
    }

    if (dto.operatorId) {
      await this.validateOperatorUser(dto.operatorId);
    }

    const updated = await this.pickupPointRepo.update(id, {
      ...(dto.regionId && { regionId: BigInt(dto.regionId) }),
      ...(dto.cityId && { cityId: BigInt(dto.cityId) }),
      ...(dto.operatorId !== undefined && {
        operatorId: dto.operatorId ? BigInt(dto.operatorId) : null,
      }),
      ...(dto.name && { name: dto.name }),
      ...(dto.address && { address: dto.address }),
      ...(dto.latitude !== undefined && { latitude: dto.latitude }),
      ...(dto.longitude !== undefined && { longitude: dto.longitude }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
    });

    return PickupPointMapper.toResponse(updated);
  }
}
