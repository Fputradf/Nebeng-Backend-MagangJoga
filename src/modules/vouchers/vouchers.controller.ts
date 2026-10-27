import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../../common/decorators/get-user.decorators';
import { VouchersService } from './vouchers.service';
import { ValidateVoucherDto } from './dto/validate-voucher.dto';

@ApiTags('Vouchers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('vouchers')
export class VouchersController {
  constructor(private readonly vouchersService: VouchersService) {}

  @Post('validate')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({
    summary: 'Validasi dan pratinjau kalkulasi diskon voucher untuk order (Customer)',
  })
  async validate(
    @GetUser('id') userId: string,
    @Body() dto: ValidateVoucherDto,
  ) {
    return this.vouchersService.previewValidation(String(userId), dto);
  }
}

