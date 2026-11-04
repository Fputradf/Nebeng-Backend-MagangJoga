import { ApiProperty } from '@nestjs/swagger';
import { ServiceType } from '../../../generated/prisma/enums';
import {
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  IsEnum,
} from 'class-validator';

export class CreateTripDto {
  @ApiProperty({ example: '1', description: 'ID Kendaraan milik Mitra' })
  @IsString()
  @IsNotEmpty()
  vehicleId!: string;

  @ApiProperty({ example: '10', description: 'ID Pos Pickup Point Asal' })
  @IsString()
  @IsNotEmpty()
  originPointId!: string;

  @ApiProperty({ example: '20', description: 'ID Pos Pickup Point Tujuan' })
  @IsString()
  @IsNotEmpty()
  destinationPointId!: string;

  @ApiProperty({
    example: '2026-08-25',
    description: 'Tanggal keberangkatan (YYYY-MM-DD)',
  })
  @IsDateString()
  departureDate!: string;

  @ApiProperty({
    example: '1970-01-01T08:00:00.000Z',
    description: 'Jam keberangkatan (ISO String / Time)',
  })
  @IsDateString()
  departureTime!: string;

  @ApiProperty({
    example: 50000,
    description: 'Harga per kursi / tiket penumpang',
  })
  @IsNumber()
  @Min(0)
  price!: number;

  @ApiProperty({
    example: 4,
    description: 'Custom total kursi (Opsional override untuk mobil)',
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  totalSeats?: number;

  @ApiProperty({
    example: 50.0,
    description: 'Custom max berat bagasi kg (Opsional override untuk mobil)',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxWeightCapacityKg?: number;

  @ApiProperty({
    enum: ServiceType,
    example: 'mobil',
    description: 'Tipe layanan (motor, mobil, barang)',
  })
  @IsEnum(ServiceType)
  @IsNotEmpty()
  serviceType!: ServiceType;

  @ApiProperty({
    example: '{"type":"LineString","coordinates":[]}',
    description: 'GeoJSON polyline rute jalan OSRM (Opsional)',
    required: false,
  })
  @IsOptional()
  @IsString()
  mapsPolyline?: string;

  @ApiProperty({
    example: 24.5,
    description: 'Jarak rute perjalanan dalam kilometer (Opsional)',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  distanceKm?: number;

  @ApiProperty({
    example: 45,
    description: 'Estimasi durasi waktu tempuh perjalanan dalam menit (Opsional)',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  estimatedDurationMinutes?: number;
}
