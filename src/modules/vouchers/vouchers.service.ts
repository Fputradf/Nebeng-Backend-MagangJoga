import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { VouchersRepository } from './repository/vouchers.repository';
import { CreateVoucherDto } from './dto/create-voucher.dto';
import { UpdateVoucherDto } from './dto/update-voucher.dto';
import { ValidateVoucherDto } from './dto/validate-voucher.dto';
import { VoucherMapper } from './mappers/voucher.mapper';
import {
  DiscountType,
  OrderType,
  VoucherRedemptionStatus,
} from '../../generated/prisma/enums';

export function calculateVoucherDiscount(params: {
  discountType: DiscountType;
  discountValue: number;
  maxDiscountAmount?: number | null;
  subtotal: number;
  minPayable?: number;
}): { discountAmount: number; totalPrice: number } {
  const { discountType, discountValue, maxDiscountAmount, subtotal } = params;
  const minPayable =
    params.minPayable !== undefined ? params.minPayable : 10000;

  let rawDiscount = 0;
  if (discountType === DiscountType.percentage) {
    rawDiscount = Math.round((subtotal * Number(discountValue)) / 100);
    if (
      maxDiscountAmount !== null &&
      maxDiscountAmount !== undefined &&
      Number(maxDiscountAmount) > 0
    ) {
      rawDiscount = Math.min(rawDiscount, Number(maxDiscountAmount));
    }
  } else {
    rawDiscount = Math.round(Number(discountValue));
  }

  // diskon = min(diskon, subtotal - VOUCHER_MIN_PAYABLE)
  const maxAllowableDiscount = Math.max(0, subtotal - minPayable);
  const discountAmount = Math.min(rawDiscount, maxAllowableDiscount);
  const totalPrice = Math.max(0, subtotal - discountAmount);

  return { discountAmount, totalPrice };
}

