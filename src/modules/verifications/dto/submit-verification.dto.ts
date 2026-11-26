import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VerificationType } from '../../../generated/prisma/enums';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class VerifiactionFileDto {
  @ApiProperty({ example: '/uploads/verifications/ktp-123.jpg' })
  @IsString()
  @IsNotEmpty()
  filePath!: string;

  @ApiProperty({
    example: 'image/jpeg',
    description: 'Format MIME type file hanya .jpg, .png, .pdf',
  })
  @IsString()
  @IsNotEmpty()
  @IsIn(['image/jpg', 'image/png', 'application/pdf', 'image/jpeg', 'image/webp'], {
    message: 'Tipe file tidak valid. hanya diperbolehkan jpeg, jpg, png, webp, pdf',
  })
  fileType!: string;
}

export class SumbitVerificationDto {
  @ApiProperty({ enum: VerificationType, example: VerificationType.ktp })
  @IsEnum(VerificationType)
  @IsNotEmpty()
  type!: VerificationType;

  @ApiProperty({ type: [VerifiactionFileDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VerifiactionFileDto)
  files!: VerifiactionFileDto[];

  @ApiPropertyOptional({ example: '3374123456789001' })
  @IsOptional()
  @IsString()
  ktpNumber?: string;

  @ApiPropertyOptional({ example: 'Budi Santoso' })
  @IsOptional()
  @IsString()
  fullNameKtp?: string;

  @ApiPropertyOptional({ example: 'Jl. Merdeka No. 12, Yogyakarta' })
  @IsOptional()
  @IsString()
  addressKtp?: string;

  @ApiPropertyOptional({ example: '/uploads/verifications/face-123.jpg' })
  @IsOptional()
  @IsString()
  faceImageUrl?: string;
}
