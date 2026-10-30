import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateOrderPassengerDto {
  @ApiProperty({ example: 'Budi Santoso', description: 'Nama lengkap penumpang' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({
    example: '081234567890',
    description: 'Nomor WhatsApp / telepon penumpang',
  })
  @IsString()
  @IsNotEmpty()
  phone!: string;

  @ApiPropertyOptional({ example: 1, description: 'Nomor urut kursi' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  seatNumber?: number;

  @ApiPropertyOptional({
    example: true,
    description: 'Menandai apakah penumpang ini adalah kontak utama / PIC di lapangan',
  })
  @IsOptional()
  @IsBoolean()
  isContact?: boolean;
}

