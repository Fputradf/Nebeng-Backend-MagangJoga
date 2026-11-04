import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ReportStatus } from '../../../generated/prisma/enums';

export class ResolveReportDto {
  @ApiProperty({
    description: 'Status akhir laporan setelah diinvestigasi',
    enum: ReportStatus,
    example: ReportStatus.RESOLVED_VALID,
  })
  @IsNotEmpty()
  @IsEnum(ReportStatus)
  status: ReportStatus;

  @ApiProperty({
    description: 'Catatan tindakan / tindak lanjut investigasi oleh admin',
    example: 'Laporan diverifikasi valid melalui bukti foto dan rekaman chat. Sanksi diterapkan pada mitra driver.',
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(3000)
  actionNotes: string;

  @ApiProperty({
    description: 'Apakah ingin menerbitkan sanksi otomatis ke Mitra (jika terlapor adalah mitra driver)',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  applySanction?: boolean;

  @ApiProperty({
    description: 'Pengurangan skor performa mitra jika diberi sanksi',
    example: 10,
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  scoreDeduction?: number;

  @ApiProperty({
    description: 'Apakah mitra ditangguhkan (suspend)',
    example: false,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  isSuspended?: boolean;

  @ApiProperty({
    description: 'Tanggal akhir masa penangguhan (ISO 8601 string)',
    example: '2026-11-07T00:00:00.000Z',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  suspendedUntil?: string;

  @ApiProperty({
    description: 'Apakah pelapor diberi penalti karena laporan palsu (RESOLVED_INVALID yang disengaja)',
    example: false,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  penalizeReporter?: boolean;
}

