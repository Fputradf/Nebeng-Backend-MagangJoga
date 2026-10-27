import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateRegionDto {
  @ApiProperty({ example: 'Wilayah Yogyakarta', description: 'Nama Wilayah' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: 'REG-DIY', description: 'Kode unik wilayah' })
  @IsString()
  @IsNotEmpty()
  code!: string;

  @ApiPropertyOptional({
    example: -7.7956,
    description: 'Titik pusat Latitude wilayah',
  })
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional({
    example: 110.3695,
    description: 'Titik pusat Longitude wilayah',
  })
  @IsOptional()
  @IsNumber()
  longitude?: number;

  @ApiPropertyOptional({
    example: 25.5,
    description: 'Radius operasional wilayah dalam Kilometer',
  })
  @IsOptional()
  @IsNumber()
  radiusKm?: number;

  @ApiPropertyOptional({
    example: [
      [-7.7, 110.3],
      [-7.8, 110.4],
      [-7.9, 110.3],
    ],
    description: 'Array koordinat poligon batas wilayah (GeoJSON coordinates)',
  })
  @IsOptional()
  boundaryPolygon?: any;
}
