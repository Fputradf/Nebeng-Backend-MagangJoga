import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreatePickupPointDto {
  @ApiProperty({ example: '1', description: 'ID Region' })
  @IsNotEmpty()
  regionId!: string;

  @ApiPropertyOptional({
    example: '1',
    description: 'ID City (Opsional - otomatis ditentukan sesuai Region jika dikosongkan)',
  })
  @IsOptional()
  @IsString()
  cityId?: string;

  @ApiPropertyOptional({ example: '2', description: 'ID User Operator Pos' })
  @IsOptional()
  operatorId?: string;

  @ApiProperty({ example: 'Pos Terminal Giwangan', description: 'Nama Pos' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({
    example: 'Jl. Imogiri Timur No.1, Yogyakarta',
    description: 'Alamat lengkap',
  })
  @IsString()
  @IsNotEmpty()
  address!: string;

  @ApiProperty({ example: -7.8333, description: 'Latitude' })
  @IsNumber()
  @IsNotEmpty()
  latitude!: number;

  @ApiProperty({ example: 110.3833, description: 'Longitude' })
  @IsNumber()
  @IsNotEmpty()
  longitude!: number;
}
