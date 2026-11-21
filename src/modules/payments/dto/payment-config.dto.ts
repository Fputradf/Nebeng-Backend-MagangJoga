import { IsEnum, IsNotEmpty, IsOptional, IsString, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum PaymentActiveMode {
  GATEWAY = 'GATEWAY',
  MANUAL = 'MANUAL',
}

export class UpdatePaymentModeConfigDto {
  @ApiProperty({
    description: 'Mode pembayaran yang aktif (Mutually Exclusive)',
    enum: PaymentActiveMode,
    example: PaymentActiveMode.MANUAL,
  })
  @IsEnum(PaymentActiveMode)
  @IsNotEmpty()
  activeMode: PaymentActiveMode;

  @ApiPropertyOptional({ description: 'Provider Gateway Otomatis (XENDIT / MIDTRANS)' })
  @IsOptional()
  @IsString()
  gatewayProvider?: string;

  @ApiPropertyOptional({ description: 'Secret Key Payment Gateway' })
  @IsOptional()
  @IsString()
  xenditSecretKey?: string;

  @ApiPropertyOptional({ description: 'Callback Verification Token' })
  @IsOptional()
  @IsString()
  xenditCallbackToken?: string;

  @ApiPropertyOptional({ description: 'Nama Bank Tujuan Transfer Manual' })
  @IsOptional()
  @IsString()
  manualBankName?: string;

  @ApiPropertyOptional({ description: 'Nomor Rekening Tujuan Transfer Manual' })
  @IsOptional()
  @IsString()
  manualAccountNumber?: string;

  @ApiPropertyOptional({ description: 'Nama Pemilik Rekening (a/n)' })
  @IsOptional()
  @IsString()
  manualAccountHolder?: string;

  @ApiPropertyOptional({ description: 'Gambar atau Data URL QRIS Statis Pemilik' })
  @IsOptional()
  @IsString()
  manualQrisImageUrl?: string;

  @ApiPropertyOptional({ description: 'Raw QRIS String / Payload untuk QR generator lokal' })
  @IsOptional()
  @IsString()
  manualQrisPayload?: string;

  @ApiPropertyOptional({ description: 'Daftar instruksi / panduan transfer', type: [String] })
  @IsOptional()
  transferGuide?: string[] | string;

  @ApiPropertyOptional({ description: 'Otomatis setujui bukti manual untuk keperluan testing/demo' })
  @IsOptional()
  @IsBoolean()
  autoVerifyManual?: boolean;
}
