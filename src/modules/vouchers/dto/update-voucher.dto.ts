import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { DiscountType, OrderType, VoucherClaimType } from '../../../generated/prisma/enums';

export class UpdateVoucherDto {
  @ApiPropertyOptional({ description: 'Kode voucher unik (alfanumerik)' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  code?: string;

  @ApiPropertyOptional({ description: 'Judul / nama promosi voucher' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  title?: string;

  @ApiPropertyOptional({ description: 'Deskripsi lengkap voucher' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    enum: VoucherClaimType,
    description: 'Metode perolehan voucher (direct_platform atau code_redemption)',
  })
  @IsOptional()
  @IsEnum(VoucherClaimType)
  claimType?: VoucherClaimType;

  @ApiPropertyOptional({ enum: OrderType, description: 'Jenis order yang berlaku (null = semua)' })
  @IsOptional()
  @IsEnum(OrderType)
  appliesTo?: OrderType | null;

  @ApiPropertyOptional({ enum: DiscountType, description: 'Tipe potongan' })
  @IsOptional()
  @IsEnum(DiscountType)
  discountType?: DiscountType;

  @ApiPropertyOptional({ description: 'Nilai diskon' })
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  discountValue?: number;

  @ApiPropertyOptional({ description: 'Maksimal potongan dalam Rupiah' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxDiscountAmount?: number | null;

  @ApiPropertyOptional({ description: 'Minimal nilai pesanan (subtotal) dalam Rupiah' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minOrderAmount?: number;

  @ApiPropertyOptional({ description: 'Batas kuota total penggunaan secara global' })
  @IsOptional()
  @IsInt()
  @Min(1)
  usageLimit?: number | null;

  @ApiPropertyOptional({ description: 'Batas kuota penggunaan per pengguna' })
  @IsOptional()
  @IsInt()
  @Min(1)
  usagePerUserLimit?: number;

  @ApiPropertyOptional({ description: 'Waktu mulai berlaku (ISO date)' })
  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @ApiPropertyOptional({ description: 'Waktu selesai berlaku (ISO date)' })
  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @ApiPropertyOptional({ description: 'Status aktif voucher' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

