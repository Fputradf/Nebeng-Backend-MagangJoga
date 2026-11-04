import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { DisbursementBanksService } from './disbursement-banks.service';
import { CreateDisbursementBankDto } from './dto/create-disbursement-bank.dto';
import { UpdateDisbursementBankDto } from './dto/update-disbursement-bank.dto';
import { Role } from '../../generated/prisma/enums';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Disbursement Banks')
@Controller('disbursement-banks')
export class DisbursementBanksController {
  constructor(private readonly banksService: DisbursementBanksService) {}

  @Get()
  @ApiOperation({
    summary: 'Mendapatkan daftar bank pencairan yang aktif untuk Customer & Mitra',
  })
  @ApiResponse({ status: 200, description: 'Daftar bank aktif' })
  findActive() {
    return this.banksService.findActive();
  }

  @Get('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.admin)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Mendapatkan semua data bank pencairan untuk Superadmin (aktif & nonaktif)',
  })
  findAllAdmin() {
    return this.banksService.findAllAdmin();
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mendapatkan detail konfigurasi bank berdasarkan ID' })
  findOne(@Param('id') id: string) {
    return this.banksService.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Menambahkan konfigurasi bank pencairan baru (Superadmin)' })
  create(@Body() dto: CreateDisbursementBankDto) {
    return this.banksService.create(dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Memperbarui konfigurasi bank pencairan (Superadmin)' })
  update(@Param('id') id: string, @Body() dto: UpdateDisbursementBankDto) {
    return this.banksService.update(id, dto);
  }

  @Patch(':id/toggle')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Toggle status aktif/nonaktif bank pencairan (Superadmin)' })
  toggleActive(@Param('id') id: string) {
    return this.banksService.toggleActive(id);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Menghapus bank pencairan (Superadmin)' })
  remove(@Param('id') id: string) {
    return this.banksService.remove(id);
  }
}

