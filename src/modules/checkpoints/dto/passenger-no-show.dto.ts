import { IsString, IsOptional, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PassengerNoShowDto {
  @ApiProperty({ description: 'Order ID' })
  @IsString()
  @IsNotEmpty()
  orderId: string;

  @ApiProperty({ description: 'Pos ID where the no-show is being marked', required: false })
  @IsString()
  @IsOptional()
  posId?: string;

  @ApiProperty({ description: 'Reason for no-show', required: false })
  @IsString()
  @IsOptional()
  reason?: string;
}
