import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateDisbursementBankDto {
  @ApiProperty({ example: 'BCA', description: 'Kode Bank (standar kliring/gateway, misal: BCA, BNI, BRI)' })
  @IsString()
  @IsNotEmpty({ message: 'Kode bank tidak boleh kosong' })
  bankCode!: string;

  @ApiProperty({ example: 'Bank Central Asia (BCA)', description: 'Nama resmi atau tampilan bank' })
  @IsString()
  @IsNotEmpty({ message: 'Nama bank tidak boleh kosong' })
  bankName!: string;

  @ApiPropertyOptional({ example: '1234567890', description: 'Contoh format nomor rekening' })
  @IsOptional()
  @IsString()
  accountNumberSample?: string;

  @ApiPropertyOptional({ example: 'https://...', description: 'URL logo / favicon bank' })
  @IsOptional()
  @IsString()
  logoUrl?: string;

  @ApiPropertyOptional({ example: 1, description: 'Urutan tampilan dalam daftar' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(999)
  orderIndex?: number;

  @ApiPropertyOptional({ example: true, description: 'Status aktif bank' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: 'Pencairan instan 24 jam', description: 'Catatan tambahan / SLA' })
  @IsOptional()
  @IsString()
  notes?: string;
}

