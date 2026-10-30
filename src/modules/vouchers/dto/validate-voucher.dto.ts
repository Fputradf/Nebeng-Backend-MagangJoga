import { IsEnum, IsNotEmpty, IsNumber, IsString, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { OrderType } from '../../../generated/prisma/enums';

export class ValidateVoucherDto {
  @ApiProperty({ description: 'Kode voucher yang akan divalidasi', example: 'HEMAT50' })
  @IsNotEmpty({ message: 'Kode voucher wajib diisi' })
  @IsString()
  code: string;

  @ApiProperty({ enum: OrderType, description: 'Jenis pemesanan (passenger atau parcel)', example: OrderType.passenger })
  @IsNotEmpty({ message: 'Jenis pemesanan wajib diisi' })
  @IsEnum(OrderType)
  orderType: OrderType;

  @ApiProperty({ description: 'Subtotal pemesanan sebelum diskon', example: 50000 })
  @IsNotEmpty({ message: 'Subtotal wajib diisi' })
  @IsNumber()
  @Min(0, { message: 'Subtotal tidak boleh negatif' })
  subtotal: number;
}

