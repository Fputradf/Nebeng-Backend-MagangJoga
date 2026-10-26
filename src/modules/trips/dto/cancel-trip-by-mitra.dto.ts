import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CancelTripByMitraDto {
  @ApiProperty({
    description: 'Alasan pembatalan trip oleh mitra',
    example: 'Kendaraan mengalami mogok darurat pada sistem transmisi',
  })
  @IsNotEmpty({ message: 'Alasan pembatalan wajib diisi' })
  @IsString()
  reason: string;

  @ApiPropertyOptional({
    description: 'Bukti pendukung pembatalan opsional (URL foto / dokumen bengkel)',
    example: 'https://storage.nebeng.com/evidence/kendaraan-rusak.jpg',
  })
  @IsOptional()
  @IsString()
  evidenceUrl?: string;
}

