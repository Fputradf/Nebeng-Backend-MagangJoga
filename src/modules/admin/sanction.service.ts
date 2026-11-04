import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  SanctionViolationType,
  SanctionStatus,
  AppealStatus,
  UserStatus,
} from '../../generated/prisma/enums';
import { UpdateSanctionSettingsDto } from './dto/update-sanction-settings.dto';

export const DEFAULT_SANCTION_SETTINGS = {
  lateToleranceMinutes: 15,
  earlyCancelHours: 4,
  baseScore: 100,
  warningThreshold: 80,
  suspensionThreshold: 50,
  policies: {
    mitraCancelEarly: {
      label: 'Pembatalan Dini (Mitra)',
      description: 'Mitra membatalkan perjalanan lebih dari batas waktu awal sebelum berangkat',
      tier1ScoreDeduction: 5,
      tier1SuspensionDays: 0,
      tier2ScoreDeduction: 10,
      tier2SuspensionDays: 0,
      autoSuspendOnTier2: false,
    },
    mitraCancelLate: {
      label: 'Pembatalan Mendadak (Mitra)',
      description: 'Mitra membatalkan perjalanan mendekati waktu keberangkatan',
      tier1ScoreDeduction: 15,
      tier1SuspensionDays: 0,
      tier2ScoreDeduction: 25,
      tier2SuspensionDays: 3,
      autoSuspendOnTier2: true,
    },
    mitraNoShow: {
      label: 'Mitra Tidak Hadir (No-Show)',
      description: 'Mitra tidak hadir di titik jemput pada waktu keberangkatan',
      tier1ScoreDeduction: 30,
      tier1SuspensionDays: 1,
      tier2ScoreDeduction: 40,
      tier2SuspensionDays: 7,
      autoSuspendOnTier2: true,
    },
    userReportViolation: {
      label: 'Laporan Pelanggaran Pengguna',
      description: 'Pelanggaran etika, pelecehan, atau pelanggaran keselamatan yang terverifikasi',
      tier1ScoreDeduction: 40,
      tier1SuspensionDays: 3,
      tier2ScoreDeduction: 60,
      tier2SuspensionDays: 14,
      autoSuspendOnTier2: true,
    },
  },
};

export interface SanctionPolicy {
  scoreDeduction: number;
  suspensionDays: number;
  triggerSuspend: boolean;
}

@Injectable()
export class SanctionService {
  constructor(private readonly prisma: PrismaService) {}

  private safeParseBigInt(id: string): bigint {
    try {
      return BigInt(id);
    } catch {
      throw new BadRequestException(`Format ID '${id}' tidak valid`);
    }
  }

  /**
   * Kebijakan sanksi berbasis konfigurasi & tingkat pelanggaran (tier)
   * Tier 1 = pelanggaran awal
   * Tier >= 2 = eskalasi karena pola pembatalan berulang
   */
  getPolicy(violationType: SanctionViolationType, tier = 1): SanctionPolicy {
    switch (violationType) {
      case SanctionViolationType.MITRA_CANCEL_EARLY:
        // Pembatalan dini (>= MITRA_EARLY_CANCEL_HOURS): sanksi ringan
        if (tier >= 2) {
          // Jika pola berulang terpicu, eskalasi ke potongan skor lebih besar
          return { scoreDeduction: 10, suspensionDays: 0, triggerSuspend: false };
        }
        return { scoreDeduction: 5, suspensionDays: 0, triggerSuspend: false };

      case SanctionViolationType.MITRA_CANCEL_LATE:
        // Pembatalan mendadak (< MITRA_EARLY_CANCEL_HOURS): sanksi sedang hingga suspensi
        if (tier >= 2) {
          // Pola berulang untuk pembatalan mendadak: potongan skor lebih tinggi & suspensi 3 hari
          return { scoreDeduction: 25, suspensionDays: 3, triggerSuspend: true };
        }
        return { scoreDeduction: 15, suspensionDays: 0, triggerSuspend: false };

      case SanctionViolationType.MITRA_NO_SHOW:
        return { scoreDeduction: 30, suspensionDays: 1, triggerSuspend: true };

      default:
        return { scoreDeduction: 5, suspensionDays: 0, triggerSuspend: false };
    }
  }

