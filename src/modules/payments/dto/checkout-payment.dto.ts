import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString, Length } from 'class-validator';

export class CheckoutPaymentDto {
  @ApiProperty({ example: '1', description: 'ID order yang akan dibayar' })
  @IsString()
  @IsNotEmpty()
  orderId!: string;

  @ApiProperty({
    example: 'WALLET',
    description: 'Metode pembayaran yang diizinkan: BANK_TRANSFER, QRIS, WALLET',
    enum: ['BANK_TRANSFER', 'QRIS', 'WALLET'],
  })
  @IsString()
  @IsNotEmpty()
  @IsIn(['BANK_TRANSFER', 'QRIS', 'WALLET'], {
    message: 'Metode pembayaran tidak valid.',
  })
  paymentGateway!: string;

  @ApiProperty({
    example: '123456',
    description: 'PIN transaksi 6-digit keamanan Customer',
  })
  @IsString()
  @IsNotEmpty({ message: 'PIN transaksi wajib diisi' })
  @Length(6, 6, { message: 'PIN transaksi harus terdiri dari 6 digit' })
  pin!: string;
}
