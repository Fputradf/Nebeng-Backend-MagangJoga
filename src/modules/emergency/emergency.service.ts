import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { PushService } from '../notifications/push.service';
import { NotificationType, SosStatus } from '../../generated/prisma/enums';
import { CreateSosDto } from './dto/create-sos.dto';
import { ResolveSosDto } from './dto/resolve-sos.dto';

@Injectable()
export class EmergencyService {
  private readonly logger = new Logger(EmergencyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsGateway: NotificationsGateway,
    private readonly pushService: PushService,
  ) {}

  /**
   * Helper untuk serialisasi BigInt ke string
   */
  private serializeBigInt(data: any): any {
    return JSON.parse(
      JSON.stringify(data, (key, value) =>
        typeof value === 'bigint' ? value.toString() : value,
      ),
    );
  }

  /**
   * Pemicuan sinyal darurat (SOS) oleh Customer
   */
  async triggerSos(user: any, dto: CreateSosDto) {
    const customerId = BigInt(user.sub || user.id);
    const orderId = BigInt(dto.orderId);
    const tripId = BigInt(dto.tripId);

    this.logger.warn(
      `[SOS TRIGGERED] Customer ${customerId} triggered SOS on Order ${orderId}, Trip ${tripId}`,
    );

    // 1. Validasi Order dan Trip
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: true,
        checkpointsLogs: true,
        trip: {
          include: {
            mitra: true,
            vehicle: true,
            originPoint: {
              include: { region: true },
            },
            destinationPoint: {
              include: { region: true },
            },
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Data tiket / pesanan tidak ditemukan.');
    }

    if (order.customerId !== customerId) {
      throw new BadRequestException('Anda tidak memiliki otoritas atas tiket ini.');
    }

    const trip = order.trip;
    if (!trip) {
      throw new NotFoundException('Data perjalanan tidak ditemukan.');
    }

    // Validasi syarat: Customer harus sudah check-in di Pos 1 (Pos Asal) dan sedang dalam perjalanan
    const hasCheckinOrigin =
      order.checkpointsLogs?.some((log) => log.scanType === 'checkin_origin') ||
      order.status === 'checked_in_origin' ||
      order.status === 'in_transit';

    const isInTransit =
      trip.status === 'in_transit' ||
      order.status === 'in_transit';

    if (!hasCheckinOrigin || !isInTransit) {
      throw new BadRequestException(
        'Fitur SOS hanya dapat diaktifkan setelah Anda selesai check-in di Pos 1 (Pos Asal) dan armada sedang dalam perjalanan.',
      );
    }

    // Tentukan wilayah operasional (diutamakan region titik asal atau tujuan)
    const regionId = trip.originPoint?.regionId || trip.destinationPoint?.regionId;
    if (!regionId) {
      throw new BadRequestException('Wilayah operasional untuk perjalanan ini tidak valid.');
    }

    // 2. Simpan rekaman SOS ke database
    const sosAlert = await this.prisma.sosAlert.create({
      data: {
        orderId,
        tripId,
        customerId,
        regionId,
        latitude: dto.latitude,
        longitude: dto.longitude,
        category: dto.category || 'emergency',
        notes: dto.notes || null,
        status: SosStatus.ACTIVE,
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
          },
        },
        trip: {
          include: {
            mitra: {
              select: {
                id: true,
                name: true,
                phone: true,
              },
            },
            vehicle: {
              select: {
                type: true,
                model: true,
                plateNumber: true,
                color: true,
              },
            },
            originPoint: {
              select: {
                id: true,
                name: true,
                address: true,
              },
            },
            destinationPoint: {
              select: {
                id: true,
                name: true,
                address: true,
              },
            },
          },
        },
        region: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
    });

    const serializedAlert = this.serializeBigInt(sosAlert);

    // 3. Cari penerima notifikasi darurat: Admin Regional, Superadmin, dan Mitra Pos (Operator Pos)
    const [regionalAdmins, superAdmins, posOperators] = await Promise.all([
      // A. Admin Regional aktif pada wilayah terkait
      this.prisma.user.findMany({
        where: {
          role: 'regional',
          regionId,
          status: 'active',
        },
        select: { id: true, name: true, role: true },
      }),
      // B. Superadmin aktif
      this.prisma.user.findMany({
        where: {
          role: 'admin',
          status: 'active',
        },
        select: { id: true, name: true, role: true },
      }),
      // C. Mitra Pos (Operator Pos) aktif yang bertugas di pos asal, pos tujuan, atau wilayah terkait
      this.prisma.user.findMany({
        where: {
          role: 'operator',
          status: 'active',
          OR: [
            { regionId },
            {
              assignedPickupPoints: {
                some: {
                  OR: [
                    ...(trip.originPointId ? [{ id: trip.originPointId }] : []),
                    ...(trip.destinationPointId ? [{ id: trip.destinationPointId }] : []),
                    { regionId },
                  ],
                },
              },
            },
          ],
        },
        select: { id: true, name: true, role: true },
      }),
    ]);

    const recipientsMap = new Map<string, { id: bigint; name: string; role: string; actionUrl: string }>();

    for (const admin of regionalAdmins) {
      recipientsMap.set(admin.id.toString(), {
        id: admin.id,
        name: admin.name,
        role: 'regional',
        actionUrl: '/regional/dashboard',
      });
    }

    for (const superAdmin of superAdmins) {
      recipientsMap.set(superAdmin.id.toString(), {
        id: superAdmin.id,
        name: superAdmin.name,
        role: 'admin',
        actionUrl: '/admin/dashboard',
      });
    }

    for (const operator of posOperators) {
      recipientsMap.set(operator.id.toString(), {
        id: operator.id,
        name: operator.name,
        role: 'operator',
        actionUrl: '/operator-pos/manifest',
      });
    }

    const allRecipients = Array.from(recipientsMap.values());
    this.logger.log(
      `[SOS NOTIFICATIONS] Sending alerts to ${allRecipients.length} recipients: ${regionalAdmins.length} Regional Admin(s), ${superAdmins.length} Super Admin(s), ${posOperators.length} Mitra Pos`,
    );

    const categoryLabelMap: Record<string, string> = {
      ancaman_kejahatan: 'Ancaman Kejahatan / Pelecehan',
      kecelakaan: 'Kecelakaan Lalu Lintas',
      emergency: 'Keadaan Darurat / Bahaya',
    };
    const readableCategory = categoryLabelMap[dto.category || 'emergency'] || dto.category || 'Keadaan Darurat';

    // 4. Siarkan notifikasi darurat instan via WebSocket ke room regional, superadmin, dan operator pos
    await this.notificationsGateway.emitSosAlertToRegion(
      regionId.toString(),
      serializedAlert,
    );

    // 5. Kirim Web Push Notification dan buat UserNotification untuk setiap penerima (Mitra Pos, Admin Wilayah, Super Admin)
    const pushTitle = `🚨 SOS DARURAT: Bantuan Penumpang!`;
    const pushBody = `${order.customer.name} memicu sinyal SOS di ${trip.originPoint.name} ➔ ${trip.destinationPoint.name}. Kategori: ${readableCategory}. Segera buka dashboard!`;

    for (const recipient of allRecipients) {
      try {
        // Simpan notifikasi ke database
        const userNotif = await this.prisma.userNotification.create({
          data: {
            userId: recipient.id,
            type: NotificationType.emergency_sos,
            title: pushTitle,
            body: pushBody,
            data: JSON.stringify({
              type: 'emergency_sos',
              sosId: sosAlert.id.toString(),
              orderId: orderId.toString(),
              tripId: tripId.toString(),
              regionId: regionId.toString(),
              latitude: dto.latitude,
              longitude: dto.longitude,
              category: readableCategory,
              priority: 'high',
              actionUrl: recipient.actionUrl,
            }),
          },
        });

        // Kirim Web Push via pushService
        await this.pushService.sendToUser(recipient.id, {
          title: pushTitle,
          body: pushBody,
          tag: `sos-alert-${sosAlert.id}`,
          icon: '/favicon.svg',
          url: recipient.actionUrl,
        });

        // Emit notifikasi realtime ke user
        const unreadCount = await this.prisma.userNotification.count({
          where: { userId: recipient.id, isRead: false },
        });
        await this.notificationsGateway.emitNotificationToUser(
          recipient.id.toString(),
          this.serializeBigInt(userNotif),
          unreadCount,
        );
      } catch (err: any) {
        this.logger.error(
          `Failed sending notification to ${recipient.role} ${recipient.id}: ${err.message}`,
        );
      }
    }

    // 6. Simpan konfirmasi UserNotification untuk customer
    try {
      await this.prisma.userNotification.create({
        data: {
          userId: customerId,
          type: NotificationType.emergency_sos,
          title: 'Sinyal SOS Diterima',
          body: 'Sinyal darurat Anda telah terkirim ke Mitra Pos, Admin Wilayah & Super Admin. Tetap tenang dan amankan posisi Anda.',
          data: JSON.stringify({
            type: 'emergency_sos',
            sosId: sosAlert.id.toString(),
            orderId: orderId.toString(),
            status: 'ACTIVE',
          }),
        },
      });
    } catch (custNotifErr: any) {
      this.logger.warn(`Could not save customer SOS confirmation: ${custNotifErr.message}`);
    }

    return {
      success: true,
      message: 'Sinyal SOS darurat berhasil dikirim ke Mitra Pos, Admin Wilayah, dan Super Admin.',
      data: serializedAlert,
    };
  }

