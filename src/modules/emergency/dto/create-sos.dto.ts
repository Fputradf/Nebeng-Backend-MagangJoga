import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateSosDto {
  @ApiProperty({ description: 'ID Order tiket yang sedang aktif', example: '12' })
  @IsNotEmpty()
  orderId: string | number;

  @ApiProperty({ description: 'ID Perjalanan / Trip terkait', example: '5' })
  @IsNotEmpty()
  tripId: string | number;

  @ApiProperty({ description: 'Garis lintang (latitude) GPS customer', example: -7.7956 })
  @IsNotEmpty()
  @IsNumber()
  latitude: number;

  @ApiProperty({ description: 'Garis bujur (longitude) GPS customer', example: 110.3695 })
  @IsNotEmpty()
  @IsNumber()
  longitude: number;

  @ApiProperty({ description: 'Kategori darurat (kejahatan, kecelakaan, medis, mogok, dll)', example: 'ancaman_kejahatan' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiProperty({ description: 'Catatan tambahan dari customer', required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}