  /**
   * Terapkan sanksi kepada mitra dalam transaksi yang sedang berjalan (atau mandiri)
   */
  async applySanction(
    mitraId: bigint,
    tripId: bigint | null,
    violationType: SanctionViolationType,
    tier = 1,
    externalTx?: any,
  ) {
    const tx = externalTx || this.prisma;
    const policy = this.getPolicy(violationType, tier);

    const now = new Date();
    let suspendedUntil: Date | null = null;
    if (policy.triggerSuspend && policy.suspensionDays > 0) {
      suspendedUntil = new Date(now.getTime() + policy.suspensionDays * 24 * 60 * 60 * 1000);
    }

    // Buat catatan sanksi
    const sanction = await (tx as any).mitraSanction.create({
      data: {
        mitraId,
        tripId,
        violationType,
        scoreDeduction: policy.scoreDeduction,
        tier,
        isSuspended: policy.triggerSuspend,
        suspendedUntil,
        status: SanctionStatus.ACTIVE,
      },
    });

    // Perbarui status user jika terpicu suspensi
    if (policy.triggerSuspend) {
      await (tx as any).user.update({
        where: { id: mitraId },
        data: {
          status: UserStatus.suspended,
        },
      });
    }

    return {
      sanction,
      scoreDeduction: policy.scoreDeduction,
      tier,
      isSuspended: policy.triggerSuspend,
      suspendedUntil,
    };
  }

