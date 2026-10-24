import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class DisputeNoShowDto {
  @ApiProperty({ description: 'Reason for dispute' })
  @IsString()
  @IsNotEmpty()
  reason: string;
}
