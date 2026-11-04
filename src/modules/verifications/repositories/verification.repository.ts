import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  VerificationStatus,
  VerificationType,
} from '../../../generated/prisma/enums';
import { Role } from '../../../generated/prisma/enums';

@Injectable()
export class VerificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  private safeParseBigInt(id: string): bigint | null {
    try {
      return BigInt(id);
    } catch {
      return null;
    }
  }

  async findPendingOrApprovedByUserId(userId: bigint, type: VerificationType) {
    return this.prisma.verification.findFirst({
      where: {
        userId,
        type,
        status: {
          in: [VerificationStatus.pending, VerificationStatus.approved],
        },
      },
    });
  }

  async findProfileByKtpNumber(ktpNumber: string) {
    if (!ktpNumber) return null;
    const cleanKtp = ktpNumber.trim();
    if (!cleanKtp) return null;
    return this.prisma.userProfile.findFirst({
      where: { ktpNumber: cleanKtp },
      include: { user: true },
    });
  }

  async createVerification(data: {
    userId: bigint;
    type: VerificationType;
    files: { filePath: string; fileType: string }[];
    profileData?: {
      ktpNumber?: string;
      fullNameKtp?: string;
      addressKtp?: string;
      faceImageUrl?: string;
    };
  }) {
    return this.prisma.$transaction(async (tx) => {
      if (data.profileData && Object.keys(data.profileData).length > 0) {
        await tx.userProfile.upsert({
          where: { userId: data.userId },
          update: {
            ...(data.profileData.ktpNumber
              ? { ktpNumber: data.profileData.ktpNumber }
              : {}),
            ...(data.profileData.fullNameKtp
              ? { fullNameKtp: data.profileData.fullNameKtp }
              : {}),
            ...(data.profileData.addressKtp
              ? { addressKtp: data.profileData.addressKtp }
              : {}),
            ...(data.profileData.faceImageUrl
              ? { faceImageUrl: data.profileData.faceImageUrl }
              : {}),
          },
          create: {
            userId: data.userId,
            ktpNumber: data.profileData.ktpNumber || null,
            fullNameKtp: data.profileData.fullNameKtp || null,
            addressKtp: data.profileData.addressKtp || null,
            faceImageUrl: data.profileData.faceImageUrl || null,
          },
        });
      }

      const verification = await tx.verification.create({
        data: {
          userId: data.userId,
          type: data.type,
          status: VerificationStatus.pending,
          files: {
            create: data.files,
          },
        },
        include: {
          files: true,
          user: {
            include: { profile: true },
          },
        },
      });

      const allUserVerifications = await tx.verification.findMany({
        where: { userId: data.userId },
        orderBy: { createdAt: 'desc' },
      });

      const latestVerificationsMap = new Map<string, VerificationStatus>();
      for (const v of allUserVerifications) {
        if (!latestVerificationsMap.has(v.type)) {
          latestVerificationsMap.set(v.type, v.status);
        }
      }

      const hasRejected = Array.from(latestVerificationsMap.values()).some(
        (status) => status === VerificationStatus.rejected,
      );

      if (!hasRejected) {
        await tx.user.update({
          where: { id: data.userId },
          data: {
            statusVerification: VerificationStatus.pending,
          },
        });
      }

      return verification;
    });
  }

  async findById(id: string) {
    const parseId = this.safeParseBigInt(id);
    if (!parseId) return null;

    return this.prisma.verification.findUnique({
      where: { id: parseId },
      include: {
        files: true,
        user: {
          include: { profile: true, vehicles: true },
        },
        approvedByUser: true,
      },
    });
  }

  async findAll(status?: VerificationStatus, regionId?: string) {
    const parsedRegionid = regionId ? this.safeParseBigInt(regionId) : null;

    return this.prisma.verification.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(parsedRegionid
          ? {
              OR: [
                { user: { regionId: parsedRegionid } },
                { user: { regionId: null } },
              ],
            }
          : {}),
      },
      include: {
        files: true,
        user: {
          include: { profile: true, vehicles: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateReviewStatus(
    id: string,
    adminId: string,
    status: VerificationStatus,
    rejectionReason?: string,
  ) {
    const parseid = this.safeParseBigInt(id);
    const parseAdminId = this.safeParseBigInt(adminId);

    if (!parseid) {
      throw new BadRequestException('Format id tidak valid');
    }

    if (!parseAdminId) {
      throw new BadRequestException('Format Id admin pengulas tidak valid');
    }

    return this.prisma.$transaction(async (tx) => {
      const updatedVerification = await tx.verification.update({
        where: { id: parseid },
        data: {
          status,
          approvedByUserId: parseAdminId,
          rejectionReason:
            status === VerificationStatus.rejected ? rejectionReason : null,
        },
        include: {
          files: true,
          user: {
            include: { profile: true },
          },
        },
      });

      const userId = updatedVerification.userId;

      if (status === VerificationStatus.approved) {
        const currentUserData = await tx.user.findUnique({
          where: { id: userId },
        });
        if (currentUserData && !currentUserData.regionId && parseAdminId) {
          const adminUser = await tx.user.findUnique({
            where: { id: parseAdminId },
          });
          if (adminUser?.regionId) {
            await tx.user.update({
              where: { id: userId },
              data: { regionId: adminUser.regionId },
            });
          }
        }

        await tx.userProfile.upsert({
          where: { userId },
          update: { isFaceVerified: true },
          create: {
            userId,
            isFaceVerified: true,
          },
        });
      }

      const allUserVerifications = await tx.verification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });

      const latestVerificationsMap = new Map<string, VerificationStatus>();
      for (const v of allUserVerifications) {
        if (!latestVerificationsMap.has(v.type)) {
          latestVerificationsMap.set(v.type, v.status);
        }
      }

      const latestStatuses = Array.from(latestVerificationsMap.values());
      const hasRejected = latestStatuses.some(
        (st) => st === VerificationStatus.rejected,
      );
      const userRole = updatedVerification.user?.role;

      const requiredDocTypes =
        userRole === Role.mitra
          ? [
              VerificationType.ktp,
              VerificationType.sim,
              VerificationType.skck,
              VerificationType.stnk,
            ]
          : [VerificationType.ktp];

      const allRequiredApproved = requiredDocTypes.every(
        (type) =>
          latestVerificationsMap.get(type) === VerificationStatus.approved,
      );

      let newGlobalStatus: VerificationStatus = VerificationStatus.pending;

      if (hasRejected) {
        newGlobalStatus = VerificationStatus.rejected;
      } else if (allRequiredApproved) {
        newGlobalStatus = VerificationStatus.approved;
      } else {
        newGlobalStatus = VerificationStatus.pending;
      }

      await tx.user.update({
        where: { id: userId },
        data: { statusVerification: newGlobalStatus },
      });

      return updatedVerification;
    });
  }

  async findByUserId(userId: bigint) {
    return this.prisma.verification.findMany({
      where: { userId },
      include: { files: true },
      orderBy: { createdAt: 'desc' },
    });
  }
}