  /**
   * Ambil riwayat sanksi mitra & status suspensi
   */
  async getMitraSanctions(mitraIdStr: string) {
    const mitraId = this.safeParseBigInt(mitraIdStr);

    const user = await (this.prisma as any).user.findUnique({
      where: { id: mitraId },
      select: {
        id: true,
        name: true,
        status: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Mitra tidak ditemukan');
    }

    const sanctions = await (this.prisma as any).mitraSanction.findMany({
      where: { mitraId },
      include: {
        appeals: {
          orderBy: { createdAt: 'desc' },
        },
        trip: {
          select: {
            id: true,
            originPoint: { select: { name: true } },
            destinationPoint: { select: { name: true } },
            departureDate: true,
            departureTime: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Hitung total skor dikurangi
    const activeScoreDeduction = sanctions
      .filter((s) => s.status === SanctionStatus.ACTIVE)
      .reduce((sum, s) => sum + s.scoreDeduction, 0);

    const baseScore = 100;
    const currentScore = Math.max(0, baseScore - activeScoreDeduction);

    const activeSuspension = sanctions.find(
      (s) => s.status === SanctionStatus.ACTIVE && s.isSuspended && s.suspendedUntil && s.suspendedUntil > new Date(),
    );

    return {
      mitraId: mitraId.toString(),
      currentScore,
      baseScore,
      status: user.status,
      isSuspended: Boolean(activeSuspension || user.status === UserStatus.suspended),
      suspendedUntil: activeSuspension?.suspendedUntil || null,
      sanctions: sanctions.map((s) => ({
        id: s.id.toString(),
        tripId: s.tripId ? s.tripId.toString() : null,
        violationType: s.violationType,
        scoreDeduction: s.scoreDeduction,
        tier: s.tier,
        isSuspended: s.isSuspended,
        suspendedUntil: s.suspendedUntil,
        status: s.status,
        createdAt: s.createdAt,
        tripDetails: s.trip
          ? {
              id: s.trip.id.toString(),
              from: s.trip.originPoint?.name,
              to: s.trip.destinationPoint?.name,
              date: s.trip.departureDate,
              time: s.trip.departureTime,
            }
          : null,
        appeals: s.appeals.map((a) => ({
          id: a.id.toString(),
          reason: a.reason,
          evidenceUrl: a.evidenceUrl,
          status: a.status,
          reviewNotes: a.reviewNotes,
          createdAt: a.createdAt,
        })),
      })),
    };
  }

  /**
   * Mitra mengajukan banding terhadap sanksi
   */
  async submitAppeal(
    mitraIdStr: string,
    sanctionIdStr: string,
    dto: { reason: string; evidenceUrl?: string },
  ) {
    const mitraId = this.safeParseBigInt(mitraIdStr);
    const sanctionId = this.safeParseBigInt(sanctionIdStr);

    const sanction = await (this.prisma as any).mitraSanction.findUnique({
      where: { id: sanctionId },
    });

    if (!sanction) {
      throw new NotFoundException('Sanksi tidak ditemukan');
    }

    if (sanction.mitraId !== mitraId) {
      throw new ForbiddenException('Anda tidak berhak mengajukan banding untuk sanksi ini');
    }

    if (sanction.status === SanctionStatus.WAIVED) {
      throw new BadRequestException('Sanksi ini sudah dicabut sebelumnya');
    }

    // Cek apakah sudah ada banding pending
    const existingPending = await (this.prisma as any).mitraSanctionAppeal.findFirst({
      where: {
        sanctionId,
        status: AppealStatus.PENDING,
      },
    });

    if (existingPending) {
      throw new BadRequestException('Banding untuk sanksi ini sudah diajukan dan sedang menunggu review admin');
    }

    const appeal = await (this.prisma as any).mitraSanctionAppeal.create({
      data: {
        sanctionId,
        mitraId,
        reason: dto.reason,
        evidenceUrl: dto.evidenceUrl,
        status: AppealStatus.PENDING,
      },
    });

    return {
      message: 'Banding berhasil diajukan dan menunggu tinjauan admin',
      appeal: {
        id: appeal.id.toString(),
        sanctionId: appeal.sanctionId.toString(),
        status: appeal.status,
        reason: appeal.reason,
        evidenceUrl: appeal.evidenceUrl,
        createdAt: appeal.createdAt,
      },
    };
  }

  /**
   * Admin meninjau banding sanksi mitra
   * Jika disetujui: Sanksi di-REVOKE, skor dikembalikan, status suspensi dicabut bila tidak ada sanksi suspensi aktif lainnya.
   * REFUND & POIN CUSTOMER TIDAK DIBATALKAN.
   */
  async reviewAppeal(
    adminUserIdStr: string,
    appealIdStr: string,
    dto: { approved: boolean; reviewNotes?: string },
  ) {
    const adminUserId = this.safeParseBigInt(adminUserIdStr);
    const appealId = this.safeParseBigInt(appealIdStr);

    const appeal = await (this.prisma as any).mitraSanctionAppeal.findUnique({
      where: { id: appealId },
      include: { sanction: true },
    });

    if (!appeal) {
      throw new NotFoundException('Data banding tidak ditemukan');
    }

    if (appeal.status !== AppealStatus.PENDING) {
      throw new BadRequestException('Banding ini sudah ditinjau sebelumnya');
    }

    const newStatus = dto.approved ? AppealStatus.APPROVED : AppealStatus.REJECTED;

    return (this.prisma as any).$transaction(async (tx) => {
      // 1. Update appeal
      const updatedAppeal = await (tx as any).mitraSanctionAppeal.update({
        where: { id: appealId },
        data: {
          status: newStatus,
          reviewedBy: adminUserId,
          reviewNotes: dto.reviewNotes,
        },
      });

      // 2. Jika disetujui, cabut sanksi mitra (REVOKE)
      if (dto.approved) {
        await (tx as any).mitraSanction.update({
          where: { id: appeal.sanctionId },
          data: {
            status: SanctionStatus.WAIVED,
          },
        });

        // Periksa apakah mitra masih memiliki suspensi aktif lain
        const otherActiveSuspensions = await (tx as any).mitraSanction.findMany({
          where: {
            mitraId: appeal.mitraId,
            id: { not: appeal.sanctionId },
            status: SanctionStatus.ACTIVE,
            isSuspended: true,
            suspendedUntil: { gt: new Date() },
          },
        });

        if (otherActiveSuspensions.length === 0) {
          // Pulihkan status user ke active
          await (tx as any).user.update({
            where: { id: appeal.mitraId },
            data: { status: UserStatus.active },
          });
        }
      }

      return {
        message: dto.approved
          ? 'Banding disetujui. Sanksi telah dicabut dan skor mitra dipulihkan. Refund dan poin penumpang tetap berlaku.'
          : 'Banding ditolak. Sanksi tetap aktif.',
        appeal: {
          id: updatedAppeal.id.toString(),
          status: updatedAppeal.status,
          reviewNotes: updatedAppeal.reviewNotes,
        },
      };
    });
  }

  /**
   * Mengambil semua permohonan banding sanksi mitra (Superadmin & Regional Admin)
   */
  async getAllAppeals(status?: AppealStatus) {
    const where: any = {};
    if (status) {
      where.status = status;
    }

    const appeals = await (this.prisma as any).mitraSanctionAppeal.findMany({
      where,
      include: {
        mitra: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
        sanction: {
          include: {
            trip: {
              select: {
                id: true,
                originPoint: { select: { name: true } },
                destinationPoint: { select: { name: true } },
                departureDate: true,
                departureTime: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return appeals.map((a: any) => ({
      id: a.id.toString(),
      sanctionId: a.sanctionId.toString(),
      mitraId: a.mitraId.toString(),
      mitraName: a.mitra?.name || 'Mitra',
      mitraEmail: a.mitra?.email || '-',
      mitraPhone: a.mitra?.phone || '-',
      violationType: a.sanction?.violationType || 'MITRA_CANCEL_LATE',
      scoreDeduction: a.sanction?.scoreDeduction || 0,
      tier: a.sanction?.tier || 1,
      isSuspended: a.sanction?.isSuspended || false,
      suspendedUntil: a.sanction?.suspendedUntil || null,
      sanctionStatus: a.sanction?.status,
      reason: a.reason,
      evidenceUrl: a.evidenceUrl || '',
      status: a.status,
      reviewedBy: a.reviewedBy ? a.reviewedBy.toString() : null,
      reviewNotes: a.reviewNotes || '',
      createdAt: a.createdAt,
      tripDetails: a.sanction?.trip
        ? {
            id: a.sanction.trip.id.toString(),
            from: a.sanction.trip.originPoint?.name,
            to: a.sanction.trip.destinationPoint?.name,
            date: a.sanction.trip.departureDate,
            time: a.sanction.trip.departureTime,
          }
        : null,
    }));
  }

  /**
   * Mendapatkan seluruh konfigurasi kebijakan sanksi & batas toleransi telat
   */
  async getSanctionSettings() {
    try {
      const row = await this.prisma.systemSetting.findUnique({
        where: { key: 'sanction_settings' },
      });
      if (row?.value) {
        return JSON.parse(row.value);
      }
    } catch {
      // fallback
    }
    return DEFAULT_SANCTION_SETTINGS;
  }

  /**
   * Mendapatkan batas toleransi keterlambatan dalam menit (default 15)
   */
  async getLateToleranceMinutes(): Promise<number> {
    try {
      const settings = await this.getSanctionSettings();
      const val = Number(settings?.lateToleranceMinutes);
      return !isNaN(val) && val >= 5 ? val : 15;
    } catch {
      return 15;
    }
  }

  /**
   * Memperbarui konfigurasi kebijakan sanksi & batas toleransi telat
   */
  async updateSanctionSettings(dto: UpdateSanctionSettingsDto) {
    const current = await this.getSanctionSettings();
    const updated = {
      ...current,
      ...dto,
      policies: {
        ...(current.policies || {}),
        ...(dto.policies || {}),
      },
    };

    if (dto.lateToleranceMinutes !== undefined) {
      const val = Number(dto.lateToleranceMinutes);
      if (isNaN(val) || val < 5 || val > 120) {
        throw new BadRequestException(
          'Toleransi keterlambatan harus berupa angka antara 5 dan 120 menit',
        );
      }
      updated.lateToleranceMinutes = val;
    }

    await this.prisma.systemSetting.upsert({
      where: { key: 'sanction_settings' },
      create: {
        key: 'sanction_settings',
        value: JSON.stringify(updated),
        description: 'Konfigurasi kebijakan sanksi dan batas toleransi keterlambatan',
      },
      update: {
        value: JSON.stringify(updated),
      },
    });

    return updated;
  }
}
