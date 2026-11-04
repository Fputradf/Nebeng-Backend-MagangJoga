import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  Role,
  ReportStatus,
  ReportCategory,
  ReportSeverity,
  SanctionViolationType,
  SanctionStatus,
  NotificationType,
} from '../../generated/prisma/enums';
import { CreateReportDto } from './dto/create-report.dto';
import { ResolveReportDto } from './dto/resolve-report.dto';
import { QueryReportDto } from './dto/query-report.dto';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  private serializeBigInt(data: any): any {
    return JSON.parse(
      JSON.stringify(data, (key, value) =>
        typeof value === 'bigint' ? value.toString() : value,
      ),
    );
  }

  /**
   * Buat Laporan Pelanggaran Baru (3 Arah: Customer, Driver, Mitra Pos)
   */
  async createReport(user: any, dto: CreateReportDto) {
    const reporterId = BigInt(user.sub || user.id);
    let reportedUserId = BigInt(dto.reportedUserId);

    const tripId = dto.tripId ? BigInt(dto.tripId) : null;
    const orderId = dto.orderId ? BigInt(dto.orderId) : null;
    const pickupPointId = dto.pickupPointId ? BigInt(dto.pickupPointId) : null;

    // 0. Jika konteks adalah Pos Checkpoint, selaraskan terlapor ke Operator Pos atau Admin Regional
    if (pickupPointId) {
      const pos = await this.prisma.pickupPoint.findUnique({
        where: { id: pickupPointId },
        include: { operator: true },
      });
      if (pos) {
        if (pos.operatorId) {
          reportedUserId = pos.operatorId;
        } else {
          const fallbackAdmin =
            (await this.prisma.user.findFirst({
              where: { regionId: pos.regionId, role: Role.regional },
            })) ||
            (await this.prisma.user.findFirst({
              where: { role: Role.admin },
            }));
          if (fallbackAdmin) {
            reportedUserId = fallbackAdmin.id;
          }
        }
      }
    }

    if (reporterId === reportedUserId) {
      throw new BadRequestException('Anda tidak dapat melaporkan diri sendiri.');
    }

    // 1. Validasi keberadaan user terlapor
    const reportedUser = await this.prisma.user.findUnique({
      where: { id: reportedUserId },
      select: { id: true, name: true, role: true, status: true },
    });

    if (!reportedUser) {
      throw new NotFoundException('Pengguna atau operator yang dilaporkan tidak ditemukan.');
    }

    // 2. Wajib terikat minimal satu konteks transaksi (Trip, Order, atau PickupPoint)
    if (!dto.tripId && !dto.orderId && !dto.pickupPointId) {
      throw new BadRequestException(
        'Laporan harus terikat dengan transaksi Trip, Order tiket, atau Pickup Point terkait.',
      );
    }

    // 3. Validasi keabsahan relasi transaksi lapangan
    let contextVerified = false;
    let contextOrder: any = null;
    let contextTrip: any = null;

    // Validasi berbasis Order
    if (orderId) {
      contextOrder = await this.prisma.order.findUnique({
        where: { id: orderId },
        include: {
          checkpointsLogs: true,
          trip: {
            include: {
              originPoint: true,
              destinationPoint: true,
              checkpointsLogs: true,
            },
          },
        },
      });

      if (!contextOrder) {
        throw new NotFoundException('Data Order terkait tidak ditemukan.');
      }
      contextTrip = contextOrder.trip;

      const isReporterInOrder =
        contextOrder.customerId === reporterId ||
        contextOrder.trip.mitraId === reporterId ||
        contextOrder.trip.originPoint.operatorId === reporterId ||
        contextOrder.trip.destinationPoint.operatorId === reporterId ||
        user.role === Role.admin ||
        user.role === Role.regional;

      const isReportedInOrder =
        contextOrder.customerId === reportedUserId ||
        contextOrder.trip.mitraId === reportedUserId ||
        contextOrder.trip.originPoint.operatorId === reportedUserId ||
        contextOrder.trip.destinationPoint.operatorId === reportedUserId ||
        (pickupPointId &&
          (contextOrder.trip.originPointId === pickupPointId ||
            contextOrder.trip.destinationPointId === pickupPointId));

      if (isReporterInOrder && isReportedInOrder) {
        contextVerified = true;
      }
    }

    // Validasi berbasis Trip
    if (!contextVerified && tripId) {
      contextTrip = await this.prisma.trip.findUnique({
        where: { id: tripId },
        include: {
          orders: {
            include: {
              checkpointsLogs: true,
            },
          },
          originPoint: true,
          destinationPoint: true,
          checkpointsLogs: true,
        },
      });

      if (!contextTrip) {
        throw new NotFoundException('Data Perjalanan (Trip) terkait tidak ditemukan.');
      }

      if (!contextOrder && contextTrip.orders?.length > 0) {
        contextOrder =
          contextTrip.orders.find(
            (o: any) => o.customerId === reporterId || o.customerId === reportedUserId,
          ) || contextTrip.orders[0];
      }

      const isReporterInTrip =
        contextTrip.mitraId === reporterId ||
        contextTrip.orders.some((o: any) => o.customerId === reporterId) ||
        contextTrip.originPoint.operatorId === reporterId ||
        contextTrip.destinationPoint.operatorId === reporterId ||
        user.role === Role.admin ||
        user.role === Role.regional;

      const isReportedInTrip =
        contextTrip.mitraId === reportedUserId ||
        contextTrip.orders.some((o: any) => o.customerId === reportedUserId) ||
        contextTrip.originPoint.operatorId === reportedUserId ||
        contextTrip.destinationPoint.operatorId === reportedUserId ||
        (pickupPointId &&
          (contextTrip.originPointId === pickupPointId ||
            contextTrip.destinationPointId === pickupPointId));

      if (isReporterInTrip && isReportedInTrip) {
        contextVerified = true;
      }
    }

    // Validasi berbasis Pickup Point / Pos Checkpoint
    if (!contextVerified && pickupPointId) {
      const pos = await this.prisma.pickupPoint.findUnique({
        where: { id: pickupPointId },
        include: {
          operator: true,
        },
      });

      if (!pos) {
        throw new NotFoundException('Data Titik Kumpul / Pos Checkpoint tidak ditemukan.');
      }

      const isOperatorInvolved =
        pos.operatorId === reporterId ||
        pos.operatorId === reportedUserId ||
        user.role === Role.admin ||
        user.role === Role.regional;

      if (isOperatorInvolved) {
        contextVerified = true;
      }
    }

    if (!contextVerified) {
      throw new BadRequestException(
        'Verifikasi gagal: Anda dan pihak terlapor tidak terbukti memiliki riwayat transaksi/interaksi pada Trip, Order, atau Pos terkait.',
      );
    }

    // 3.1. Validasi Audit Checkpoint (Customer, Mitra Driver, Mitra Pos)
    const isAdminOrRegional = user.role === Role.admin || user.role === Role.regional;

    if (!isAdminOrRegional && (contextTrip || contextOrder)) {
      const customerArrivedAtPos =
        contextOrder &&
        (['checked_in_origin', 'in_transit', 'arrived_destination', 'completed'].includes(
          contextOrder.status,
        ) ||
          contextOrder.checkpointsLogs?.some(
            (l: any) => l.scanType === 'checkin_origin' || l.scanType === 'checkin_destination',
          ));

      const driverArrivedAtPos =
        contextTrip &&
        (['in_origin_pos', 'in_transit', 'arrived_dest_pos', 'completed'].includes(
          contextTrip.status,
        ) ||
          (contextTrip.checkpointsLogs && contextTrip.checkpointsLogs.length > 0) ||
          (contextOrder?.checkpointsLogs &&
            contextOrder.checkpointsLogs.some((l: any) => l.scanType === 'checkin_origin')));

      // A. Jika pelapor adalah Customer
      if (user.role === Role.customer || (contextOrder && contextOrder.customerId === reporterId)) {
        const isTripOrOrderCancelled =
          contextTrip?.status === 'cancelled' ||
          contextOrder?.status === 'cancelled' ||
          contextOrder?.status === 'cancelled_by_mitra';

        const isReportingDriverNoShow =
          dto.category === ReportCategory.DISPUTE_NO_SHOW ||
          dto.category === ReportCategory.OTHER ||
          isTripOrOrderCancelled;

        const isTargetingDriver = contextTrip && reportedUserId === contextTrip.mitraId;

        // Khusus jika trip/order dibatalkan atau melaporkan driver tidak hadir/mangkir (no-show), customer diizinkan melapor tanpa keharusan driver tiba di pos
        if (isTargetingDriver && (isTripOrOrderCancelled || isReportingDriverNoShow)) {
          // Diizinkan melapor mitra driver
        } else {
          if (!customerArrivedAtPos) {
            throw new BadRequestException(
              'Laporan belum dapat diajukan: Anda belum sampai / check-in di Pos 1 (Pos Asal) atau Pos Tujuan.',
            );
          }
          if (!driverArrivedAtPos) {
            throw new BadRequestException(
              'Laporan belum dapat diajukan: Mitra Driver belum datang / tiba di Pos.',
            );
          }
        }
      }

      // B. Jika pelapor adalah Mitra Driver
      if (user.role === Role.mitra || (contextTrip && contextTrip.mitraId === reporterId)) {
        if (!driverArrivedAtPos) {
          throw new BadRequestException(
            'Laporan belum dapat diajukan: Anda belum tiba / check-in di Pos Asal atau Pos Tujuan.',
          );
        }
        // Jika Driver melaporkan Customer spesifik
        const isTargetingCustomer =
          reportedUser.role === Role.customer ||
          (contextOrder && reportedUserId === contextOrder.customerId);

        if (isTargetingCustomer) {
          if (contextTrip && contextTrip.status !== 'completed') {
            throw new BadRequestException(
              'Laporan belum dapat diajukan: Pelaporan customer hanya dapat dilakukan saat perjalanan (trip) sudah selesai.',
            );
          }
          if (contextOrder && !customerArrivedAtPos) {
            throw new BadRequestException(
              'Laporan belum dapat diajukan: Penumpang yang dilaporkan belum sampai / check-in di Pos.',
            );
          }
        }
      }

      // C. Jika pelapor adalah Mitra Pos (Operator)
      if (user.role === Role.operator) {
        // Jika Mitra Pos melaporkan Driver
        if (contextTrip && reportedUserId === contextTrip.mitraId) {
          if (!driverArrivedAtPos) {
            throw new BadRequestException(
              'Laporan belum dapat diajukan: Driver belum datang / tiba di Pos. Jika driver mangkir/tidak hadir, silakan gunakan fitur Supir Tidak Hadir (No-Show).',
            );
          }
        }
        // Jika Mitra Pos melaporkan Customer
        if (contextOrder && reportedUserId === contextOrder.customerId) {
          if (!customerArrivedAtPos) {
            throw new BadRequestException(
              'Laporan belum dapat diajukan: Penumpang belum sampai / check-in di Pos.',
            );
          }
        }
      }

      // D. Validasi Khusus jika melaporkan Pos Tujuan (Destination Pos):
      // Jika status masih dalam perjalanan (in_transit), tidak bisa melapor pos tujuan!
      const targetPosId = pickupPointId ? BigInt(pickupPointId) : null;
      const tripDestPosId = contextTrip?.destinationPointId
        ? BigInt(contextTrip.destinationPointId)
        : null;

      if (targetPosId && tripDestPosId && targetPosId === tripDestPosId) {
        // Customer harus sudah tiba di Pos Tujuan
        if (
          user.role === Role.customer ||
          (contextOrder && contextOrder.customerId === reporterId)
        ) {
          const customerArrivedAtDest =
            contextOrder &&
            (['arrived_destination', 'completed'].includes(contextOrder.status) ||
              contextOrder.checkpointsLogs?.some(
                (l: any) => l.scanType === 'checkin_destination',
              ));

          if (!customerArrivedAtDest) {
            throw new BadRequestException(
              'Laporan terhadap Pos Tujuan belum dapat diajukan karena perjalanan masih berlangsung (Anda belum tiba di Pos Tujuan).',
            );
          }
        }

        // Mitra Driver harus sudah tiba di Pos Tujuan
        if (
          user.role === Role.mitra ||
          (contextTrip && contextTrip.mitraId === reporterId)
        ) {
          const driverArrivedAtDest =
            contextTrip &&
            (['arrived_dest_pos', 'completed'].includes(contextTrip.status) ||
              contextTrip.checkpointsLogs?.some(
                (l: any) => l.scanType === 'checkin_destination',
              ));

          if (!driverArrivedAtDest) {
            throw new BadRequestException(
              'Laporan terhadap Pos Tujuan belum dapat diajukan karena armada belum tiba di Pos Tujuan.',
            );
          }
        }
      }
    }

    // 4. Generate Nomor Tiket Unik
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randSuffix = Math.floor(1000 + Math.random() * 9000);
    const ticketNumber = `REP-${dateStr}-${randSuffix}`;

    // 5. Simpan Laporan
    const report = await this.prisma.userReport.create({
      data: {
        ticketNumber,
        reporterId,
        reportedUserId,
        tripId,
        orderId,
        pickupPointId,
        category: dto.category,
        severity: dto.severity || ReportSeverity.MEDIUM,
        description: dto.description,
        evidenceUrls: dto.evidenceUrls || [],
        status: ReportStatus.PENDING,
      },
      include: {
        reporter: {
          select: { id: true, name: true, role: true, avatar: true },
        },
        reportedUser: {
          select: { id: true, name: true, role: true, avatar: true },
        },
        trip: {
          select: {
            id: true,
            qrCodeTrip: true,
            departureDate: true,
            status: true,
          },
        },
        order: {
          select: {
            id: true,
            qrCodeTicket: true,
            status: true,
          },
        },
        pickupPoint: {
          select: {
            id: true,
            name: true,
            address: true,
          },
        },
      },
    });

    this.logger.log(
      `[USER_REPORT] Tiket ${ticketNumber} dibuat oleh User ${reporterId} terhadap User ${reportedUserId}`,
    );

    // 6. Notifikasi sistem ke Pelapor (Konfirmasi Tiket Masuk)
    try {
      await this.notificationsService.sendNotification({
        userId: reporterId.toString(),
        type: NotificationType.user_report_created,
        payload: {
          title: 'Laporan Anda Telah Diterima',
          body: `Laporan tiket #${ticketNumber} sedang ditinjau oleh tim investigasi kami.`,
          data: {
            reportId: report.id.toString(),
            ticketNumber,
          },
        },
      });
    } catch (err) {
      this.logger.warn(`Gagal mengirim notifikasi pembuatan tiket: ${err.message}`);
    }

    return {
      success: true,
      message: 'Laporan pelanggaran berhasil diajukan dan sedang diproses.',
      data: this.serializeBigInt(report),
    };
  }

  /**
   * Riwayat Laporan yang dibuat oleh saya sendiri
   */
  async getMySubmittedReports(user: any) {
    const userId = BigInt(user.sub || user.id);

    const reports = await this.prisma.userReport.findMany({
      where: { reporterId: userId },
      include: {
        reportedUser: {
          select: { id: true, name: true, role: true, avatar: true },
        },
        trip: {
          select: { id: true, qrCodeTrip: true, departureDate: true, status: true },
        },
        order: {
          select: { id: true, qrCodeTicket: true, status: true },
        },
        pickupPoint: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return this.serializeBigInt(reports);
  }

  /**
   * Riwayat Laporan yang ditujukan kepada saya (BLIND: Nama & Kontak Pelapor Disamarkan untuk Keamanan)
   */
  async getReportsTargetingMe(user: any) {
    const userId = BigInt(user.sub || user.id);

    const reports = await this.prisma.userReport.findMany({
      where: { reportedUserId: userId },
      include: {
        trip: {
          select: { id: true, qrCodeTrip: true, departureDate: true },
        },
        order: {
          select: { id: true, qrCodeTicket: true },
        },
        pickupPoint: {
          select: { id: true, name: true },
        },
        sanction: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Sanitasi data agar nama pelapor tidak bocor (Blind Review)
    const sanitized = reports.map((r) => ({
      ...r,
      reporterId: undefined,
      reporter: {
        name: 'Pengguna Sistem (Dilindungi)',
        role: 'Protected',
      },
    }));

    return this.serializeBigInt(sanitized);
  }

  /**
   * Daftar Seluruh Laporan untuk Admin / Admin Regional
   */
  async getAllReportsForAdmin(user: any, query: QueryReportDto) {
    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limit = Math.max(1, Math.min(100, parseInt(query.limit || '15', 10)));
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.status) {
      where.status = query.status;
    }
    if (query.severity) {
      where.severity = query.severity;
    }
    if (query.category) {
      where.category = query.category;
    }

    if (query.search) {
      where.OR = [
        { ticketNumber: { contains: query.search } },
        { description: { contains: query.search } },
        { reporter: { name: { contains: query.search } } },
        { reportedUser: { name: { contains: query.search } } },
      ];
    }

    // Jika admin regional, batasi ke wilayah kerja jika memiliki regionId
    if (user.role === Role.regional && user.regionId) {
      const regionId = BigInt(user.regionId);
      where.OR = [
        ...(where.OR || []),
        { pickupPoint: { regionId } },
        { trip: { originPoint: { regionId } } },
        { trip: { destinationPoint: { regionId } } },
      ];
    }

    const [total, reports] = await Promise.all([
      this.prisma.userReport.count({ where }),
      this.prisma.userReport.findMany({
        where,
        skip,
        take: limit,
        include: {
          reporter: {
            select: { id: true, name: true, email: true, phone: true, role: true, avatar: true },
          },
          reportedUser: {
            select: { id: true, name: true, email: true, phone: true, role: true, avatar: true },
          },
          handledBy: {
            select: { id: true, name: true, role: true },
          },
          trip: {
            select: { id: true, qrCodeTrip: true, departureDate: true, status: true },
          },
          order: {
            select: { id: true, qrCodeTicket: true, status: true },
          },
          pickupPoint: {
            select: { id: true, name: true, address: true },
          },
          sanction: true,
        },
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      }),
    ]);

    return {
      data: this.serializeBigInt(reports),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Detail Laporan berdasarkan ID
   */
  async getReportDetail(user: any, id: string) {
    const reportId = BigInt(id);
    const userId = BigInt(user.sub || user.id);

    const report = await this.prisma.userReport.findUnique({
      where: { id: reportId },
      include: {
        reporter: {
          select: { id: true, name: true, email: true, phone: true, role: true, avatar: true },
        },
        reportedUser: {
          select: { id: true, name: true, email: true, phone: true, role: true, avatar: true },
        },
        handledBy: {
          select: { id: true, name: true, role: true },
        },
        trip: {
          include: {
            originPoint: true,
            destinationPoint: true,
            vehicle: true,
          },
        },
        order: {
          include: {
            passengers: true,
            itemOrders: true,
          },
        },
        pickupPoint: true,
        sanction: {
          include: {
            appeals: true,
          },
        },
      },
    });

    if (!report) {
      throw new NotFoundException('Tiket laporan tidak ditemukan.');
    }

    const isAdminOrRegional =
      user.role === Role.admin || user.role === Role.regional;
    const isReporter = report.reporterId === userId;
    const isReported = report.reportedUserId === userId;

    if (!isAdminOrRegional && !isReporter && !isReported) {
      throw new ForbiddenException('Anda tidak berhak mengakses tiket laporan ini.');
    }

    // Jika yang melihat adalah pihak terlapor, samarkan identitas pelapor (Blind reporting)
    if (isReported && !isAdminOrRegional) {
      const masked = {
        ...report,
        reporterId: undefined,
        reporter: {
          name: 'Pengguna Sistem (Dilindungi)',
          role: 'Protected',
          email: undefined,
          phone: undefined,
          avatar: null,
        },
      };
      return this.serializeBigInt(masked);
    }

    return this.serializeBigInt(report);
  }

  /**
   * Penyelesaian / Penutupan Laporan oleh Admin atau Admin Regional
   */
  async resolveReport(user: any, id: string, dto: ResolveReportDto) {
    const reportId = BigInt(id);
    const adminId = BigInt(user.sub || user.id);

    const report = await this.prisma.userReport.findUnique({
      where: { id: reportId },
      include: {
        reportedUser: true,
        reporter: true,
        trip: true,
      },
    });

    if (!report) {
      throw new NotFoundException('Tiket laporan tidak ditemukan.');
    }

    let createdSanctionId: bigint | null = null;

    // Jika valid dan terlapor adalah Mitra (Driver), serta admin memilih terapkan sanksi
    if (
      dto.status === ReportStatus.RESOLVED_VALID &&
      dto.applySanction &&
      report.reportedUser.role === Role.mitra
    ) {
      const sanction = await this.prisma.mitraSanction.create({
        data: {
          mitraId: report.reportedUserId,
          tripId: report.tripId || null,
          violationType: SanctionViolationType.USER_REPORT_VIOLATION,
          scoreDeduction: dto.scoreDeduction || 10,
          tier: 1,
          isSuspended: dto.isSuspended || false,
          suspendedUntil: dto.suspendedUntil ? new Date(dto.suspendedUntil) : null,
          status: SanctionStatus.ACTIVE,
        },
      });
      createdSanctionId = sanction.id;

      this.logger.warn(
        `[SANCTION_APPLIED] Sanksi diterbitkan untuk Mitra ${report.reportedUserId} via Laporan #${report.ticketNumber}`,
      );
    }

    // Jika laporan dinyatakan palsu (RESOLVED_INVALID) dan disengaja, admin bisa memberikan penalti ke pelapor
    if (dto.status === ReportStatus.RESOLVED_INVALID && dto.penalizeReporter) {
      await this.prisma.user.update({
        where: { id: report.reporterId },
        data: {
          rewardPoints: {
            decrement: Math.min(50, report.reporter.rewardPoints),
          },
        },
      });
      this.logger.warn(
        `[FALSE_REPORT_PENALTY] Pengurangan poin diterapkan pada Pelapor ${report.reporterId}`,
      );
    }

    // Update status laporan
    const updated = await this.prisma.userReport.update({
      where: { id: reportId },
      data: {
        status: dto.status,
        actionNotes: dto.actionNotes,
        handledById: adminId,
        sanctionId: createdSanctionId || report.sanctionId,
      },
      include: {
        handledBy: {
          select: { id: true, name: true, role: true },
        },
        sanction: true,
      },
    });

    // Kirim notifikasi penyelesaian ke Pelapor
    try {
      await this.notificationsService.sendNotification({
        userId: report.reporterId.toString(),
        type: NotificationType.user_report_resolved,
        payload: {
          title: `Laporan #${report.ticketNumber} Telah Ditindaklanjuti`,
          body: `Hasil investigasi: ${dto.status}. Catatan: ${dto.actionNotes}`,
          data: {
            reportId: report.id.toString(),
            ticketNumber: report.ticketNumber,
            status: dto.status,
          },
        },
      });

      // Kirim notifikasi ringkas ke Terlapor jika laporan berujung sanksi/tindakan
      if (dto.status === ReportStatus.RESOLVED_VALID) {
        await this.notificationsService.sendNotification({
          userId: report.reportedUserId.toString(),
          type: NotificationType.user_report_resolved,
          payload: {
            title: 'Pemberitahuan Pelanggaran Layanan',
            body: `Terdapat laporan pelanggaran yang telah diverifikasi valid pada aktivitas Anda. Silakan cek menu Sanksi/Pusat Bantuan.`,
            data: {
              ticketNumber: report.ticketNumber,
            },
          },
        });
      }
    } catch (err) {
      this.logger.warn(`Gagal mengirim notifikasi penyelesaian: ${err.message}`);
    }

    return {
      success: true,
      message: 'Tiket laporan berhasil diperbarui.',
      data: this.serializeBigInt(updated),
    };
  }
}
