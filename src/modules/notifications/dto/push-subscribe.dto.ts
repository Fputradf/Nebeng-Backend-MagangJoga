import { IsString, IsNotEmpty, IsObject, IsOptional } from 'class-validator';

export class PushSubscribeDto {
  @IsString()
  @IsNotEmpty()
  endpoint: string;

  @IsObject()
  @IsNotEmpty()
  keys: {
    p256dh: string;
    auth: string;
  };

  @IsString()
  @IsOptional()
  userAgent?: string;
}

export class PushUnsubscribeDto {
  @IsString()
  @IsNotEmpty()
  endpoint: string;
}
