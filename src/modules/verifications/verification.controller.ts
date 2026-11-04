import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
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
import { VerificationService } from './verification.service';
import { SumbitVerificationDto } from './dto/submit-verification.dto';
import { ReviewVerificationDto } from './dto/review-verification.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role, VerificationStatus } from '../../generated/prisma/enums';
import { GetUser } from '../../common/decorators/get-user.decorators';

@ApiTags('Verifications')
@Controller('verifications')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class VerificationController {
  constructor(private readonly verificationService: VerificationService) {}

  @Post('submit')
  @Roles(Role.customer, Role.mitra)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit dokumen verifikasi (KTP/SIM/SKCK/STNK)' })
  @ApiResponse({
    status: 201,
    description: 'Dokumen verifikasi berhasil dikirim dan menunggu peninjauan',
  })
  @ApiResponse({ status: 400, description: 'Payload atau file tidak valid' })
  @ApiResponse({
    status: 409,
    description:
      'Dokumen verifikasi jenis ini sedang diproses atau sudah disetujui',
  })
  async submit(
    @GetUser('id') userId: string,
    @Body() dto: SumbitVerificationDto,
  ) {
    return this.verificationService.submitVerification(String(userId), dto);
  }

  @Get()
  @Roles(Role.admin, Role.regional)
  @ApiOperation({ summary: 'Melihat seluruh daftar antrean verifikasi' })
  @ApiQuery({ name: 'status', enum: VerificationStatus, required: false })
  @ApiResponse({
    status: 200,
    description: 'Daftar verifikasi berhasil diambil',
  })
  async findAll(
    @GetUser() currentUser: any,
    @Query('status') status?: VerificationStatus,
  ) {
    const targetRegionId =
      currentUser.role === Role.regional || currentUser.role === 'regional'
        ? currentUser.regionId?.toString()
        : undefined;

    return this.verificationService.getAllVerifications(status, targetRegionId);
  }

  @Get('my-status')
  @Roles(Role.customer, Role.mitra)
  @ApiOperation({
    summary: 'Melihat status pengajuan verifikasi milik sendiri',
  })
  @ApiResponse({
    status: 200,
    description: 'Status verifikasi berhasil diambil',
  })
  async getMyVerificationStatus(@GetUser('id') userId: string) {
    return this.verificationService.findByUserId(String(userId));
  }

  @Get('check-nik')
  @Roles(Role.customer, Role.mitra, Role.admin, Role.regional)
  @ApiOperation({ summary: 'Mengecek ketersediaan NIK / KTP' })
  @ApiQuery({ name: 'nik', required: true, description: '16 digit NIK KTP' })
  @ApiResponse({ status: 200, description: 'Status ketersediaan NIK' })
  async checkNik(
    @GetUser('id') userId: string,
    @Query('nik') nik: string,
  ) {
    return this.verificationService.checkNikAvailability(nik, String(userId));
  }

  @Get(':id')
  @Roles(Role.admin, Role.regional, Role.mitra, Role.customer)
  @ApiOperation({ summary: 'Melihat detail verifikasi berdasarkan ID' })
  @ApiResponse({ status: 200, description: 'Detail verifikasi ditemukan' })
  @ApiResponse({ status: 404, description: 'Verifikasi tidak ditemukan' })
  async findOne(@Param('id') id: string, @GetUser() currentUser: any) {
    const verification = await this.verificationService.getVerificationById(id);

    if (!verification) {
      throw new NotFoundException('Verifikasi tidak ditemukan');
    }

    const currentUserId = String(currentUser.id);
    const currentUserRole = currentUser.role;

    if (currentUserRole === Role.regional || currentUserRole === 'regional') {
      const adminRegionId = currentUser.regionId
        ? currentUser.regionId.toString()
        : null;
      const targetUserRegionId = verification.user?.regionId
        ? verification.user.regionId.toString()
        : null;

      if (
        adminRegionId &&
        targetUserRegionId &&
        adminRegionId !== targetUserRegionId
      ) {
        throw new ForbiddenException(
          'Anda tidak memiliki akses untuk melihat detail verifikasi pengguna di wilayah lain',
        );
      }
    } else if (currentUserRole !== Role.admin) {
      const ownerUserId = String(verification.userId || verification.user?.id);
      if (ownerUserId !== currentUserId) {
        throw new ForbiddenException(
          'Anda tidak memiliki akses untuk melihat detail verifikasi ini',
        );
      }
    }

    return verification;
  }

  @Patch(':id/review')
  @Roles(Role.admin, Role.regional)
  @ApiOperation({ summary: 'Approve atau Reject dokumen verifikasi' })
  @ApiResponse({
    status: 200,
    description: 'Status verifikasi berhasil ditinjau dan diperbarui',
  })
  @ApiResponse({
    status: 400,
    description: 'Wajib mengisi alasan penolakan jika status REJECTED',
  })
  @ApiResponse({ status: 404, description: 'Verifikasi tidak ditemukan' })
  async review(
    @Param('id') id: string,
    @GetUser() currentUser: any,
    @Body() dto: ReviewVerificationDto,
  ) {
    return this.verificationService.reviewVerification(id, currentUser, dto);
  }
}
