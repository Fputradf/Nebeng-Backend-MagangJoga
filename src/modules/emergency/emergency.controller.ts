import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { EmergencyService } from './emergency.service';
import { CreateSosDto } from './dto/create-sos.dto';
import { ResolveSosDto } from './dto/resolve-sos.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../generated/prisma/enums';
import { GetUser } from '../../common/decorators/get-user.decorators';

@ApiTags('Emergency SOS')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('emergency')
export class EmergencyController {
  constructor(private readonly emergencyService: EmergencyService) {}

  @Post('sos')
  @Roles(Role.customer, Role.admin)
  @ApiOperation({
    summary: 'Pemicu Sinyal Bahaya / SOS oleh Customer saat Perjalanan Aktif',
  })
  @ApiResponse({
    status: 201,
    description: 'Sinyal SOS berhasil diterima dan disiarkan ke Admin Regional & Web Push',
  })
  async triggerSos(@GetUser() user: any, @Body() dto: CreateSosDto) {
    return this.emergencyService.triggerSos(user, dto);
  }

  @Get('sos/active')
  @Roles(Role.regional, Role.admin, Role.operator)
  @ApiOperation({
    summary: 'Daftar Insiden Darurat SOS Aktif di Wilayah Kerja Admin Regional, Superadmin & Mitra Pos',
  })
  @ApiResponse({ status: 200, description: 'Daftar insiden SOS aktif' })
  async getActiveSos(@GetUser() user: any) {
    return this.emergencyService.getActiveSosByRegion(user);
  }

  @Patch('sos/:id/resolve')
  @Roles(Role.regional, Role.admin, Role.operator)
  @ApiOperation({
    summary: 'Penyelesaian / Penutupan Insiden Darurat SOS oleh Admin Regional, Superadmin & Mitra Pos',
  })
  @ApiResponse({ status: 200, description: 'Insiden SOS berhasil ditandai selesai/aman' })
  async resolveSos(
    @GetUser() user: any,
    @Param('id') id: string,
    @Body() dto: ResolveSosDto,
  ) {
    return this.emergencyService.resolveSos(user, id, dto);
  }
}

