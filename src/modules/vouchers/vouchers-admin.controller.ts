import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../generated/prisma/enums';
import { VouchersService } from './vouchers.service';
import { CreateVoucherDto } from './dto/create-voucher.dto';
import { UpdateVoucherDto } from './dto/update-voucher.dto';
import { UpdateVoucherStatusDto } from './dto/update-voucher-status.dto';

@ApiTags('Admin Vouchers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.admin)
@Controller('admin/vouchers')
export class VouchersAdminController {
  constructor(private readonly vouchersService: VouchersService) {}

  @Get()
  @ApiOperation({ summary: 'Mendapatkan semua daftar voucher dengan rekapitulasi kuota (Admin)' })
  async getAllVouchers() {
    return this.vouchersService.getAllVouchers();
  }

  @Post()
  @ApiOperation({ summary: 'Membuat voucher baru (Admin)' })
  async createVoucher(@Body() dto: CreateVoucherDto) {
    return this.vouchersService.createVoucher(dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Memperbarui data voucher (Admin)' })
  async updateVoucher(
    @Param('id') id: string,
    @Body() dto: UpdateVoucherDto,
  ) {
    return this.vouchersService.updateVoucher(id, dto);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Mengaktifkan atau menonaktifkan voucher (Admin)' })
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateVoucherStatusDto,
  ) {
    return this.vouchersService.updateVoucherStatus(id, dto.isActive);
  }
}

