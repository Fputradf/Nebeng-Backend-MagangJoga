import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  VoucherClaimType,
  VoucherRedemptionStatus,
} from '../../../generated/prisma/enums';

@Injectable()
export class VouchersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAllWithRedemptionCounts() {
    const vouchers = await this.prisma.voucher.findMany({
      include: {
        redemptions: {
          select: {
            id: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return vouchers;
  }

  async findAvailableVouchers(userId?: bigint) {
    const now = new Date();
    const whereClause: any = {
      isActive: true,
      validFrom: { lte: now },
      validUntil: { gte: now },
    };

    if (userId) {
      whereClause.OR = [
        { claimType: VoucherClaimType.direct_platform },
        {
          claimType: VoucherClaimType.code_redemption,
          userVouchers: {
            some: { userId },
          },
        },
      ];
    } else {
      whereClause.claimType = VoucherClaimType.direct_platform;
    }

    return this.prisma.voucher.findMany({
      where: whereClause,
      include: {
        redemptions: {
          select: {
            id: true,
            userId: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findClaimedVoucher(userId: bigint, voucherId: bigint) {
    return this.prisma.userVoucher.findUnique({
      where: {
        userId_voucherId: {
          userId,
          voucherId,
        },
      },
    });
  }

  async claimVoucher(userId: bigint, voucherId: bigint) {
    return this.prisma.userVoucher.create({
      data: {
        userId,
        voucherId,
      },
    });
  }

  async findById(id: bigint) {
    return this.prisma.voucher.findUnique({
      where: { id },
      include: {
        redemptions: {
          select: {
            id: true,
            status: true,
          },
        },
      },
    });
  }

  async findByCode(code: string) {
    return this.prisma.voucher.findUnique({
      where: { code },
    });
  }

  async countRedemptions(
    voucherId: bigint,
    statuses: VoucherRedemptionStatus[] = [
      VoucherRedemptionStatus.reserved,
      VoucherRedemptionStatus.used,
    ],
  ): Promise<number> {
    return this.prisma.voucherRedemption.count({
      where: {
        voucherId,
        status: { in: statuses },
      },
    });
  }

  async countUserRedemptions(
    voucherId: bigint,
    userId: bigint,
    statuses: VoucherRedemptionStatus[] = [
      VoucherRedemptionStatus.reserved,
      VoucherRedemptionStatus.used,
    ],
  ): Promise<number> {
    return this.prisma.voucherRedemption.count({
      where: {
        voucherId,
        userId,
        status: { in: statuses },
      },
    });
  }

  async hasAnyRedemptions(voucherId: bigint): Promise<boolean> {
    const count = await this.prisma.voucherRedemption.count({
      where: { voucherId },
    });
    return count > 0;
  }

  async create(data: any) {
    return this.prisma.voucher.create({
      data,
    });
  }

  async update(id: bigint, data: any) {
    return this.prisma.voucher.update({
      where: { id },
      data,
    });
  }

  async updateStatus(id: bigint, isActive: boolean) {
    return this.prisma.voucher.update({
      where: { id },
      data: { isActive },
    });
  }

  async delete(id: bigint) {
    return this.prisma.voucher.delete({
      where: { id },
    });
  }
}

