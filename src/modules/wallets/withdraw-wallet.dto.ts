import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString, Length, Min } from 'class-validator';

export class WithdrawWalletDto {
  @ApiProperty({
    example: 50000,
    description: 'Jumlah saldo yang ingin ditarik',
  })
  @IsNumber()
  @IsNotEmpty()
  @Min(10000, { message: 'Minimal penarikan saldo adalah Rp 10.000' })
  amount!: number;

  @ApiPropertyOptional({
    example: '123456',
    description: 'PIN transaksi keamanan 6 digit',
  })
  @IsOptional()
  @IsString()
  @Length(6, 6, { message: 'PIN transaksi harus 6 digit angka' })
  pin?: string;
}
