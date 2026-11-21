import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SubmitManualPaymentDto {
  @ApiProperty({ description: 'ID Order yang dibayar', example: '1' })
  @IsNotEmpty()
  @IsString()
  orderId: string;

  @ApiProperty({
    description: 'Bukti transfer (Base64 Data URL atau URL gambar struk)',
    example: 'data:image/jpeg;base64,...',
  })
  @IsNotEmpty()
  @IsString()
  proofUrl: string;

  @ApiProperty({ description: 'Nama pengirim di rekening/e-wallet', example: 'Budi Santoso' })
  @IsNotEmpty()
  @IsString()
  senderName: string;

  @ApiProperty({ description: 'Bank atau Saluran Pembayaran (contoh: BCA Manual, QRIS Statis)', example: 'BCA Manual' })
  @IsNotEmpty()
  @IsString()
  bankName: string;

  @ApiPropertyOptional({ description: 'Nomor rekening atau nomor HP pengirim', example: '1234567890' })
  @IsOptional()
  @IsString()
  senderAccount?: string;

  @ApiPropertyOptional({ description: 'Catatan tambahan dari customer' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class VerifyManualPaymentDto {
  @ApiProperty({ description: 'Persetujuan verifikasi (true = terima, false = tolak)', example: true })
  @IsNotEmpty()
  approved: boolean;

  @ApiPropertyOptional({ description: 'Catatan review atau alasan penolakan', example: 'Dana telah diterima di rekening BCA' })
  @IsOptional()
  @IsString()
  reviewNotes?: string;
}
