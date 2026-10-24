import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, Length } from 'class-validator';

export class VerifyOtpDto {
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
}
