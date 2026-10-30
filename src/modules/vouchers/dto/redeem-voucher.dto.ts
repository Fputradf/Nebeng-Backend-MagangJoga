import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RedeemVoucherDto {
  @ApiProperty({
    description: 'Kode voucher yang ingin di-redeem / diklaim',
    example: 'PROMOBARU2026',
  })
  @IsNotEmpty({ message: 'Kode voucher wajib diisi' })
  @IsString({ message: 'Kode voucher harus berupa teks string' })
  @MaxLength(50, { message: 'Kode voucher maksimal 50 karakter' })
  code: string;
}
