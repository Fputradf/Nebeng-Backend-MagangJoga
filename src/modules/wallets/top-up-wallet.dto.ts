import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, Min } from 'class-validator';

export class TopUpWalletDto {
  @ApiProperty({
    example: 50000,
    description: 'Jumlah saldo yang ingin di-top up',
  })
  @IsNumber()
  @IsNotEmpty()
  @Min(10000, { message: 'Minimal top up saldo adalah Rp 10.000' })
  amount!: number;
}

