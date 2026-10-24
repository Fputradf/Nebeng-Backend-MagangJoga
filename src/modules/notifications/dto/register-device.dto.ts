import { IsString, IsOptional, IsIn } from 'class-validator';

export class RegisterDeviceDto {
  @IsString()
  token: string;

  @IsOptional()
  @IsString()
  @IsIn(['android', 'ios', 'web'])
  platform?: string;

  @IsOptional()
  @IsString()
  userAgent?: string;
}
