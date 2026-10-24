import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Role } from '../../../generated/prisma/enums';

@Injectable()
export class BannersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(targetRole?: Role) {
    if (targetRole) {
      return this.prisma.banner.findMany({
        where: {
          isActive: true,
          OR: [{ targetRole }, { targetRole: null }],
        },
        orderBy: { createdAt: 'desc' },
      });
    }
    return this.prisma.banner.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: bigint | number | string) {
    return this.prisma.banner.findUnique({
      where: { id: BigInt(id) },
    });
  }

  async create(data: {
    title: string;
    imageUrl: string;
    linkUrl?: string;
    isActive?: boolean;
    targetRole?: Role | null;
  }) {
    return this.prisma.banner.create({
      data,
    });
  }

  async update(
    id: bigint | number | string,
    data: {
      title?: string;
      imageUrl?: string;
      linkUrl?: string;
      isActive?: boolean;
      targetRole?: Role | null;
    },
  ) {
    return this.prisma.banner.update({
      where: { id: BigInt(id) },
      data,
    });
  }

  async delete(id: bigint | number | string) {
    return this.prisma.banner.delete({
      where: { id: BigInt(id) },
    });
  }
}
