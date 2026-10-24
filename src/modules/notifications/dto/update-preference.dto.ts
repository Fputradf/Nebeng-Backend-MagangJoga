import { IsBoolean, IsOptional } from 'class-validator';

export class UpdatePreferenceDto {
  @IsOptional()
  @IsBoolean()
  enablePushNotifications?: boolean;

  @IsOptional()
  @IsBoolean()
  enableEmailNotifications?: boolean;

  @IsOptional()
  @IsBoolean()
  orderNotifications?: boolean;

  @IsOptional()
  @IsBoolean()
  tripNotifications?: boolean;

  @IsOptional()
  @IsBoolean()
  chatNotifications?: boolean;

  @IsOptional()
  @IsBoolean()
  paymentNotifications?: boolean;

  @IsOptional()
  @IsBoolean()
  promotionNotifications?: boolean;
}
