import {
  IsNotEmpty,
  IsString,
  IsNumber,
  IsLatitude,
  IsLongitude,
  IsOptional,
  Min,
  Max,
} from 'class-validator';

export class UpdateLocationDto {
  @IsNotEmpty()
  @IsString()
  tripId!: string;

  @IsNotEmpty()
  @IsNumber()
  @IsLatitude()
  latitude!: number;

  @IsNotEmpty()
  @IsNumber()
  @IsLongitude()
  longtitude!: number;

  @IsOptional()
  @IsNumber()
  @Min(-500)
  @Max(9000)
  altitude?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(500)
  speed?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(360)
  heading?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  accuracy?: number;
}
