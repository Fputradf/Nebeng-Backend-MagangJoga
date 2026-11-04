import { IsBoolean, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateVoucherStatusDto {
  @ApiProperty({ description: 'Status keaktifan voucher', example: false })
  @IsNotEmpty({ message: 'Status keaktifan wajib diisi' })
  @IsBoolean()
  isActive: boolean;
}

