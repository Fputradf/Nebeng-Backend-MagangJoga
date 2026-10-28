import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TripsRepository } from './repository/trips.repository';
import { VehiclesRepository } from '../vehicles/repository/vehicles.repository';
import { CreateTripDto } from './dto/create-trip.dto';
import { QueryTripDto } from './dto/query-trip.dto';
import { UpdateTripDto } from './dto/update-trip.dto';
import { CancelTripByMitraDto } from './dto/cancel-trip-by-mitra.dto';
import { TripMapper } from './mappers/trip.mapper';
import {
  TripStatus,
  OrderStatus,
  VehicleType,
  VerificationStatus,
  EscrowStatus,
  TransactionType,
  NoShowAuditType,
  SanctionViolationType,
  Role,
  ServiceType,
} from '../../generated/prisma/enums';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationHelperService } from '../notifications/notification-helper.service';
import { SanctionService } from '../admin/sanction.service';
import { computeOrderFinancials } from '../../common/utils/financial.util';

@Injectable()
export class TripsService {
  private readonly logger = new Logger(TripsService.name);

  constructor(
    private readonly tripsRepository: TripsRepository,
    private readonly vehiclesRepository: VehiclesRepository,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly notificationHelper: NotificationHelperService,
    private readonly sanctionService: SanctionService,
  ) {}

  private async generateUniqueTripQr(): Promise<string> {
    const maxRetries = 10;
    for (let i = 0; i < maxRetries; i++) {
      const hex = randomBytes(4).toString('hex').toUpperCase();
      const qrCodeTrip = `TRIP-${hex}`;
      const existing = await this.tripsRepository.findByQrCode(qrCodeTrip);
      if (!existing) {
        return qrCodeTrip;
      }
    }
    throw new InternalServerErrorException(
      'Gagal menghasilkan Kode QR Trip unik. Silakan coba kembali.',
    );
  }

  private safeParseBigInt(id: string): bigint {
    try {
      return BigInt(id);
    } catch {
      throw new BadRequestException(`Format ID '${id}' tidak valid`);
    }
  }

  private combineDateAndTime(
    departureDateStr: string,
    departureTimeStr: string,
  ): Date {
    const datePart = new Date(departureDateStr).toISOString().split('T')[0];
    let timePart = departureTimeStr;

    if (departureTimeStr.includes('T')) {
      timePart = new Date(departureTimeStr)
        .toISOString()
        .split('T')[1]
        .substring(0, 8);
    } else if (departureTimeStr.endsWith('Z')) {
      timePart = departureTimeStr.replace('Z', '');
    }

    const combined = new Date(`${datePart}T${timePart}`);
    if (isNaN(combined.getTime())) {
      throw new BadRequestException(
        'Format tanggal atau jam keberangkatan tidak valid.',
      );
    }
    return combined;
  }

