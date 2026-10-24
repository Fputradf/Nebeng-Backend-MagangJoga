import { IsString, IsOptional, IsNotEmpty, IsUrl } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class MitraNoShowDto {
  @ApiProperty({ description: 'Trip ID' })
  @IsString()
  @IsNotEmpty()
  tripId: string;

  @ApiProperty({ description: 'Pos ID where the no-show is being marked', required: false })
  @IsString()
  @IsOptional()
  posId?: string;

  @ApiProperty({ description: 'Reason for no-show (required)' })
  @IsString()
  @IsNotEmpty()
  reason: string;

  @ApiProperty({ description: 'Evidence URL (photo proof)', required: false })
  @IsString()
  @IsOptional()
  @IsUrl()
  evidenceUrl?: string;
}