@Injectable()
export class VouchersService {
  constructor(
    private readonly vouchersRepository: VouchersRepository,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  private safeParseBigInt(id: string): bigint | null {
    try {
      return BigInt(id);
    } catch {
      return null;
    }
  }

  /**
   * Validasi voucher berurutan sesuai keputusan desain:
   * 1. kode ada & isActive
   * 2. dalam masa berlaku
   * 3. appliesTo cocok order.type
   * 4. subtotal >= minOrderAmount
   * 5. kuota global (hitung redemption reserved+used)
   * 6. batas per user
   */
  async validateVoucherForOrder(
    code: string,
    orderType: OrderType,
    subtotal: number,
    userId?: string | bigint,
    tx?: any,
  ) {
    const normalizedCode = code.trim().toUpperCase();
    const prismaClient = tx || this.prisma;

    // 1. kode ada & isActive
    const voucher = await prismaClient.voucher.findUnique({
      where: { code: normalizedCode },
    });

    if (!voucher) {
      throw new NotFoundException('Kode voucher tidak ditemukan.');
    }

    if (!voucher.isActive) {
      throw new BadRequestException('Voucher ini sudah tidak aktif.');
    }

    // 2. dalam masa berlaku
    const now = new Date();
    if (now < new Date(voucher.validFrom)) {
      throw new BadRequestException('Voucher belum dapat digunakan.');
    }
    if (now > new Date(voucher.validUntil)) {
      throw new BadRequestException('Voucher sudah kedaluwarsa.');
    }

    // 3. appliesTo cocok order.type
    if (voucher.appliesTo && voucher.appliesTo !== orderType) {
      const typeLabel =
        voucher.appliesTo === OrderType.passenger
          ? 'penumpang'
          : 'pengiriman paket';
      throw new BadRequestException(
        `Voucher ini hanya berlaku untuk jenis layanan ${typeLabel}.`,
      );
    }

    // 4. subtotal >= minOrderAmount
    const minOrder = Number(voucher.minOrderAmount || 0);
    if (subtotal < minOrder) {
      throw new BadRequestException(
        `Total pemesanan belum memenuhi syarat minimum voucher (minimal Rp ${minOrder.toLocaleString('id-ID')}).`,
      );
    }

    // 5. kuota global (hitung redemption reserved+used)
    if (voucher.usageLimit !== null && voucher.usageLimit !== undefined) {
      const globalUsageCount = await prismaClient.voucherRedemption.count({
        where: {
          voucherId: voucher.id,
          status: {
            in: [
              VoucherRedemptionStatus.reserved,
              VoucherRedemptionStatus.used,
            ],
          },
        },
      });

      if (globalUsageCount >= voucher.usageLimit) {
        throw new BadRequestException('Kuota penggunaan voucher ini sudah habis.');
      }
    }

    // 6. batas per user
    if (userId) {
      const parsedUserId = BigInt(userId.toString());
      const userUsageCount = await prismaClient.voucherRedemption.count({
        where: {
          voucherId: voucher.id,
          userId: parsedUserId,
          status: {
            in: [
              VoucherRedemptionStatus.reserved,
              VoucherRedemptionStatus.used,
            ],
          },
        },
      });

      if (userUsageCount >= voucher.usagePerUserLimit) {
        throw new BadRequestException(
          'Anda sudah mencapai batas maksimum penggunaan voucher ini.',
        );
      }
    }

    const minPayable = Number(
      this.configService.get<number>('VOUCHER_MIN_PAYABLE', 10000),
    );

    const calculation = calculateVoucherDiscount({
      discountType: voucher.discountType,
      discountValue: Number(voucher.discountValue),
      maxDiscountAmount: voucher.maxDiscountAmount
        ? Number(voucher.maxDiscountAmount)
        : null,
      subtotal,
      minPayable,
    });

    return {
      voucher,
      discountAmount: calculation.discountAmount,
      totalPrice: calculation.totalPrice,
    };
  }

  // --- CUSTOMER API ---
  async previewValidation(userIdStr: string, dto: ValidateVoucherDto) {
    const result = await this.validateVoucherForOrder(
      dto.code,
      dto.orderType,
      Number(dto.subtotal),
      userIdStr,
    );

    return {
      valid: true,
      voucher: {
        code: result.voucher.code,
        title: result.voucher.title,
        discountType: result.voucher.discountType,
        discountValue: Number(result.voucher.discountValue),
        maxDiscountAmount: result.voucher.maxDiscountAmount
          ? Number(result.voucher.maxDiscountAmount)
          : null,
      },
      discountAmount: result.discountAmount,
      totalPrice: result.totalPrice,
    };
  }

  // --- ADMIN APIS ---
  async getAllVouchers() {
    const vouchers = await this.vouchersRepository.findAllWithRedemptionCounts();
    return VoucherMapper.toResponseList(vouchers);
  }

  async createVoucher(dto: CreateVoucherDto) {
    const normalizedCode = dto.code.trim().toUpperCase();

    if (new Date(dto.validFrom) >= new Date(dto.validUntil)) {
      throw new BadRequestException(
        'Waktu mulai berlaku harus lebih awal dari waktu berakhir.',
      );
    }

    if (
      dto.discountType === DiscountType.percentage &&
      (dto.discountValue < 1 || dto.discountValue > 100)
    ) {
      throw new BadRequestException(
        'Nilai persentase diskon harus di antara 1 dan 100.',
      );
    }

    const existing = await this.vouchersRepository.findByCode(normalizedCode);
    if (existing) {
      throw new BadRequestException(
        `Kode voucher '${normalizedCode}' sudah digunakan.`,
      );
    }

    const created = await this.vouchersRepository.create({
      code: normalizedCode,
      title: dto.title.trim(),
      description: dto.description?.trim() || null,
      appliesTo: dto.appliesTo || null,
      discountType: dto.discountType,
      discountValue: dto.discountValue,
      maxDiscountAmount: dto.maxDiscountAmount ?? null,
      minOrderAmount: dto.minOrderAmount ?? 0,
      usageLimit: dto.usageLimit ?? null,
      usagePerUserLimit: dto.usagePerUserLimit ?? 1,
      validFrom: new Date(dto.validFrom),
      validUntil: new Date(dto.validUntil),
      isActive: dto.isActive !== undefined ? dto.isActive : true,
    });

    return VoucherMapper.toResponse(created);
  }

  async updateVoucher(idStr: string, dto: UpdateVoucherDto) {
    const parsedId = this.safeParseBigInt(idStr);
    if (!parsedId) {
      throw new BadRequestException('ID voucher tidak valid.');
    }

    const voucher = await this.vouchersRepository.findById(parsedId);
    if (!voucher) {
      throw new NotFoundException('Voucher tidak ditemukan.');
    }

    const hasRedemptions =
      await this.vouchersRepository.hasAnyRedemptions(parsedId);

    if (hasRedemptions) {
      if (
        dto.discountType !== undefined &&
        dto.discountType !== voucher.discountType
      ) {
        throw new BadRequestException(
          'Tipe diskon tidak dapat diubah karena voucher sudah memiliki riwayat penggunaan.',
        );
      }
      if (
        dto.discountValue !== undefined &&
        Number(dto.discountValue) !== Number(voucher.discountValue)
      ) {
        throw new BadRequestException(
          'Nilai diskon tidak dapat diubah karena voucher sudah memiliki riwayat penggunaan.',
        );
      }
      if (
        dto.appliesTo !== undefined &&
        dto.appliesTo !== voucher.appliesTo
      ) {
        throw new BadRequestException(
          'Ketentuan jenis layanan (appliesTo) tidak dapat diubah karena voucher sudah memiliki riwayat penggunaan.',
        );
      }
    }

    const updateData: any = {};

    if (dto.code !== undefined) {
      const normalizedCode = dto.code.trim().toUpperCase();
      if (normalizedCode !== voucher.code) {
        const existing = await this.vouchersRepository.findByCode(normalizedCode);
        if (existing) {
          throw new BadRequestException(
            `Kode voucher '${normalizedCode}' sudah digunakan.`,
          );
        }
        updateData.code = normalizedCode;
      }
    }

    if (dto.title !== undefined) updateData.title = dto.title.trim();
    if (dto.description !== undefined)
      updateData.description = dto.description?.trim() || null;
    if (dto.appliesTo !== undefined) updateData.appliesTo = dto.appliesTo;
    if (dto.discountType !== undefined)
      updateData.discountType = dto.discountType;

    if (dto.discountValue !== undefined) {
      const targetType = dto.discountType || voucher.discountType;
      if (
        targetType === DiscountType.percentage &&
        (dto.discountValue < 1 || dto.discountValue > 100)
      ) {
        throw new BadRequestException(
          'Nilai persentase diskon harus di antara 1 dan 100.',
        );
      }
      updateData.discountValue = dto.discountValue;
    }

    if (dto.maxDiscountAmount !== undefined)
      updateData.maxDiscountAmount = dto.maxDiscountAmount;
    if (dto.minOrderAmount !== undefined)
      updateData.minOrderAmount = dto.minOrderAmount;
    if (dto.usageLimit !== undefined) updateData.usageLimit = dto.usageLimit;
    if (dto.usagePerUserLimit !== undefined)
      updateData.usagePerUserLimit = dto.usagePerUserLimit;

    if (dto.validFrom !== undefined)
      updateData.validFrom = new Date(dto.validFrom);
    if (dto.validUntil !== undefined)
      updateData.validUntil = new Date(dto.validUntil);

    const fromDate = updateData.validFrom || voucher.validFrom;
    const untilDate = updateData.validUntil || voucher.validUntil;
    if (new Date(fromDate) >= new Date(untilDate)) {
      throw new BadRequestException(
        'Waktu mulai berlaku harus lebih awal dari waktu berakhir.',
      );
    }

    if (dto.isActive !== undefined) updateData.isActive = dto.isActive;

    const updated = await this.vouchersRepository.update(parsedId, updateData);
    return VoucherMapper.toResponse(updated);
  }

  async updateVoucherStatus(idStr: string, isActive: boolean) {
    const parsedId = this.safeParseBigInt(idStr);
    if (!parsedId) {
      throw new BadRequestException('ID voucher tidak valid.');
    }

    const voucher = await this.vouchersRepository.findById(parsedId);
    if (!voucher) {
      throw new NotFoundException('Voucher tidak ditemukan.');
    }

    const updated = await this.vouchersRepository.updateStatus(
      parsedId,
      isActive,
    );
    return VoucherMapper.toResponse(updated);
  }
}

