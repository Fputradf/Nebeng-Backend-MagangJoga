import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import {
  ReportCategory,
  ReportSeverity,
  ReportStatus,
} from '../../../generated/prisma/enums';

export class QueryReportDto {
  @ApiProperty({
    description: 'Filter berdasarkan status',
    enum: ReportStatus,
    required: false,
  })
  @IsOptional()
  @IsEnum(ReportStatus)
  status?: ReportStatus;

  @ApiProperty({
    description: 'Filter berdasarkan tingkat keparahan',
    enum: ReportSeverity,
    required: false,
  })
  @IsOptional()
  @IsEnum(ReportSeverity)
  severity?: ReportSeverity;

  @ApiProperty({
    description: 'Filter berdasarkan kategori laporan',
    enum: ReportCategory,
    required: false,
  })
  @IsOptional()
  @IsEnum(ReportCategory)
  category?: ReportCategory;

  @ApiProperty({
    description: 'Pencarian kata kunci (nomor tiket, nama user)',
    required: false,
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({
    description: 'Nomor halaman',
    example: '1',
    required: false,
  })
  @IsOptional()
  page?: string;

  @ApiProperty({
    description: 'Jumlah per halaman',
    example: '10',
    required: false,
  })
  @IsOptional()
  limit?: string;
}

