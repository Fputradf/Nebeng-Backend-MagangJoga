import {
  IsString,
  IsUrl,
  IsOptional,
  IsBoolean,
  IsEnum,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { Role } from '../../../generated/prisma/enums';

export class CreateBannerDto {
  @IsString()
  title: string;

  @IsUrl({ require_tld: false })
  imageUrl: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' && value.trim() !== '' ? value.trim() : null,
  )
  @IsString()
  linkUrl?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' && value.trim() !== ''
      ? (value.trim().toLowerCase() as Role)
      : null,
  )
  @IsEnum(Role)
  targetRole?: Role | null;
}
