import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResolveSosDto {
  @ApiProperty({ description: 'Status resolusi', enum: ['RESOLVED', 'FALSE_ALARM'] })
  @IsNotEmpty()
  @IsString()
  status: 'RESOLVED' | 'FALSE_ALARM';

  @ApiProperty({ description: 'Catatan penanganan oleh admin', required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}

