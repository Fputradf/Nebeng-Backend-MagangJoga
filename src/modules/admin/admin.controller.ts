import { SanctionService } from './sanction.service';
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { UpdateUserGovernanceDto } from './dto/update-user-governance.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../generated/prisma/enums';
import { GetUser } from '../../common/decorators/get-user.decorators';
import { UpdatePricingPolicyDto } from './dto/update-pricing-policy.dto';
import {
  UpdatePlatformCommissionDto,
  UpdateRegionRateDto,
} from './dto/system-setting.dto';

@ApiTags('Admin Governance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin')

export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly sanctionService: SanctionService,
  ) {}

  @Get('dashboard/global')
  @Roles(Role.admin)
  @ApiOperation({
    summary: 'Melihat dashboard analitik global (Superadmin Only)',
  })
  @ApiResponse({ status: 200, description: 'Analitik global ditemukan' })
  async getGlobalDashboard() {
    return this.adminService.getGlobalDashboard();
  }

  @Get('dashboard/regional')
  @Roles(Role.regional, Role.admin)
  @ApiOperation({ summary: 'Melihat dashboard analitik wilayah' })
  @ApiQuery({
    name: 'regionId',
    required: false,
    description: 'Wajib diisi jika dikirim oleh Superadmin',
  })
  @ApiResponse({ status: 200, description: 'Analitik wilayah ditemukan' })
  async getRegionalDashboard(
    @GetUser() user: any,
    @Query('regionId') targetRegionId?: string,
  ) {
    return this.adminService.getRegionalDashboard(user, targetRegionId);
  }

  @Get('escrow/ledger')
  @Roles(Role.admin)
  @ApiOperation({
    summary: 'Melihat buku besar audit Escrow (Superadmin Only)',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    description: 'Nomor halaman (default: 1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Jumlah data per halaman (default: 20)',
  })
  @ApiResponse({ status: 200, description: 'Buku besar Escrow ditemukan' })
  async getEscrowLedger(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedPage = page && !isNaN(Number(page)) ? parseInt(page, 10) : 1;
    const parsedLimit =
      limit && !isNaN(Number(limit)) ? parseInt(limit, 10) : 20;
    return this.adminService.getEscrowLedger(parsedPage, parsedLimit);
  }

  @Get('settings/pricing-policy')
  @Roles(Role.admin)
  @ApiOperation({
    summary: 'Mendapatkan seluruh data kebijakan tarif global & matriks paket',
  })
  @ApiResponse({ status: 200, description: 'Data tarif ditemukan' })
  async getPricingPolicy() {
    return this.adminService.getPricingPolicy();
  }

  @Patch('settings/pricing-policy')
  @Roles(Role.admin)
  @ApiOperation({
    summary: 'Memperbarui seluruh kebijakan tarif global & komisi',
  })
  @ApiResponse({
    status: 200,
    description: 'Kebijakan tarif berhasil diperbarui',
  })
  async updatePricingPolicy(@Body() dto: UpdatePricingPolicyDto) {
    return this.adminService.updatePricingPolicy(dto);
  }

  @Patch('users/:id/governance')
  @Roles(Role.regional, Role.admin)
  @ApiOperation({
    summary: 'Mengubah status akun user (Suspended / Active / Banned)',
  })
  @ApiResponse({
    status: 200,
    description: 'Status tata kelola user berhasil diperbarui',
  })
  async updateUserGovernance(
    @GetUser() user: any,
    @Param('id') targetUserId: string,
    @Body() dto: UpdateUserGovernanceDto,
  ) {
    return this.adminService.updateUserGovernance(user, targetUserId, dto);
  }

  @Patch('settings/commission')
  @Roles(Role.admin)
  @ApiOperation({
    summary: 'Pengaturan persentase komisi platform global (Hanya Superadmin)',
  })
  @ApiResponse({
    status: 200,
    description: 'Persentase komisi platform berhasil diperbarui',
  })
  async updatePlatformCommission(@Body() dto: UpdatePlatformCommissionDto) {
    return this.adminService.updatePlatformCommission(dto.commissionPercentage);
  }

  @Patch('regions/:id/rate')
  @Roles(Role.regional, Role.admin)
  @ApiOperation({
    summary: 'Pengaturan tarif Rp/Km Wilayah Asal (Admin Wilayah & Superadmin)',
  })
  @ApiResponse({
    status: 200,
    description: 'Tarif Rp/Km wilayah berhasil diperbarui',
  })
  async updateRegionRate(
    @GetUser() user: any,
    @Param('id') regionId: string,
    @Body() dto: UpdateRegionRateDto,
  ) {
    return this.adminService.updateRegionRate(user, regionId, dto.pricePerKm);
  }

  @Patch('settings/rewards')
  @Roles(Role.admin)
  @ApiOperation({
    summary: 'Pengaturan kelipatan Poin Reward global (Hanya Superadmin)',
  })
  @ApiResponse({
    status: 200,
    description: 'Pengaturan kelipatan Poin Reward berhasil diperbarui',
  })
  async updateRewardSetting(
    @Body('pointsMultiplier') pointsMultiplier: number,
  ) {
    return this.adminService.updateRewardSetting(pointsMultiplier);
  }

  // ------------------------------------------------------
  // FASE 10: TATA KELOLA SANKSI & BANDING MITRA
  // ------------------------------------------------------
  @Get('mitra/:id/sanctions')
  @Roles(Role.admin, Role.regional)
  @ApiOperation({ summary: 'Melihat riwayat sanksi mitra (Admin/Regional)' })
  @ApiResponse({ status: 200, description: 'Riwayat sanksi mitra ditemukan' })
  async getMitraSanctionsAdmin(@Param('id') mitraId: string) {
    return this.sanctionService.getMitraSanctions(mitraId);
  }

  @Patch('sanctions/appeals/:id/review')
  @Roles(Role.admin, Role.regional)
  @ApiOperation({ summary: 'Tinjau banding sanksi mitra (Setujui / Tolak)' })
  @ApiResponse({ status: 200, description: 'Banding berhasil ditinjau' })
  async reviewMitraAppeal(
    @GetUser('id') adminId: string,
    @Param('id') appealId: string,
    @Body() dto: { approved: boolean; reviewNotes?: string },
  ) {
    return this.sanctionService.reviewAppeal(String(adminId), appealId, dto);
  }
}