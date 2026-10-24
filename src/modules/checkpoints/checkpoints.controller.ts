import { Body, Controller, Post, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiQuery,
} from '@nestjs/swagger';
import { CheckpointsService } from './checkpoints.service';
import { ScanCheckpointDto } from './dto/scan-checkpoint.dto';
import { ManifestQueryDto } from './dto/manifest.dto';
import { PassengerNoShowDto } from './dto/passenger-no-show.dto';
import { MitraNoShowDto } from './dto/mitra-no-show.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../generated/prisma/enums';
import { GetUser } from '../../common/decorators/get-user.decorators';

@ApiTags('Checkpoints')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('checkpoints')
export class CheckpointsController {
  constructor(private readonly checkpointsService: CheckpointsService) {}

  @Post('scan')
  @Roles(Role.mitra, Role.operator, Role.regional, Role.admin)
  @ApiOperation({
    summary: 'Scan QR Checkpoint di Pos Asal/Tujuan (Operator Pos & Admin)',
  })
  @ApiResponse({ status: 201, description: 'Scan checkpoint berhasil' })
  @ApiResponse({
    status: 400,
    description:
      'Pos tidak sesuai, OTP parcel salah, atau tiket tidak terdaftar di trip',
  })
  @ApiResponse({
    status: 404,
    description: 'Data Trip atau Tiket tidak ditemukan',
  })
  async scanCheckpoint(@GetUser() user: any, @Body() dto: ScanCheckpointDto) {
    return this.checkpointsService.scanCheckpoint(user, dto);
  }

  @Post('manual-force-release')
  @Roles(Role.operator, Role.regional, Role.admin)
  @ApiOperation({
    summary:
      'Intervensi Darurat: Force Complete & Release Escrow manual oleh Operator Pos (HP Mitra Rusak)',
  })
  @ApiResponse({ status: 201, description: 'Pencairan manual berhasil' })
  async manualForceRelease(
    @GetUser() user: any,
    @Body('qrCodeTicket') qrCodeTicket: string,
    @Body('posId') posId: string,
    @Body('otpClaim') otpClaim?: string,
  ) {
    return this.checkpointsService.manualForceReleaseByOperator(
      user,
      qrCodeTicket,
      posId,
      otpClaim,
    );
  }

  @Post('passenger-no-show')
  @Roles(Role.operator, Role.regional, Role.admin)
  @ApiOperation({
    summary:
      '[DEPRECATED] Catat Penumpang No-Show (Tidak Datang) - Gunakan endpoint passenger-no-show-by-id',
    deprecated: true,
  })
  @ApiResponse({ status: 201, description: 'Penumpang no-show berhasil dicatat' })
  async passengerNoShow(
    @GetUser() user: any,
    @Body('qrCodeTicket') qrCodeTicket: string,
    @Body('posId') posId?: string,
  ) {
    return this.checkpointsService.processPassengerNoShow(
      user,
      qrCodeTicket,
      posId,
    );
  }

  @Post('mitra-no-show')
  @Roles(Role.operator, Role.regional, Role.admin)
  @ApiOperation({
    summary:
      '[DEPRECATED] Catat Mitra No-Show (Tidak Datang ke Pos) - Gunakan endpoint mitra-no-show-by-id',
    deprecated: true,
  })
  @ApiResponse({ status: 201, description: 'Mitra no-show berhasil dicatat' })
  async mitraNoShow(
    @GetUser() user: any,
    @Body('qrCodeTrip') qrCodeTrip: string,
    @Body('posId') posId?: string,
  ) {
    return this.checkpointsService.processMitraNoShow(user, qrCodeTrip, posId);
  }

  @Get('manifest')
  @Roles(Role.operator, Role.regional, Role.admin)
  @ApiOperation({
    summary: 'Get Manifest Pos - Daftar trip dan penumpang untuk operator',
  })
  @ApiQuery({ name: 'posId', required: false, type: String })
  @ApiQuery({ name: 'date', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Manifest berhasil diambil' })
  async getManifest(
    @GetUser() user: any,
    @Query() query: ManifestQueryDto,
  ) {
    return this.checkpointsService.getManifest(user, query);
  }

  @Post('passenger-no-show-by-id')
  @Roles(Role.operator, Role.regional, Role.admin)
  @ApiOperation({
    summary:
      'Catat Penumpang No-Show (Tidak Datang) berdasarkan Order ID - Tiket hangus tanpa refund',
  })
  @ApiResponse({ status: 201, description: 'Penumpang no-show berhasil dicatat' })
  @ApiResponse({
    status: 400,
    description: 'Status order tidak valid atau trip belum check-in',
  })
  @ApiResponse({
    status: 403,
    description: 'Operator tidak berhak di pos tersebut',
  })
  @ApiResponse({
    status: 404,
    description: 'Order tidak ditemukan',
  })
  async passengerNoShowById(
    @GetUser() user: any,
    @Body() dto: PassengerNoShowDto,
  ) {
    return this.checkpointsService.processPassengerNoShowById(user, dto);
  }

  @Post('mitra-no-show-by-id')
  @Roles(Role.operator, Role.regional, Role.admin)
  @ApiOperation({
    summary:
      'Catat Mitra No-Show (Tidak Datang ke Pos) berdasarkan Trip ID - Trip dibatalkan, semua penumpang di-refund',
  })
  @ApiResponse({ status: 201, description: 'Mitra no-show berhasil dicatat' })
  @ApiResponse({
    status: 400,
    description: 'Status trip tidak valid atau trip sudah melewati pos lain',
  })
  @ApiResponse({
    status: 403,
    description: 'Operator tidak berhak di pos tersebut',
  })
  @ApiResponse({
    status: 404,
    description: 'Trip tidak ditemukan',
  })
  async mitraNoShowById(
    @GetUser() user: any,
    @Body() dto: MitraNoShowDto,
  ) {
    return this.checkpointsService.processMitraNoShowById(user, dto);
  }
}
