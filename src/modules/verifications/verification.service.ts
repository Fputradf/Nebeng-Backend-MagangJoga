import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { VerificationRepository } from './repositories/verification.repository';
import { SumbitVerificationDto } from './dto/submit-verification.dto';
import { ReviewVerificationDto } from './dto/review-verification.dto';
import { VerificationMapper } from './mappers/verification.mapper';
import { Role, VerificationStatus } from '../../generated/prisma/enums';
import { NotificationHelperService } from '../notifications/notification-helper.service';

@Injectable()
export class VerificationService {
  constructor(
    private readonly verificationRepo: VerificationRepository,
    private readonly notificationHelper: NotificationHelperService,
  ) {}

  private safeParseBigInt(id: string): bigint {
    try {
      return BigInt(id);
    } catch {
      throw new BadRequestException('Format id tidak valid');
    }
  }

  async submitVerification(userId: string, dto: SumbitVerificationDto) {
    const userBigIntId = this.safeParseBigInt(userId);

    if (!dto.files || dto.files.length === 0) {
      throw new BadRequestException('File dokumen verifikasi wajib diunggah');
    }

    const existingActiveVerification =
      await this.verificationRepo.findPendingOrApprovedByUserId(
        userBigIntId,
        dto.type,
      );

    if (existingActiveVerification) {
      if (existingActiveVerification.status === VerificationStatus.pending) {
        throw new ConflictException(
          `Pengajuan verifikasi ${dto.type.toUpperCase()} Anda masih dalam antrean peninjauan`,
        );
      }

      if (existingActiveVerification.status === VerificationStatus.approved) {
        throw new ConflictException(
          `Dokumen verifikasi ${dto.type.toUpperCase()} Anda telah disetujui sebelumnya`,
        );
      }
    }

    const verification = await this.verificationRepo.createVerification({
      userId: userBigIntId,
      type: dto.type,
      files: dto.files,
      profileData: {
        ktpNumber: dto.ktpNumber,
        fullNameKtp: dto.fullNameKtp,
        addressKtp: dto.addressKtp,
        faceImageUrl: dto.faceImageUrl,
      },
    });

    return VerificationMapper.toResponse(verification);
  }

  async getAllVerifications(status?: VerificationStatus, regionId?: string) {
    const list = await this.verificationRepo.findAll(status, regionId);
    return list.map(VerificationMapper.toResponse);
  }

  async getVerificationById(id: string) {
    const verification = await this.verificationRepo.findById(id);
    if (!verification) {
      throw new NotFoundException('Verifikasi tidak ditemukan');
    }

    return VerificationMapper.toResponse(verification);
  }

  async reviewVerification(
    id: string,
    currentUser: any,
    dto: ReviewVerificationDto,
  ) {
    const adminId = currentUser.id || currentUser.sub;

    if (!adminId || adminId === 'undefined' || adminId === 'null') {
      throw new BadRequestException('ID admin pengulas tidak teridentifikasi');
    }

    const verification = await this.verificationRepo.findById(id);
    if (!verification) {
      throw new NotFoundException('Verifikasi tidak ditemukan');
    }

    if (currentUser.role === Role.regional || currentUser.role === 'regional') {
      const adminRegionId = currentUser.regionId
        ? currentUser.regionId.toString()
        : null;
      const targetUserRegionId = verification.user?.regionId
        ? verification.user.regionId.toString()
        : null;

      if (targetUserRegionId && adminRegionId !== targetUserRegionId) {
        throw new ForbiddenException(
          'Anda hanya berhak meninjau verifikasi pengguna di wilayah Anda sendiri.',
        );
      }
    }

    if (
      dto.status !== VerificationStatus.approved &&
      dto.status !== VerificationStatus.rejected
    ) {
      throw new BadRequestException(
        'Status review hanya boleh approved atau rejected',
      );
    }

    if (dto.status === VerificationStatus.rejected && !dto.rejectionReason) {
      throw new BadRequestException(
        'Alasan penolakan wajib diisi saat menolak verifikasi',
      );
    }

    const updated = await this.verificationRepo.updateReviewStatus(
      id,
      String(adminId),
      dto.status,
      dto.rejectionReason,
    );

    if (dto.status === VerificationStatus.approved) {
      await this.notificationHelper.notifyVerificationApproved(
        updated.userId.toString(),
        updated.type,
      );
    } else if (dto.status === VerificationStatus.rejected) {
      await this.notificationHelper.notifyVerificationRejected(
        updated.userId.toString(),
        updated.type,
        dto.rejectionReason || 'Dokumen tidak memenuhi persyaratan',
      );
    }

    return VerificationMapper.toResponse(updated);
  }

  async findByUserId(userId: string) {
    const userBigIntId = this.safeParseBigInt(userId);
    return this.verificationRepo.findByUserId(userBigIntId);
  }
}
