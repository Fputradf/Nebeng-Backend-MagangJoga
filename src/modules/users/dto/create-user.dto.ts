import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  Matches,
  IsString,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { Role, UserStatus } from '../../../generated/prisma/client';

export class CreateUserDto {
  @ApiProperty({ example: 'Jhons' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: 'jhons@gmail.com' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsEmail()
  @IsString()
  @IsNotEmpty()
  email!: string;

  @ApiProperty({ example: '0812345678913' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @Matches(/^[0-9]{9,15}$/, { message: 'Nomor hanya boleh berisi angka' })
  phone!: string;

  @ApiProperty({ example: 'password' })
  @IsString()
  @MinLength(6)
  password!: string;

  @ApiProperty({ enum: Role, example: Role.customer })
  @IsEnum(Role)
  role!: Role;

  @ApiProperty({ example: '1' })
  @IsOptional()
  @IsString()
  regionId?: string;

  @ApiPropertyOptional({ enum: UserStatus, default: UserStatus.active })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @ApiPropertyOptional({ example: 'base64_string_or_url' })
  @IsOptional()
  @IsString()
  avatar?: string;

  @ApiPropertyOptional({ example: '3374123456789001', description: 'Nomor NIK KTP 16 digit' })
  @IsOptional()
  @IsString()
  nik?: string;

  @ApiPropertyOptional({ example: '3374123456789001', description: 'Nomor NIK KTP 16 digit' })
  @IsOptional()
  @IsString()
  ktpNumber?: string;
}
