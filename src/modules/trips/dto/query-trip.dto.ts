import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import {
  TripStatus,
  VehicleType,
  ServiceType,
} from '../../../generated/prisma/enums';

export class QueryTripDto {
  @ApiPropertyOptional({
    description: 'Kata kunci pencarian (Nama Pos / Wilayah / Region)',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter ID Pos Asal' })
  @IsOptional()
  @IsString()
  originPointId?: string;

  @ApiPropertyOptional({ description: 'Filter ID Pos Tujuan' })
  @IsOptional()
  @IsString()
  destinationPointId?: string;

  @ApiPropertyOptional({ description: 'Filter ID Pos (Asal atau Tujuan)' })
  @IsOptional()
  @IsString()
  posId?: string;

  @ApiPropertyOptional({ description: 'Filter ID Region (Asal atau Tujuan)' })
  @IsOptional()
  @IsString()
  regionId?: string;

  @ApiPropertyOptional({ description: 'Filter ID Region Pos Keberangkatan / Asal' })
  @IsOptional()
  @IsString()
  originRegionId?: string;

  @ApiPropertyOptional({ description: 'Filter ID Region Pos Tujuan / Kedatangan' })
  @IsOptional()
  @IsString()
  destinationRegionId?: string;

  @ApiPropertyOptional({
    description: 'Lingkup filter region: "all" (asal/tujuan), "origin" (pos asal), atau "destination" (pos tujuan)',
  })
  @IsOptional()
  @IsString()
  scope?: string;

  @ApiPropertyOptional({ enum: TripStatus, description: 'Filter Status Trip' })
  @IsOptional()
  @IsEnum(TripStatus)
  status?: TripStatus;

  @ApiPropertyOptional({ description: 'Filter Escrow Aktif (true/false)' })
  @IsOptional()
  @IsString()
  activeEscrow?: string;

  @ApiPropertyOptional({
    enum: VehicleType,
    description: 'Filter Tipe Kendaraan',
  })
  @IsOptional()
  @IsEnum(VehicleType)
  vehicleType?: VehicleType;

  @ApiPropertyOptional({
    example: '2026-08-25',
    description: 'Filter Tanggal Keberangkatan (YYYY-MM-DD)',
  })
  @IsOptional()
  @IsString()
  date?: string;

  @ApiPropertyOptional({ example: 1, description: 'Halaman data (default: 1)' })
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({
    example: 10,
    description: 'Jumlah data per halaman (default: 10)',
  })
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional({
    enum: ServiceType,
    description: 'Filter Tipe Layanan (motor, mobil, barang)',
  })
  @IsOptional()
  @IsEnum(ServiceType)
  serviceType?: ServiceType;
}