  /**
   * Ambil daftar insiden SOS aktif di wilayah kerja Admin Regional, Superadmin, atau Mitra Pos
   */
  async getActiveSosByRegion(user: any) {
    const userId = BigInt(user.sub || user.id);
    const userRole = user.role;

    let targetRegionId: bigint | null = null;

    if (userRole === 'regional') {
      const dbUser = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { regionId: true },
      });
      targetRegionId = dbUser?.regionId || null;
    } else if (userRole === 'operator') {
      const dbUser = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          regionId: true,
          assignedPickupPoints: { select: { regionId: true } },
        },
      });
      targetRegionId =
        dbUser?.regionId ||
        dbUser?.assignedPickupPoints?.[0]?.regionId ||
        null;
    }
    // Jika userRole === 'admin' (superadmin), targetRegionId tetap null sehingga melihat seluruh wilayah

    const whereClause: any = {
      status: {
        in: [SosStatus.ACTIVE, SosStatus.INVESTIGATING],
      },
    };

    if (targetRegionId) {
      whereClause.regionId = targetRegionId;
    }

    const activeAlerts = await this.prisma.sosAlert.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
          },
        },
        trip: {
          include: {
            mitra: {
              select: {
                id: true,
                name: true,
                phone: true,
              },
            },
            vehicle: {
              select: {
                type: true,
                model: true,
                plateNumber: true,
                color: true,
              },
            },
            originPoint: {
              select: {
                id: true,
                name: true,
                address: true,
              },
            },
            destinationPoint: {
              select: {
                id: true,
                name: true,
                address: true,
              },
            },
          },
        },
        region: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
    });

    return {
      success: true,
      count: activeAlerts.length,
      data: this.serializeBigInt(activeAlerts),
    };
  }

  /**
   * Selesaikan / Tandai Aman laporan SOS oleh Admin Regional
   */
  async resolveSos(user: any, sosIdParam: string, dto: ResolveSosDto) {
    const adminId = BigInt(user.sub || user.id);
    const sosId = BigInt(sosIdParam);

    const alert = await this.prisma.sosAlert.findUnique({
      where: { id: sosId },
    });

    if (!alert) {
      throw new NotFoundException('Data laporan SOS tidak ditemukan.');
    }

    const newStatus =
      dto.status === 'FALSE_ALARM' ? SosStatus.FALSE_ALARM : SosStatus.RESOLVED;

    const updatedAlert = await this.prisma.sosAlert.update({
      where: { id: sosId },
      data: {
        status: newStatus,
        resolvedById: adminId,
        resolvedAt: new Date(),
        notes: dto.notes ? `${alert.notes ? alert.notes + '\n' : ''}[Admin Note]: ${dto.notes}` : alert.notes,
      },
      include: {
        resolvedByUser: {
          select: { id: true, name: true },
        },
      },
    });

    const serialized = this.serializeBigInt(updatedAlert);

    // Siarkan pembaruan status ke Admin Regional dan Customer
    await this.notificationsGateway.emitSosResolvedToRegion(
      alert.regionId.toString(),
      alert.customerId.toString(),
      serialized,
    );

    return {
      success: true,
      message: `Status insiden SOS berhasil diperbarui menjadi ${newStatus}.`,
      data: serialized,
    };
  }
}
