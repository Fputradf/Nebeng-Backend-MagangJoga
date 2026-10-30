import {
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  Min,
  Max,
} from 'class-validator';

export class CreateSocialLinkDto {
  @IsString()
  platform: string;

  @IsString()
  url: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;

  @IsOptional()
  @IsString()
  iconType?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  orderIndex?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