  async createTrip(userIdStr: string, dto: CreateTripDto) {
    const parsedUserId: string = userIdStr;
    if (!parsedUserId || parsedUserId === 'undefined') {
      throw new BadRequestException('ID Mitra tidak valid');
    }

    const user = await this.prisma.user.findUnique({ where: { id: this.safeParseBigInt(parsedUserId) } });
    if (!user) {
      throw new NotFoundException('Data mitra tidak ditemukan.');
    }
    if (user.statusVerification !== VerificationStatus.approved) {
      throw new ForbiddenException(
        'Akun Anda belum disetujui (Approved) oleh Admin Regional. Belum dapat mempublikasikan trip.',
      );
    }

    const vehicle = await this.vehiclesRepository.findById(dto.vehicleId);
    if (!vehicle) {
      throw new NotFoundException('Data kendaraan tidak ditemukan.');
    }
    if (vehicle.userId.toString() !== parsedUserId) {
      throw new ForbiddenException(
        'Kendaraan ini bukan milik Anda yang terdaftar.',
      );
    }

    if (dto.originPointId === dto.destinationPointId) {
      throw new BadRequestException(
        'Pos Asal dan Pos Tujuan tidak boleh sama.',
      );
    }

    const originPoint = this.prisma.pickupPoint
      ? await this.prisma.pickupPoint.findUnique({
          where: { id: this.safeParseBigInt(dto.originPointId) },
          include: { region: true },
        })
      : ({ regionId: '1' } as any);
    if (!originPoint) {
      throw new NotFoundException('Pos Asal tidak ditemukan.');
    }

    const destPoint = this.prisma.pickupPoint
      ? await this.prisma.pickupPoint.findUnique({
          where: { id: this.safeParseBigInt(dto.destinationPointId) },
          include: { region: true },
        })
      : ({ regionId: '2' } as any);
    if (!destPoint) {
      throw new NotFoundException('Pos Tujuan tidak ditemukan.');
    }

    // Aturan Opsi C: Home Base + Touchpoint Policy untuk Mitra
    if (user.role === Role.mitra && user.regionId) {
      const userRegionIdStr = user.regionId.toString();
      const originRegionIdStr = originPoint.regionId.toString();
      const destRegionIdStr = destPoint.regionId.toString();

      const isOriginMatch = originRegionIdStr === userRegionIdStr;
      const isDestMatch = destRegionIdStr === userRegionIdStr;

      if (!isOriginMatch && !isDestMatch) {
        const userRegion = await this.prisma.region.findUnique({
          where: { id: user.regionId },
        });
        const regionName = userRegion ? userRegion.name : 'wilayah terdaftar Anda';
        throw new BadRequestException(
          `Sesuai aturan wilayah operasi (Home Base), salah satu titik pos (Asal atau Tujuan) harus berada di wilayah terdaftar Anda (${regionName}). Anda tidak diizinkan membuka perjalanan yang seluruhnya berada di luar wilayah terdaftar Anda.`,
        );
      }
    }

    const combinedDate = this.combineDateAndTime(
      dto.departureDate,
      dto.departureTime,
    );
    if (combinedDate < new Date()) {
      throw new BadRequestException(
        'Waktu keberangkatan tidak boleh di masa lalu.',
      );
    }

    const maxWeight =
      dto.maxWeightCapacityKg !== undefined
        ? Number(dto.maxWeightCapacityKg)
        : Number(vehicle.maxWeightCapacityKg) || 15;

    if (!dto.serviceType) {
      throw new BadRequestException('Tipe layanan (serviceType) wajib diisi.');
    }

    let seatTotal = dto.totalSeats !== undefined ? dto.totalSeats : 1;
    if (dto.serviceType === ServiceType.barang) {
      seatTotal = 0;
    } else {
      if (seatTotal < 1) {
        throw new BadRequestException('Trip penumpang wajib memiliki minimal 1 kursi.');
      }
      if (dto.serviceType === ServiceType.motor && seatTotal > 1) {
        throw new BadRequestException('Trip motor hanya diperbolehkan maksimal 1 kursi.');
      }
    }

    const qrCodeTrip = await this.generateUniqueTripQr();

    const createdTrip = await this.tripsRepository.create({
      mitraId: this.safeParseBigInt(parsedUserId),
      vehicleId: this.safeParseBigInt(dto.vehicleId),
      originPointId: this.safeParseBigInt(dto.originPointId),
      destinationPointId: this.safeParseBigInt(dto.destinationPointId),
      vehicleType: vehicle.type as VehicleType,
      departureDate: new Date(dto.departureDate),
      departureTime: new Date(dto.departureTime),
      price: dto.price,
      seatTotal: seatTotal,
      seatAvailable: seatTotal,
      maxWeightCapacityKg: maxWeight,
      remainingWeightCapacityKg: maxWeight,
      qrCodeTrip,
      status: TripStatus.scheduled,
      serviceType: dto.serviceType || 'mobil',
      mapsPolyline: (dto as any).mapsPolyline ?? null,
    });

    return TripMapper.toResponse(createdTrip);
  }

  async getTrips(query: QueryTripDto, currentUserIdStr?: string) {
    const filters: any = {
      status: query.status ? query.status : TripStatus.scheduled,
    };

    if (query.date) {
      const cleanDateStr = query.date.split('T')[0];
      const startOfDay = new Date(`${cleanDateStr}T00:00:00.000Z`);
      const endOfDay = new Date(`${cleanDateStr}T23:59:59.999Z`);

      filters.departureDate = {
        gte: startOfDay,
        lte: endOfDay,
      };
    } else if (!query.status || query.status === TripStatus.scheduled) {
      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];
      const startOfToday = new Date(`${todayStr}T00:00:00.000Z`);
      filters.departureDate = {
        gte: startOfToday,
      };
    }

    if (query.search) {
      filters.OR = [
        {
          originPoint: {
            name: { contains: query.search, mode: 'insensitive' },
          },
        },
        {
          destinationPoint: {
            name: { contains: query.search, mode: 'insensitive' },
          },
        },
        {
          originPoint: {
            region: { name: { contains: query.search, mode: 'insensitive' } },
          },
        },
        {
          destinationPoint: {
            region: { name: { contains: query.search, mode: 'insensitive' } },
          },
        },
      ];
    }

