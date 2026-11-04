import { IsNumber, IsOptional, IsObject, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateSanctionSettingsDto {
  @ApiProperty({
    example: 15,
    description: 'Batas toleransi keterlambatan mitra/customer dalam menit (5 - 120 menit)',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(5)
  @Max(120)
  lateToleranceMinutes?: number;

  @ApiProperty({ example: 4, description: 'Batas jam pembatalan dini', required: false })
  @IsOptional()
  @IsNumber()
  earlyCancelHours?: number;

  @ApiProperty({ example: 100, description: 'Skor awal reputasi mitra', required: false })
  @IsOptional()
  @IsNumber()
  baseScore?: number;

  @ApiProperty({ example: 80, description: 'Ambang batas peringatan skor', required: false })
  @IsOptional()
  @IsNumber()
  warningThreshold?: number;

  @ApiProperty({ example: 50, description: 'Ambang batas suspensi otomatis', required: false })
  @IsOptional()
  @IsNumber()
  suspensionThreshold?: number;

  @ApiProperty({ description: 'Aturan kebijakan sanksi spesifik per kategori', required: false })
  @IsOptional()
  @IsObject()
  policies?: Record<string, any>;
}

