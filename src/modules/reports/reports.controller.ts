import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { CreateReportDto } from './dto/create-report.dto';
import { ResolveReportDto } from './dto/resolve-report.dto';
import { QueryReportDto } from './dto/query-report.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../generated/prisma/enums';
import { GetUser } from '../../common/decorators/get-user.decorators';

@ApiTags('User Reports (Tripartite Reporting)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Post()
  @Roles(Role.customer, Role.mitra, Role.operator, Role.admin, Role.regional)
  @ApiOperation({
    summary: 'Buat Laporan Pelanggaran Lapangan (Customer ↔ Driver ↔ Pos Operator)',
  })
  @ApiResponse({
    status: 201,
    description: 'Laporan berhasil dibuat dan masuk antrean investigasi',
  })
  async createReport(@GetUser() user: any, @Body() dto: CreateReportDto) {
    return this.reportsService.createReport(user, dto);
  }

  @Get('my-reports')
  @Roles(Role.customer, Role.mitra, Role.operator, Role.admin, Role.regional)
  @ApiOperation({
    summary: 'Riwayat Laporan yang Diajukan oleh Pengguna Sendiri',
  })
  @ApiResponse({ status: 200, description: 'Daftar laporan terkirim' })
  async getMySubmittedReports(@GetUser() user: any) {
    return this.reportsService.getMySubmittedReports(user);
  }

  @Get('against-me')
  @Roles(Role.customer, Role.mitra, Role.operator)
  @ApiOperation({
    summary: 'Daftar Laporan yang Ditujukan kepada Pengguna (Blind: Pelapor Disamarkan)',
  })
  @ApiResponse({ status: 200, description: 'Daftar aduan terhadap akun pengguna' })
  async getReportsTargetingMe(@GetUser() user: any) {
    return this.reportsService.getReportsTargetingMe(user);
  }

  @Get('admin')
  @Roles(Role.regional, Role.admin)
  @ApiOperation({
    summary: 'Daftar Seluruh Laporan Lapangan untuk Admin / Regional Manager',
  })
  @ApiResponse({ status: 200, description: 'Daftar tiket investigasi' })
  async getAllReportsForAdmin(
    @GetUser() user: any,
    @Query() query: QueryReportDto,
  ) {
    return this.reportsService.getAllReportsForAdmin(user, query);
  }

  @Get(':id')
  @Roles(Role.customer, Role.mitra, Role.operator, Role.admin, Role.regional)
  @ApiOperation({
    summary: 'Detail Tiket Laporan berdasarkan ID',
  })
  @ApiResponse({ status: 200, description: 'Data detail laporan' })
  async getReportDetail(@GetUser() user: any, @Param('id') id: string) {
    return this.reportsService.getReportDetail(user, id);
  }

  @Patch(':id/resolve')
  @Roles(Role.regional, Role.admin)
  @ApiOperation({
    summary: 'Tindak Lanjut & Penyelesaian Laporan oleh Admin / Regional (Pemberian Sanksi)',
  })
  @ApiResponse({ status: 200, description: 'Laporan berhasil diperbarui' })
  async resolveReport(
    @GetUser() user: any,
    @Param('id') id: string,
    @Body() dto: ResolveReportDto,
  ) {
    return this.reportsService.resolveReport(user, id, dto);
  }
}

