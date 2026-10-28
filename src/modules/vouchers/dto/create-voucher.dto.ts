import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DiscountType, OrderType, VoucherClaimType } from '../../../generated/prisma/enums';

export class CreateVoucherDto {
  @ApiProperty({ description: 'Kode voucher unik (alfanumerik)', example: 'NEBENGHEMAT50' })
  @IsNotEmpty({ message: 'Kode voucher wajib diisi' })
  @IsString()
  @MaxLength(50)
  code: string;

  @ApiProperty({ description: 'Judul / nama promosi voucher', example: 'Diskon Spesial 50%' })
  @IsNotEmpty({ message: 'Judul voucher wajib diisi' })
  @IsString()
  @MaxLength(150)
  title: string;

  @ApiPropertyOptional({ description: 'Deskripsi lengkap voucher' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    enum: VoucherClaimType,
    description: 'Metode perolehan voucher (direct_platform atau code_redemption)',
    example: VoucherClaimType.direct_platform,
    default: VoucherClaimType.direct_platform,
  })
  @IsOptional()
  @IsEnum(VoucherClaimType)
  claimType?: VoucherClaimType;

  @ApiPropertyOptional({ enum: OrderType, description: 'Jenis order yang berlaku (null = semua)', example: OrderType.passenger })
  @IsOptional()
  @IsEnum(OrderType)
  appliesTo?: OrderType;

  @ApiProperty({ enum: DiscountType, description: 'Tipe potongan (percentage atau fixed_amount)', example: DiscountType.percentage })
  @IsNotEmpty({ message: 'Tipe diskon wajib diisi' })
  @IsEnum(DiscountType)
  discountType: DiscountType;

  @ApiProperty({ description: 'Nilai diskon (persen 1-100 atau nominal Rp)', example: 50 })
  @IsNotEmpty({ message: 'Nilai diskon wajib diisi' })
  @IsNumber()
  @Min(0.01, { message: 'Nilai diskon harus lebih besar dari 0' })
  discountValue: number;

  @ApiPropertyOptional({ description: 'Maksimal potongan dalam Rupiah jika tipe percentage', example: 25000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxDiscountAmount?: number;

  @ApiPropertyOptional({ description: 'Minimal nilai pesanan (subtotal) dalam Rupiah', example: 50000, default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minOrderAmount?: number;

  @ApiPropertyOptional({ description: 'Batas kuota total penggunaan secara global', example: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  usageLimit?: number;

  @ApiPropertyOptional({ description: 'Batas kuota penggunaan per pengguna', example: 1, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  usagePerUserLimit?: number;

  @ApiProperty({ description: 'Waktu mulai berlaku (ISO date)', example: '2026-10-27T00:00:00.000Z' })
  @IsNotEmpty({ message: 'Waktu mulai berlaku wajib diisi' })
  @IsDateString()
  validFrom: string;

  @ApiProperty({ description: 'Waktu selesai berlaku (ISO date)', example: '2026-11-27T23:59:59.000Z' })
  @IsNotEmpty({ message: 'Waktu selesai berlaku wajib diisi' })
  @IsDateString()
  validUntil: string;

  @ApiPropertyOptional({ description: 'Status aktif voucher', default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

