import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Length,
  MinLength,
  MaxLength,
} from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({ example: 'user@example.com' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'Format email tidak valid' })
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: '123456', description: 'Kode OTP 6-digit' })
  @IsString()
  @IsNotEmpty()
  @Length(6, 6, { message: 'OTP harus tepat 6 digit' })
  otp: string;

  @ApiProperty({ example: 'Af^dfa1212daG' })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(255)
  newPassword: string;
}