    if (query.originPointId) {
      filters.originPointId = this.safeParseBigInt(query.originPointId);
    }
    if (query.destinationPointId) {
      filters.destinationPointId = this.safeParseBigInt(
        query.destinationPointId,
      );
    }

    if (query.posId) {
      const posIdBigInt = this.safeParseBigInt(query.posId);
      filters.OR = [
        { originPointId: posIdBigInt },
        { destinationPointId: posIdBigInt },
      ];
    }

    if (query.regionId) {
      const regionIdBigInt = this.safeParseBigInt(query.regionId);
      filters.AND = filters.AND || [];
      filters.AND.push({
        OR: [
          { originPoint: { regionId: regionIdBigInt } },
          { destinationPoint: { regionId: regionIdBigInt } },
        ],
      });
    }

    if (query.vehicleType) {
      filters.vehicleType = query.vehicleType;
    }

    if (query.serviceType) {
      filters.serviceType = query.serviceType;
    }

    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;

    const { data: trips, total } = await this.tripsRepository.findAll(
      filters,
      page,
      limit,
    );
    const bookedTripIds = new Set<string>();

    if (currentUserIdStr) {
      const userOrders = await this.prisma.order.findMany({
        where: {
          customerId: this.safeParseBigInt(currentUserIdStr),
          status: { notIn: [OrderStatus.cancelled, OrderStatus.cancelled_by_mitra] },
        },
        select: { tripId: true },
      });
      userOrders.forEach((o) => bookedTripIds.add(o.tripId.toString()));
    }

    const now = new Date();
    const TOLERANCE_MS = 15 * 60 * 1000;
    const availableTrips = (!query.status || query.status === TripStatus.scheduled)
      ? trips.filter((trip) => {
          if (trip.status === TripStatus.scheduled) {
            try {
              const departureDateTime = this.combineDateAndTime(
                trip.departureDate.toISOString(),
                trip.departureTime.toISOString(),
              );
              return departureDateTime.getTime() + TOLERANCE_MS >= now.getTime();
            } catch {
              return true;
            }
          }
          return true;
        })
      : trips;

    const mappedTrips = TripMapper.toResponseList(availableTrips) as any[];
    const responseList = mappedTrips.map((trip) => ({
      ...trip,
      isBookedByMe: bookedTripIds.has(trip.id),
    }));

