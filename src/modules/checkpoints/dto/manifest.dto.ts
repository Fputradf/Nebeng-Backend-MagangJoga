import { IsOptional, IsString, IsDateString } from 'class-validator';

export class ManifestQueryDto {
  @IsOptional()
  @IsString()
  posId?: string;

  @IsOptional()
  @IsDateString()
  date?: string;
}
