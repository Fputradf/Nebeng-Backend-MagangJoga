import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { OrderType } from '../../../generated/prisma/enums';
import { CreateOrderItemDto } from './create-order-item.dto';
import { CreateOrderPassengerDto } from './create-order-passenger.dto';

export class CreateOrderDto {
  @ApiProperty({ example: '1', description: 'ID Trip yang dipesan' })
  @IsString()
  @IsNotEmpty()
  tripId!: string;

  @ApiProperty({ enum: OrderType, example: OrderType.passenger })
  @IsEnum(OrderType)
  type!: OrderType;

  @ApiPropertyOptional({
    example: 1,
    description: 'Jumlah kursi (Wajib diisi jika type = passenger)',
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  seatsBooked?: number;

  @ApiPropertyOptional({
    type: [CreateOrderPassengerDto],
    description: 'Daftar data detail penumpang (Wajib diisi jika type = passenger)',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderPassengerDto)
  passengers?: CreateOrderPassengerDto[];

  @ApiPropertyOptional({
    type: [CreateOrderItemDto],
    description: 'Daftar item paket (Wajib diisi jika type = parcel)',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items?: CreateOrderItemDto[];

  @ApiPropertyOptional({
    example: 'HEMAT50',
    description: 'Kode voucher diskon opsional',
  })
  @IsOptional()
  @IsString()
  voucherCode?: string;
}