    return {
      data: responseList,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getTripsByMitra(mitraIdStr: string, query: QueryTripDto) {
    const parsedMitraId = this.safeParseBigInt(mitraIdStr);

    const filters: any = {
      mitraId: parsedMitraId,
    };

    if (query.activeEscrow === 'true') {
      filters.status = {
        in: ['scheduled', 'in_origin_pos', 'in_transit', 'arrived_dest_pos'],
      };
    } else if (query.status) {
      filters.status = query.status;
    } else {
      filters.status = {
        in: ['scheduled', 'in_transit', 'completed'],
      };
    }

    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;

    const { data: trips, total } = await this.tripsRepository.findAll(
      filters,
      page,
      limit,
    );

    return {
      data: TripMapper.toResponseList(trips),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getTripById(idStr: string) {
    const trip = await this.tripsRepository.findById(idStr);
    if (!trip) {
      throw new NotFoundException('Trip tidak ditemukan.');
    }
    return TripMapper.toResponse(trip);
  }

  async updateTrip(idStr: string, userIdStr: string, dto: UpdateTripDto) {
    const trip = await this.tripsRepository.findById(idStr);
    if (!trip) {
      throw new NotFoundException('Trip tidak ditemukan.');
    }

    if (trip.mitraId.toString() !== userIdStr) {
      throw new ForbiddenException(
        'Anda tidak berhak mengubah trip orang lain.',
      );
    }

    const updateData: any = {};

    if (dto.status) {
      if (
        dto.status === TripStatus.in_transit ||
        dto.status === TripStatus.completed ||
        dto.status === TripStatus.arrived_dest_pos
      ) {
        throw new BadRequestException(
          'Perubahan status Trip menjadi In-Transit atau Completed hanya dapat dilakukan via QR Checkpoint Scanner Operator Pos.',
        );
      }

      if (dto.status === TripStatus.cancelled) {
        return this.cancelByMitra(idStr, userIdStr, {
          reason: 'Dibatalkan oleh Mitra melalui panel trip',
        });
      }

      updateData.status = dto.status;
    }

    const targetDateStr =
      dto.departureDate ?? trip.departureDate.toISOString().split('T')[0];
    const targetTimeStr = dto.departureTime ?? trip.departureTime.toISOString();

    if (dto.departureDate || dto.departureTime) {
      const combinedDate = this.combineDateAndTime(
        targetDateStr,
        targetTimeStr,
      );
      if (combinedDate < new Date()) {
        throw new BadRequestException(
          'Waktu keberangkatan tidak boleh diubah ke masa lalu.',
        );
      }
    }

    if (dto.departureDate) {
      updateData.departureDate = new Date(dto.departureDate);
    }
    if (dto.departureTime) {
      updateData.departureTime = new Date(dto.departureTime);
    }

    const updated = await this.tripsRepository.update(idStr, updateData);

    // Jika Mitra update status bahwa sudah sampai di pos asal (in_origin_pos)
    if (dto.status === TripStatus.in_origin_pos) {
      try {
        const activeOrders = await this.prisma.order.findMany({
          where: {
            tripId: trip.id,
            status: {
              in: [OrderStatus.paid, OrderStatus.checked_in_origin],
            },
          },
          select: {
            customerId: true,
          },
        });

        const customerIds = [
          ...new Set(activeOrders.map((o) => o.customerId.toString())),
        ];

        for (const cid of customerIds) {
          await this.notificationHelper.notifyMitraArrivedAtOrigin(
            cid,
            trip.id.toString(),
            trip.originPoint?.name || 'Pos Asal',
            trip.mitra?.name || 'Mitra Nebeng',
          );
        }
      } catch (err: any) {
        this.logger.warn(
          `Gagal mengirim notifikasi kedatangan mitra untuk trip #${idStr}: ${err.message}`,
        );
      }
    }

    return TripMapper.toResponse(updated);
  }

  // =========================================================================
  // FASE 10: PEMBATALAN TRIP OLEH MITRA (SEBELUM JADWAL)
  // =========================================================================
  async cancelByMitra(
    tripIdStr: string,
    mitraIdStr: string,
    dto: CancelTripByMitraDto,
  ) {
    const tripId = this.safeParseBigInt(tripIdStr);
    const mitraId = this.safeParseBigInt(mitraIdStr);

    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        originPoint: true,
        destinationPoint: true,
        orders: {
          where: {
            status: { notIn: [OrderStatus.cancelled, OrderStatus.completed, OrderStatus.no_show, OrderStatus.cancelled_by_mitra] },
          },
          include: {
            customer: true,
          },
        },
      },
    });

    if (!trip) {
      throw new NotFoundException('Trip tidak ditemukan.');
    }

    // 1. Validasi Pemilik Trip
    if (trip.mitraId !== mitraId) {
      throw new ForbiddenException('Anda tidak berhak membatalkan trip milik mitra lain.');
    }

    // 2. IDEMPOTENT CHECK: Jika sudah dibatalkan sebelumnya, kembalikan hasil sebelumnya
    if (trip.status === TripStatus.cancelled_by_mitra || trip.status === TripStatus.cancelled) {
      return {
        message: 'Trip sudah dibatalkan sebelumnya.',
        alreadyProcessed: true,
        tripId: trip.id.toString(),
        status: trip.status,
        cancelCategory: trip.cancelCategory || 'ALREADY_CANCELLED',
        cancelledAt: trip.cancelledAt,
        cancelReason: trip.cancelReason,
      };
    }

    // Tolak jika trip sudah selesai atau mitra no-show
    if (trip.status === TripStatus.completed || trip.status === TripStatus.mitra_no_show) {
      throw new BadRequestException(
        `Trip dengan status '${trip.status}' tidak dapat dibatalkan.`,
      );
    }

    const now = new Date();
    const departureCombined = this.combineDateAndTime(
      trip.departureDate.toISOString().split('T')[0],
      trip.departureTime.toISOString(),
    );

    // Cek apakah ada penumpang yang sudah check-in atau trip sudah berjalan
    const hasCheckedInPassengers = trip.orders.some(
      (o) => o.status === OrderStatus.checked_in_origin || o.status === OrderStatus.in_transit,
    );
    const isPastDeparture = now > departureCombined;
    const isRunning =
      trip.status === TripStatus.in_origin_pos ||
      trip.status === TripStatus.in_transit ||
      trip.status === TripStatus.arrived_dest_pos;

    // KASUS D: Lewat jadwal atau ada penumpang check-in atau sedang berjalan
    // -> Masuk ke pending_admin_review (tidak di-refund otomatis)
    if (isPastDeparture || hasCheckedInPassengers || isRunning) {
      const updatedTrip = await this.prisma.trip.update({
        where: { id: tripId },
        data: {
          status: TripStatus.pending_admin_review,
          cancelledAt: now,
          cancelledBy: mitraId,
          cancelReason: dto.reason,
          cancelCategory: 'PENDING_ADMIN_REVIEW',
        },
      });

      // Catat log audit pembatalan
      await this.prisma.noShowAuditLog.create({
        data: {
          type: NoShowAuditType.mitra_cancel,
          tripId,
          posId: trip.originPointId,
          operatorId: mitraId, // actor mitra
          reason: `[PENDING ADMIN REVIEW] ${dto.reason}`,
          evidenceUrl: dto.evidenceUrl,
        },
      });

      return {
        message:
          'Trip ini sudah melewati jadwal atau sedang berjalan dengan penumpang check-in. Pembatalan dialihkan ke peninjauan admin (pending_admin_review). Refund otomatis ditangguhkan.',
        tripId: updatedTrip.id.toString(),
        status: updatedTrip.status,
        cancelCategory: 'PENDING_ADMIN_REVIEW',
        requiresAdminReview: true,
      };
    }

    // Konfigurasi Jam & Threshold dari Environment
    const earlyCancelHours = Number(
      this.configService.get<number>('MITRA_EARLY_CANCEL_HOURS', 3),
    );
    const patternWindowDays = Number(
      this.configService.get<number>('MITRA_CANCEL_PATTERN_WINDOW_DAYS', 30),
    );
    const patternThreshold = Number(
      this.configService.get<number>('MITRA_CANCEL_PATTERN_THRESHOLD', 3),
    );
    const pointsLateCancel = Number(
      this.configService.get<number>('COMPENSATION_POINTS_MITRA_LATE_CANCEL', 30),
    );
    const pointsEarlyCancel = Number(
      this.configService.get<number>('COMPENSATION_POINTS_MITRA_EARLY_CANCEL', 0),
    );

    // KASUS A: NO_BOOKINGS
    const activeOrders = trip.orders.filter(
      (o) => o.status === OrderStatus.paid || o.status === OrderStatus.pending_payment,
    );

    if (activeOrders.length === 0) {
      const updatedTrip = await this.prisma.trip.update({
        where: { id: tripId },
        data: {
          status: TripStatus.cancelled_by_mitra,
          cancelledAt: now,
          cancelledBy: mitraId,
          cancelReason: dto.reason,
          cancelCategory: 'NO_BOOKINGS',
        },
      });

      // Catat log audit pembatalan tanpa refund
      await this.prisma.noShowAuditLog.create({
        data: {
          type: NoShowAuditType.mitra_cancel,
          tripId,
          posId: trip.originPointId,
          operatorId: mitraId,
          reason: `[NO_BOOKINGS] ${dto.reason}`,
          evidenceUrl: dto.evidenceUrl,
        },
      });

      return {
        message: 'Trip berhasil dibatalkan. Tidak ada pesanan aktif sehingga tidak ada sanksi atau pengembalian dana.',
        tripId: updatedTrip.id.toString(),
        status: updatedTrip.status,
        cancelCategory: 'NO_BOOKINGS',
        affectedOrdersCount: 0,
        totalRefundAmount: 0,
        compensationPointsPerPassenger: 0,
      };
    }

    // KASUS B & C: Ada pesanan aktif
    const remainingMilliseconds = departureCombined.getTime() - now.getTime();
    const remainingHours = remainingMilliseconds / (1000 * 60 * 60);

    const isEarly = remainingHours >= earlyCancelHours;
    const cancelCategory = isEarly ? 'EARLY' : 'LATE';
    const violationType = isEarly
      ? SanctionViolationType.MITRA_CANCEL_EARLY
      : SanctionViolationType.MITRA_CANCEL_LATE;
    const compensationPoints = isEarly ? pointsEarlyCancel : pointsLateCancel;

    // Cek Pola Pembatalan Berulang (EARLY & LATE dalam 30 hari terakhir)
    const windowStartDate = new Date(now.getTime() - patternWindowDays * 24 * 60 * 60 * 1000);
    const previousCancellationsCount = await this.prisma.trip.count({
      where: {
        mitraId,
        cancelledAt: { gte: windowStartDate },
        status: TripStatus.cancelled_by_mitra,
        cancelCategory: { in: ['EARLY', 'LATE'] },
      },
    });

    const isPatternTriggered = previousCancellationsCount + 1 >= patternThreshold;
    const sanctionTier = isPatternTriggered ? 2 : 1;

    // Eksekusi Transaksi Idempotent dalam prisma.$transaction
    let totalRefundAmount = 0;
    const refundDetails: Array<{ orderId: string; customerId: string; amount: number }> = [];

    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Guard level trip: updateMany dengan where id + status asal yang sah
      const tripUpdateCount = await tx.trip.updateMany({
        where: {
          id: tripId,
          status: { in: [TripStatus.scheduled, TripStatus.in_origin_pos] },
        },
        data: {
          status: TripStatus.cancelled_by_mitra,
          cancelledAt: now,
          cancelledBy: mitraId,
          cancelReason: dto.reason,
          cancelCategory,
          seatAvailable: 0,
          remainingWeightCapacityKg: 0,
        },
      });

      if (tripUpdateCount.count === 0) {
        throw new BadRequestException(
          'Trip ini sudah dibatalkan, sedang berjalan, atau tidak dapat dibatalkan pada status saat ini.',
        );
      }

      // 2. Baca activeOrders DI DALAM transaksi, setelah guard trip berhasil
      const updatedTrip = await tx.trip.findUnique({
        where: { id: tripId },
        include: {
          orders: {
            where: {
              status: { notIn: [OrderStatus.cancelled, OrderStatus.completed, OrderStatus.no_show] },
            },
          },
        },
      });

      if (!updatedTrip) {
        throw new BadRequestException('Trip tidak ditemukan setelah update.');
      }

      // Ambil mitra wallet di luar loop untuk digunakan berulang
      let mitraWallet = await tx.wallet.findUnique({
        where: { userId: mitraId },
      });

      if (!mitraWallet) {
        throw new BadRequestException(
          'Wallet mitra tidak ditemukan. Hubungi administrator untuk pembuatan wallet.',
        );
      }

      // 3. Refund seluruh pesanan aktif
      for (const order of updatedTrip.orders) {
        // Guard level order: updateMany dengan where id + status aktif yang sah
        const orderUpdateCount = await tx.order.updateMany({
          where: {
            id: order.id,
            status: { in: [OrderStatus.paid, OrderStatus.checked_in_origin] },
            escrowStatus: EscrowStatus.held,
          },
          data: {
            status: OrderStatus.cancelled_by_mitra,
            escrowStatus: EscrowStatus.refunded,
          },
        });

        // Handle orderUpdateCount === 0
        if (orderUpdateCount.count === 0) {
          // Baca ulang order untuk cek status aktual
          const currentOrder = await tx.order.findUnique({
            where: { id: order.id },
            select: { status: true, escrowStatus: true },
          });

          if (currentOrder) {
            const isAlreadyRefunded =
              (currentOrder.status === OrderStatus.cancelled ||
                currentOrder.status === OrderStatus.cancelled_by_mitra ||
                currentOrder.status === OrderStatus.no_show) &&
              currentOrder.escrowStatus === EscrowStatus.refunded;

            if (isAlreadyRefunded) {
              // Lewati order ini dengan log
              this.logger.log(
                `Order #${order.id} sudah di-refund (status: ${currentOrder.status}, escrow: ${currentOrder.escrowStatus}). Melompati refund.`,
              );
              continue;
            }
          }

          // Status lain: arahkan ke pending_admin_review
          throw new BadRequestException(
            `Order #${order.id} dalam status tidak dapat di-refund. Status: ${currentOrder?.status}, Escrow: ${currentOrder?.escrowStatus}. Arahkan ke pending_admin_review.`,
          );
        }

        // Kredit dompet customer, debit escrow mitra, dan debit admin fee HANYA jika count === 1
        const adminFeePercentage = Number(order.adminFeePercentage || 10);
        const financials = computeOrderFinancials({
          subtotal: (order as any).subtotal || order.totalPrice,
          totalPrice: order.totalPrice,
          discountAmount: (order as any).discountAmount,
          adminFeePercentage,
        });

        // Cari WalletTransaction escrow_hold untuk nominal tersimpan
        const escrowTransaction = await tx.walletTransaction.findFirst({
          where: {
            orderId: order.id,
            type: TransactionType.escrow_hold,
          },
          select: { amount: true },
        });

        if (!escrowTransaction) {
          throw new BadRequestException(
            `Data escrow tersimpan tidak ditemukan untuk order #${order.id}. Tidak dapat memverifikasi nominal.`,
          );
        }

        const storedEscrowAmount = Number(escrowTransaction.amount);

        // Invariant konsistensi: subtotal === storedEscrowAmount + fee
        if (financials.subtotal !== storedEscrowAmount + financials.fee) {
          throw new BadRequestException(
            `Konsistensi uang terganggu untuk order #${order.id}. Subtotal: ${financials.subtotal}, Escrow tersimpan: ${storedEscrowAmount}, Admin: ${financials.fee}`,
          );
        }

        totalRefundAmount += financials.customerPaid;
        refundDetails.push({
          orderId: order.id.toString(),
          customerId: order.customerId.toString(),
          amount: financials.customerPaid,
        });

        // a. Kembalikan saldo ke wallet Customer
        let customerWallet = await tx.wallet.findUnique({
          where: { userId: order.customerId },
        });
        if (!customerWallet) {
          customerWallet = await tx.wallet.create({
            data: {
              userId: order.customerId,
              balance: 0,
              heldEscrowBalance: 0,
            },
          });
        }
        await tx.wallet.update({
          where: { id: customerWallet.id },
          data: { balance: { increment: financials.customerPaid } },
        });
        await tx.walletTransaction.create({
          data: {
            walletId: customerWallet.id,
            orderId: order.id,
            amount: financials.customerPaid,
            type: 'credit',
            description: `Refund Penuh (Trip #${tripId} Dibatalkan Mitra) #${order.id}`,
          },
        });

        // b. Tarik escrow dari wallet Mitra dengan syarat saldo mencukupi
        const mitraEscrowUpdateCount = await tx.wallet.updateMany({
          where: {
            id: mitraWallet.id,
            heldEscrowBalance: { gte: financials.netMitra },
          },
          data: {
            heldEscrowBalance: { decrement: financials.netMitra },
          },
        });

        if (mitraEscrowUpdateCount.count === 0) {
          this.logger.error(
            `Saldo escrow mitra tidak mencukupi. Mitra: ${mitraId}, Trip: ${tripId}, Order: ${order.id}, Saldo: ${mitraWallet.heldEscrowBalance}, Dibutuhkan: ${financials.netMitra}`,
          );
          throw new BadRequestException(
            'Saldo escrow mitra tidak mencukupi untuk pengembalian dana. Arahkan ke pending_admin_review.',
          );
        }

        await tx.walletTransaction.create({
          data: {
            walletId: mitraWallet.id,
            orderId: order.id,
            amount: financials.netMitra,
            type: 'debit',
            description: `Pengembalian Dana Escrow (Trip #${tripId} Dibatalkan Mitra) #${order.id}`,
          },
        });

        // c. Tarik admin fee / kembalikan subsidi dari wallet Admin (tanpa guard gte, saldo negatif diizinkan)
        const sysAdminEnv = process.env.SYSTEM_ADMIN_USER_ID;
        const adminId = sysAdminEnv ? BigInt(sysAdminEnv) : null;
        const adminUser = adminId
          ? await tx.user.findUnique({ where: { id: adminId } })
          : await tx.user.findFirst({
              where: { role: 'admin' },
              orderBy: { id: 'asc' },
            });

        if (!adminUser) {
          this.logger.error(
            `Admin user tidak ditemukan. SYSTEM_ADMIN_USER_ID: ${sysAdminEnv}, adminId: ${adminId}, Trip: ${tripId}, Order: ${order.id}`,
          );
          throw new BadRequestException(
            'Admin user tidak ditemukan. Hubungi administrator untuk konfigurasi admin.',
          );
        }

        const adminWallet = await tx.wallet.findUnique({
          where: { userId: adminUser.id },
        });
        if (!adminWallet) {
          this.logger.error(
            `Wallet admin tidak ditemukan. Admin userId: ${adminUser.id}, Trip: ${tripId}, Order: ${order.id}`,
          );
          throw new BadRequestException(
            'Wallet admin tidak ditemukan. Hubungi administrator untuk pembuatan wallet.',
          );
        }

        if (financials.adminNet >= 0) {
          if (financials.adminNet > 0) {
            const updatedAdmin = await tx.wallet.update({
              where: { id: adminWallet.id },
              data: { balance: { decrement: financials.adminNet } },
            });
            if (Number(updatedAdmin.balance) < 0) {
              this.logger.warn(
                `Saldo admin menjadi negatif (${updatedAdmin.balance}) setelah pengembalian admin fee order #${order.id}`,
              );
            }
            await tx.walletTransaction.create({
              data: {
                walletId: adminWallet.id,
                orderId: order.id,
                amount: financials.adminNet,
                type: 'debit',
                description: `Pengembalian Admin Fee (Trip #${tripId} Dibatalkan Mitra) #${order.id}`,
              },
            });
          }
        } else {
          // Subsidi dikembalikan ke admin
          const refundSubsidy = Math.abs(financials.adminNet);
          await tx.wallet.update({
            where: { id: adminWallet.id },
            data: { balance: { increment: refundSubsidy } },
          });
          await tx.walletTransaction.create({
            data: {
              walletId: adminWallet.id,
              orderId: order.id,
              amount: refundSubsidy,
              type: 'credit',
              description: `Pengembalian Subsidi Voucher (Trip #${tripId} Dibatalkan Mitra) #${order.id}`,
            },
          });
        }

        // d. Release voucher redemption
        await tx.voucherRedemption.updateMany({
          where: { orderId: order.id },
          data: { status: 'released' },
        });

        // e. Berikan poin kompensasi ke penumpang jika > 0
        if (compensationPoints > 0) {
          const pointReason = `Kompensasi Pembatalan Trip #${tripId}`;

          // Tambahkan ke saldo rewardPoints user & log reward_transactions
          await tx.user.update({
            where: { id: order.customerId },
            data: {
              rewardPoints: { increment: compensationPoints },
            },
          });

          await tx.rewardTransaction.create({
            data: {
              userId: order.customerId,
              points: compensationPoints,
              type: 'earn',
              description: pointReason,
            },
          });
        }
      }

      // 3. Catat NoShowAuditLog (mitra_cancel)
      await tx.noShowAuditLog.create({
        data: {
          type: NoShowAuditType.mitra_cancel,
          tripId,
          posId: trip.originPointId,
          operatorId: mitraId,
          reason: `[${cancelCategory}] ${dto.reason} (Affected Orders: ${updatedTrip.orders.length}, Total Refund: Rp ${totalRefundAmount})`,
          evidenceUrl: dto.evidenceUrl,
        },
      });

      // 4. Terapkan Sanksi ke Mitra melalui SanctionService
      const sanctionResult = await this.sanctionService.applySanction(
        mitraId,
        tripId,
        violationType,
        sanctionTier,
        tx,
      );

      return {
        updatedTrip,
        sanctionResult,
      };
    });

    // 5. NOTIFIKASI POST-TRANSAKSI (FCM + Socket + In-App)
    try {
      // a. Notifikasi ke seluruh penumpang terdampak
      for (const ref of refundDetails) {
        const pointsText = compensationPoints > 0 ? ` serta kompensasi ${compensationPoints} poin` : '';
        await this.notificationHelper.notifyTripCancelledByMitra(
          ref.customerId,
          tripId.toString(),
          ref.amount,
          compensationPoints,
          trip.originPoint?.name || 'Asal',
          trip.destinationPoint?.name || 'Tujuan',
          trip.departureDate.toISOString().split('T')[0],
        );
      }

      // b. Notifikasi ke mitra mengenai sanksi & opsi banding
      const currentMitraScore = await this.sanctionService.getMitraSanctions(mitraId.toString());
      await this.notificationHelper.notifyMitraCancellationSanction(
        mitraId.toString(),
        tripId.toString(),
        result.sanctionResult.scoreDeduction,
        currentMitraScore.currentScore,
        result.sanctionResult.isSuspended,
        result.sanctionResult.suspendedUntil,
      );
    } catch (notifErr) {
      console.error('[TripsService] Gagal mengirim notifikasi pembatalan:', notifErr);
    }

    return {
      message: `Trip #${tripId} berhasil dibatalkan. Kategori: ${cancelCategory}. Seluruh penumpang telah di-refund penuh.`,
      tripId: tripId.toString(),
      status: result.updatedTrip.status,
      cancelCategory,
      affectedOrdersCount: activeOrders.length,
      totalRefundAmount,
      compensationPointsPerPassenger: compensationPoints,
      isPatternTriggered,
      sanction: {
        violationType,
        scoreDeduction: result.sanctionResult.scoreDeduction,
        tier: result.sanctionResult.tier,
        isSuspended: result.sanctionResult.isSuspended,
        suspendedUntil: result.sanctionResult.suspendedUntil,
      },
    };
  }
}
