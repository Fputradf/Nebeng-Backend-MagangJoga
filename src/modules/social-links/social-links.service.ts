import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSocialLinkDto } from './dto/create-social-link.dto';
import { UpdateSocialLinkDto } from './dto/update-social-link.dto';

@Injectable()
export class SocialLinksService {
  constructor(private readonly prisma: PrismaService) {}

  private serialize(item: any) {
    if (!item) return item;
    return {
      ...item,
      id: item.id.toString(),
    };
  }

  async findActivePublic() {
    const links = await this.prisma.socialLink.findMany({
      where: { isActive: true },
      orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }],
      take: 5,
    });
    return links.map((l) => this.serialize(l));
  }

  async findAllAdmin() {
    const links = await this.prisma.socialLink.findMany({
      orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }],
    });
    return links.map((l) => this.serialize(l));
  }

  async findOne(id: string) {
    const link = await this.prisma.socialLink.findUnique({
      where: { id: BigInt(id) },
    });
    if (!link) {
      throw new NotFoundException('Link sosial media tidak ditemukan');
    }
    return this.serialize(link);
  }

  async create(dto: CreateSocialLinkDto) {
    const shouldBeActive = dto.isActive !== false;
    if (shouldBeActive) {
      const activeCount = await this.prisma.socialLink.count({
        where: { isActive: true },
      });
      if (activeCount >= 5) {
        throw new BadRequestException(
          'Maksimal 5 tautan sosial media aktif yang dapat ditampilkan di login',
        );
      }
    }

    const created = await this.prisma.socialLink.create({
      data: {
        platform: dto.platform,
        url: dto.url,
        logoUrl: dto.logoUrl,
        iconType: dto.iconType || 'preset',
        orderIndex: dto.orderIndex ?? 0,
        isActive: shouldBeActive,
      },
    });

    return this.serialize(created);
  }

  async update(id: string, dto: UpdateSocialLinkDto) {
    const existing = await this.prisma.socialLink.findUnique({
      where: { id: BigInt(id) },
    });
    if (!existing) {
      throw new NotFoundException('Link sosial media tidak ditemukan');
    }

    if (dto.isActive === true && !existing.isActive) {
      const activeCount = await this.prisma.socialLink.count({
        where: { isActive: true },
      });
      if (activeCount >= 5) {
        throw new BadRequestException(
          'Maksimal 5 tautan sosial media aktif yang dapat ditampilkan di login',
        );
      }
    }

    const updated = await this.prisma.socialLink.update({
      where: { id: BigInt(id) },
      data: {
        ...(dto.platform !== undefined && { platform: dto.platform }),
        ...(dto.url !== undefined && { url: dto.url }),
        ...(dto.logoUrl !== undefined && { logoUrl: dto.logoUrl }),
        ...(dto.iconType !== undefined && { iconType: dto.iconType }),
        ...(dto.orderIndex !== undefined && { orderIndex: dto.orderIndex }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });

    return this.serialize(updated);
  }

  async remove(id: string) {
    await this.findOne(id);
    const deleted = await this.prisma.socialLink.delete({
      where: { id: BigInt(id) },
    });
    return this.serialize(deleted);
  }
}
