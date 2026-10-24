import {
  IsString,
  IsUrl,
  IsOptional,
  IsBoolean,
  IsEnum,
} from 'class-validator';
import { Role } from '../../../generated/prisma/enums';

export class CreateBannerDto {
  @IsString()
  title: string;

  @IsUrl({ require_tld: false })
  imageUrl: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  linkUrl?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsEnum(Role)
  targetRole?: Role | null;
}
