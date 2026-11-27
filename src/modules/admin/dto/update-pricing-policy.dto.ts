import {
  IsNumber,
  Min,
  IsArray,
  ValidateNested,
  IsString,
  IsIn,
  IsOptional,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

class ParcelMatrixDto {
  @ApiProperty({ example: 'XXS', enum: ['XXS', 'XS', 'S', 'M', 'L', 'XL'] })
  @IsString()
  @IsIn(['XXS', 'XS', 'S', 'M', 'L', 'XL'])
  size!: string;

  @ApiProperty({ example: 1 })
  @IsNumber()
  @Min(0)
  maxWeightKg!: number;

  @ApiProperty({ example: 6000 })
  @IsNumber()
  @Min(0)
  baseRate!: number;
}

export class UpdatePricingPolicyDto {
  @ApiProperty({ example: 2500 })
  @IsNumber()
  @Min(0)
  motorPerKm!: number;

  @ApiProperty({ example: 5000 })
  @IsNumber()
  @Min(0)
  carPerKm!: number;

  @ApiProperty({ example: 5000 })
  @IsNumber()
  @Min(0)
  motorBaseFare!: number;

  @ApiProperty({ example: 10000 })
  @IsNumber()
  @Min(0)
  carBaseFare!: number;

  @ApiProperty({ example: 15 })
  @IsNumber()
  @Min(0)
  rideFeePercent!: number;

  @ApiProperty({ example: 12 })
  @IsNumber()
  @Min(0)
  parcelFeePercent!: number;

  @ApiProperty({ example: 2000, required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  rideCustomerFee?: number;

  @ApiProperty({ example: 2000, required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  parcelCustomerFee?: number;

  @ApiProperty({ type: [ParcelMatrixDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ParcelMatrixDto)
  parcelMatrix!: ParcelMatrixDto[];
}
