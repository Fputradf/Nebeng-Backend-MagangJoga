import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ScanType } from '../../../generated/prisma/enums';

export class ScanCheckpointDto {
  @ApiPropertyOptional({
    example: 'TRIP-A2D4CS13',
    description: 'Kode QR Trip milik mitra (Opsional - otomatis diambil dari tiket/order)',
  })
  @IsString()
  @IsOptional()
  qrCodeTrip?: string;

  @ApiPropertyOptional({
    example: 'TKT-SDJF12H',
    description: 'Kode QR Tiket / Parcel milik customer (Opsional jika hanya scan trip mitra)',
  })
  @IsString()
  @IsOptional()
  qrCodeTicket?: string;

  @ApiProperty({
    example: '10',
    description: 'ID pos resmi tempat operator bertugas',
  })
  @IsString()
  @IsOptional()
  posId?: string;

  @ApiProperty({ enum: ScanType, example: ScanType.checkin_origin })
  @IsEnum(ScanType)
  scanType!: ScanType;

  @ApiPropertyOptional({
    example: '8765432',
    description: 'Kode OTP 6-digit milik penerima',
  })
  @IsOptional()
  @IsString()
  otpClaim?: string;

  @ApiPropertyOptional({
    example: 'SEAL-2981312',
    description: 'Nomor stiker segel QR',
  })
  @IsOptional()
  @IsString()
  securitySealQr?: string;

  @ApiPropertyOptional({
    example: 'https://cdn.example.com/item.jpg',
    description: 'URL foto kondisi barang',
  })
  @IsOptional()
  @IsString()
  photoUrl?: string;

  @ApiPropertyOptional({
    example: 'Siti Rahma',
    description: 'Nama Penerima',
  })
  @IsOptional()
  @IsString()
  recipientName?: string;
}
