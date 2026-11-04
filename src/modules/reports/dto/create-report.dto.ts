import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsArray,
  MaxLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import {
  ReportCategory,
  ReportSeverity,
} from '../../../generated/prisma/enums';

export class CreateReportDto {
  @ApiProperty({
    description: 'ID user yang dilaporkan (Customer, Mitra Driver, atau Operator Pos)',
    example: '15',
  })
  @IsNotEmpty()
  reportedUserId: string | number;

  @ApiProperty({
    description: 'ID Trip terkait (opsional jika ada orderId atau pickupPointId)',
    example: '8',
    required: false,
  })
  @IsOptional()
  tripId?: string | number;

  @ApiProperty({
    description: 'ID Order terkait (opsional jika ada tripId atau pickupPointId)',
    example: '24',
    required: false,
  })
  @IsOptional()
  orderId?: string | number;

  @ApiProperty({
    description: 'ID Pos / Pickup Point terkait (opsional jika ada tripId atau orderId)',
    example: '3',
    required: false,
  })
  @IsOptional()
  pickupPointId?: string | number;

  @ApiProperty({
    description: 'Kategori pelanggaran yang dilaporkan',
    enum: ReportCategory,
    example: ReportCategory.SAFETY_AND_HARASSMENT,
  })
  @IsNotEmpty()
  @IsEnum(ReportCategory)
  category: ReportCategory;

  @ApiProperty({
    description: 'Tingkat urgensi / keparahan insiden',
    enum: ReportSeverity,
    example: ReportSeverity.MEDIUM,
    required: false,
  })
  @IsOptional()
  @IsEnum(ReportSeverity)
  severity?: ReportSeverity;

  @ApiProperty({
    description: 'Deskripsi kronologi kejadian secara detail',
    example: 'Driver meminta tambahan ongkos di luar aplikasi dan mengemudi membahayakan.',
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(3000)
  description: string;

  @ApiProperty({
    description: 'Daftar URL bukti lampiran (foto, video, screenshot)',
    type: [String],
    required: false,
  })
  @IsOptional()
  @IsArray()
  evidenceUrls?: string[];
}

