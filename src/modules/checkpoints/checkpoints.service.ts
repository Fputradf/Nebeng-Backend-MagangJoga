import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { CheckpointsRepository } from './repository/checkpoints.repository';
import { PrismaService } from '../../prisma/prisma.service';
import { ScanCheckpointDto } from './dto/scan-checkpoint.dto';
import { ManifestQueryDto } from './dto/manifest.dto';
import { PassengerNoShowDto } from './dto/passenger-no-show.dto';
import { MitraNoShowDto } from './dto/mitra-no-show.dto';
import { CheckpointMapper } from './mappers/checkpoint.mapper';
import {
  EscrowStatus,
  OrderStatus,
  OrderType,
  ScanType,
  ServiceType,
  TripStatus,
} from '../../generated/prisma/enums';
import { TrackingGateway } from '../tracking/tracking.gateway';
import { NotificationHelperService } from '../notifications/notification-helper.service';

@Injectable()
export class CheckpointsService {
  constructor(
    private readonly checkpointsRepository: CheckpointsRepository,
    private readonly prisma: PrismaService,
    private readonly trackingGateway: TrackingGateway,
    private readonly notificationHelper: NotificationHelperService,
  ) {}

  private safeParseBigInt(
    id: string | number | undefined | null,
  ): bigint | null {
    if (!id) return null;
    try {
      return BigInt(id);
    } catch {
      return null;
    }
  }

  /**
   * Normalize QR code by removing prefixes and suffixes
   * Handles format like: NEBENG-TKT-XXXX-SEC-YYYY or TRIP-XXXX|...
   * Returns: XXXX (the actual QR code in database)
   */
  private normalizeQrCode(qrCode: string): string {
    if (!qrCode) return qrCode;

    // Remove NEBENG- prefix if present
    let normalized = qrCode.replace(/^NEBENG-/, '');

    // Remove -SEC- suffix and everything after it
    normalized = normalized.replace(/-SEC-.*$/, '');

    // Handle TRIP format with pipe separator: TRIP-XXXX|...
    if (normalized.includes('|')) {
      normalized = normalized.split('|')[0];
    }

    return normalized.trim();
  }

  /**
   * Extract ID from QR code if format is TRIP-{id} or TKT-{id}
   * Returns: { id: string | null, isIdBased: boolean }
   */
  private extractIdFromQr(qrCode: string): { id: string | null; isIdBased: boolean } {
    if (!qrCode) return { id: null, isIdBased: false };

    const normalized = this.normalizeQrCode(qrCode);

    // Check if format is TRIP-{number} or TKT-{number}
    const tripIdMatch = normalized.match(/^TRIP-(\d+)$/);
    const ticketIdMatch = normalized.match(/^TKT-(\d+)$/);

    if (tripIdMatch) {
      return { id: tripIdMatch[1], isIdBased: true };
    }

    if (ticketIdMatch) {
      return { id: ticketIdMatch[1], isIdBased: true };
    }

    return { id: normalized, isIdBased: false };
  }

  private async resolvePosId(
    currentUser: any,
    providedPosId?: string,
  ): Promise<string> {
    const operatorUserIdStr = String(currentUser.id);
    const parsedOperatorId = this.safeParseBigInt(operatorUserIdStr);
    if (!parsedOperatorId) {
      throw new BadRequestException('ID Operator tidak valid');
    }

    const assignedPos = await this.prisma.pickupPoint.findFirst({
      where: { operatorId: parsedOperatorId },
    });

    if (assignedPos) {
      return assignedPos.id.toString();
    }

    const fallbackPos = await this.prisma.pickupPoint.findFirst({
      where: { isActive: true },
      orderBy: { id: 'asc' },
    });

    if (fallbackPos) {
      return fallbackPos.id.toString();
    }

    if (providedPosId) {
      const targetPos = await this.prisma.pickupPoint.findUnique({
        where: { id: BigInt(providedPosId) },
      });
      if (targetPos) {
        return targetPos.id.toString();
      }
    }

    throw new BadRequestException(
      'ID Pos tidak ditemukan. Belum ada Pos Checkpoint aktif yang terdaftar di database.',
    );
  }

  async scanCheckpoint(currentUser: any, dto: ScanCheckpointDto) {
    const targetPosId = await this.resolvePosId(currentUser, dto.posId);
    const operatorUserIdStr = String(currentUser.id);

    // Extract ID or QR from scanned codes
    const tripData = this.extractIdFromQr(dto.qrCodeTrip);
    const ticketData = this.extractIdFromQr(dto.qrCodeTicket);

    console.log('🔍 DEBUG SCAN:');
    console.log('  Operator ID:', operatorUserIdStr);
    console.log('  Target Pos ID:', targetPosId);
    console.log('  Trip QR:', dto.qrCodeTrip);
    console.log('  Trip Data:', tripData);
    console.log('  Ticket QR:', dto.qrCodeTicket);
    console.log('  Ticket Data:', ticketData);
    console.log('  Scan Type:', dto.scanType);

    // Find trip by ID or QR
    const trip = tripData.isIdBased
      ? await this.checkpointsRepository.findTripById(tripData.id!)
      : await this.checkpointsRepository.findTripByQr(tripData.id!);

    if (!trip) {
      throw new NotFoundException(
        'Data Trip dengan QR tersebut tidak ditemukan.',
      );
    }

    console.log('  Trip Found:', trip.id.toString());
    console.log('  Trip Origin Pos ID:', trip.originPointId.toString());
    console.log('  Trip Dest Pos ID:', trip.destinationPointId.toString());
    console.log('  Trip Status:', trip.status);

    // Find order by ID or QR
    const order = ticketData.isIdBased
      ? await this.checkpointsRepository.findOrderById(ticketData.id!)
      : await this.checkpointsRepository.findOrderByQr(ticketData.id!);

    if (!order) {
      throw new NotFoundException(
        'Data Tiket/Order dengan QR tersebut tidak ditemukan.',
      );
    }

    console.log('  Order Found:', order.id.toString());
    console.log('  Order Status:', order.status);
    console.log('  Order Escrow Status:', order.escrowStatus);

    if (order.tripId !== trip.id) {
      throw new BadRequestException(
        'Tiket/Order ini tidak terdaftar pada Trip ini.',
      );
    }

    // =========================================================================
    // 1. CHECK-IN POS ASAL (ORIGIN)
    // =========================================================================
    if (dto.scanType === ScanType.checkin_origin) {
      console.log('  Check-in Origin Validation:');
      console.log('    Order Status:', order.status);
      console.log('    Expected Status:', OrderStatus.paid);
      console.log('    Match:', order.status === OrderStatus.paid);

      // Allow check-in origin if order is paid OR checked_in_origin (re-scan scenario)
      if (order.status !== OrderStatus.paid && order.status !== OrderStatus.checked_in_origin) {
        throw new BadRequestException(
          'Pesanan belum dibayar atau sudah melalui proses check-in.',
        );
      }

      console.log('    Trip Origin Pos ID:', trip.originPointId.toString());
      console.log('    Target Pos ID:', targetPosId);
      console.log('    Pos Match:', trip.originPointId.toString() === targetPosId);

      // Removed strict pos validation to allow flexible scanning
      // Only log warning if pos doesn't match, but don't block the scan
      if (trip.originPointId.toString() !== targetPosId) {
        console.log('    ⚠️  WARNING: Scan di pos berbeda dengan trip origin');
        console.log('    Origin:', trip.originPoint?.name || 'Unknown');
        console.log('    Current:', targetPosId);
      }

      // Cegah check-in origin jika trip sudah selesai
      if (trip.status === TripStatus.completed) {
        throw new BadRequestException(
          'Trip ini sudah selesai. Tidak dapat melakukan check-in origin.',
        );
      }

      // Cegah check-in origin jika trip sudah in_transit
      if (trip.status === TripStatus.in_transit) {
        throw new BadRequestException(
          'Trip ini sudah check-in origin sebelumnya. Status saat ini: IN_TRANSIT.',
        );
      }

      const log = await this.checkpointsRepository.processCheckinOrigin(
        trip.id,
        order.id,
        targetPosId,
        operatorUserIdStr,
        dto.securitySealQr,
        dto.photoUrl,
      );

      // Siarkan pembaruan real-time ke Customer & Regional Admin via WebSocket
      const originRegionId = trip.originPoint?.regionId
        ? trip.originPoint.regionId.toString()
        : '';

      this.trackingGateway.emitCheckpointScanned(
        trip.id.toString(),
        originRegionId,
        {
          orderId: order.id.toString(),
          tripId: trip.id.toString(),
          scanType: 'checkin_origin',
          status: 'in_transit',
          newQrCode: log.order?.qrCodeTicket,
          message: 'Check-in Pos Asal selesai. Armada sedang dalam perjalanan.',
          checkpoint: CheckpointMapper.toResponse(log),
        },
      );

      await this.notificationHelper.notifyCheckpointScanned(
        order.customerId.toString(),
        'checkin_origin',
        trip.originPoint.name,
      );

      return {
        message:
          'Check-in Pos Asal berhasil. Status Trip dan Order kini IN_TRANSIT.',
        checkpoint: CheckpointMapper.toResponse(log),
      };
    }

    // =========================================================================
    // 2. CHECK-IN POS TUJUAN (DESTINATION) & PENCAIRAN ESCROW
    // =========================================================================
    if (dto.scanType === ScanType.checkin_destination) {
      if (order.escrowStatus !== EscrowStatus.held) {
        throw new BadRequestException(
          'Dana escrow order ini sudah dicairkan atau tidak dalam status ditahan.',
        );
      }

      // Removed strict pos validation to allow flexible scanning
      // Only log warning if pos doesn't match, but don't block the scan
      if (trip.destinationPointId.toString() !== targetPosId) {
        console.log('    ⚠️  WARNING: Scan di pos berbeda dengan trip destination');
        console.log('    Destination:', trip.destinationPoint?.name || 'Unknown');
        console.log('    Current:', targetPosId);
      }

      // Cegah check-in destination jika trip belum check-in origin
      if (trip.status === TripStatus.scheduled || trip.status === TripStatus.in_origin_pos) {
        throw new BadRequestException(
          'Trip ini belum check-in origin. Tidak dapat melakukan check-in destination.',
        );
      }

      // Cegah check-in destination jika trip sudah completed
      if (trip.status === TripStatus.completed) {
        throw new BadRequestException(
          'Trip ini sudah selesai. Tidak dapat melakukan check-in destination lagi.',
        );
      }

      if (order.type === OrderType.parcel) {
        if (!dto.otpClaim) {
          throw new BadRequestException(
            'Kode OTP Klaim penerima wajib diisi untuk penyerahan paket.',
          );
        }
        if (order.otpClaim !== dto.otpClaim) {
          throw new BadRequestException(
            'Kode OTP Klaim yang dimasukkan salah/tidak cocok.',
          );
        }
      }

      const serviceType =
        order.type === OrderType.parcel
          ? ServiceType.barang
          : ServiceType.mobil;
      const pricingSetting = await this.prisma.pricingSetting.findFirst({
        where: { serviceType },
      });
      const adminFeePercentage = pricingSetting
        ? Number(pricingSetting.adminFeePercentage)
        : 10;

      const totalPriceNum = Number(order.totalPrice);

      const log =
        await this.checkpointsRepository.processCheckinDestinationAndReleaseEscrow(
          trip.id,
          order.id,
          targetPosId,
          operatorUserIdStr,
          trip.mitraId,
          order.customerId,
          totalPriceNum,
          adminFeePercentage,
          dto.recipientName,
        );

      // Siarkan pembaruan real-time ke Customer & Regional Admin via WebSocket
      const destRegionId = trip.destinationPoint?.regionId
        ? trip.destinationPoint.regionId.toString()
        : '';

      this.trackingGateway.emitCheckpointScanned(
        trip.id.toString(),
        destRegionId,
        {
          orderId: order.id.toString(),
          tripId: trip.id.toString(),
          scanType: 'checkin_destination',
          status: 'completed',
          message:
            order.type === OrderType.parcel
              ? 'Barang telah berhasil diserah-terimakan di Pos Tujuan.'
              : 'Penumpang telah tiba di Pos Tujuan. Perjalanan selesai.',
          checkpoint: CheckpointMapper.toResponse(log),
        },
      );

      await this.notificationHelper.notifyCheckpointScanned(
        order.customerId.toString(),
        'checkin_destination',
        trip.destinationPoint.name,
      );

      const mitraShare = totalPriceNum * (1 - adminFeePercentage / 100);
      await this.notificationHelper.notifyEscrowReleased(
        trip.mitraId.toString(),
        mitraShare,
        order.id.toString(),
      );

      return {
        message:
          order.type === OrderType.parcel
            ? 'Check-in Pos Tujuan & Penyerahan Barang berhasil. Dana Escrow dicairkan.'
            : 'Check-in Pos Tujuan Penumpang berhasil. Transaksi Selesai & Dana Escrow dicairkan ke Wallet Mitra.',
        checkpoint: CheckpointMapper.toResponse(log),
      };
    }
  }

  // =========================================================================
  // 3. FORCE RELEASE MANUAL OLEH OPERATOR POS
  // =========================================================================
  async manualForceReleaseByOperator(
    currentUser: any,
    qrCodeTicket: string,
    posId?: string,
    otpClaim?: string,
  ) {
    const targetPosId = await this.resolvePosId(currentUser, posId);
    const operatorUserIdStr = String(currentUser.id);

    const order = await this.checkpointsRepository.findOrderByQr(qrCodeTicket);
    if (!order) {
      throw new NotFoundException('Tiket/Order tidak ditemukan.');
    }

    if (order.escrowStatus !== EscrowStatus.held) {
      throw new BadRequestException(
        'Escrow order ini sudah dicairkan atau tidak dalam status ditahan.',
      );
    }

    const trip = await this.prisma.trip.findUnique({
      where: { id: order.tripId },
      include: { originPoint: true, destinationPoint: true },
    });

    if (!trip) {
      throw new NotFoundException('Trip terkait tidak ditemukan.');
    }

    if (
      order.type === OrderType.parcel &&
      order.otpClaim &&
      order.otpClaim !== otpClaim
    ) {
      throw new BadRequestException('Kode OTP Klaim paket tidak cocok.');
    }

    const pricingSetting = await this.prisma.pricingSetting.findFirst({
      where: {
        serviceType:
          order.type === OrderType.parcel
            ? ServiceType.barang
            : ServiceType.mobil,
      },
    });
    const adminFeePercentage = pricingSetting
      ? Number(pricingSetting.adminFeePercentage)
      : 10;
    const totalPriceNum = Number(order.totalPrice);

    const log =
      await this.checkpointsRepository.processManualForceCompleteAndRelease(
        trip.id,
        order.id,
        targetPosId,
        operatorUserIdStr,
        trip.mitraId,
        order.customerId,
        totalPriceNum,
        adminFeePercentage,
      );

    // Siarkan pembaruan status force release via WebSocket
    const destRegionId = trip.destinationPoint?.regionId
      ? trip.destinationPoint.regionId.toString()
      : '';

    this.trackingGateway.emitCheckpointScanned(
      trip.id.toString(),
      destRegionId,
      {
        orderId: order.id.toString(),
        tripId: trip.id.toString(),
        scanType: 'checkin_destination',
        status: 'completed',
        message: 'Force Check-in manual oleh Operator Pos telah selesai.',
        checkpoint: CheckpointMapper.toResponse(log),
      },
    );

    return {
      message:
        'Force Check-in & Pencairan Escrow manual oleh Operator Pos berhasil dilakukan.',
      checkpoint: CheckpointMapper.toResponse(log),
    };
  }

  // =========================================================================
  // 4. PENUMPANG NO-SHOW (TIDAK DATANG)
  // =========================================================================
  async processPassengerNoShow(
    currentUser: any,
    qrCodeTicket: string,
    posId?: string,
  ) {
    const targetPosId = await this.resolvePosId(currentUser, posId);
    const operatorUserIdStr = String(currentUser.id);

    const order = await this.checkpointsRepository.findOrderByQr(qrCodeTicket);
    if (!order) {
      throw new NotFoundException('Tiket/Order tidak ditemukan.');
    }

    const trip = await this.prisma.trip.findUnique({
      where: { id: order.tripId },
      include: { originPoint: true, destinationPoint: true },
    });

    if (!trip) {
      throw new NotFoundException('Trip terkait tidak ditemukan.');
    }

    // Validasi status order
    if (order.status !== OrderStatus.paid) {
      throw new BadRequestException(
        'Penumpang no-show hanya dapat diproses untuk order dengan status paid (sudah dibayar).',
      );
    }

    // Validasi status trip
    if (
      trip.status !== TripStatus.scheduled &&
      trip.status !== TripStatus.in_origin_pos
    ) {
      throw new BadRequestException(
        'Trip ini sudah berjalan atau selesai. No-show tidak dapat diproses.',
      );
    }

    const updatedOrder =
      await this.checkpointsRepository.processPassengerNoShow(
        order.id,
        trip.id,
        targetPosId,
        operatorUserIdStr,
      );

    // Siarkan pembaruan status no-show via WebSocket
    const originRegionId = trip.originPoint?.regionId
      ? trip.originPoint.regionId.toString()
      : '';

    this.trackingGateway.emitCheckpointScanned(
      trip.id.toString(),
      originRegionId,
      {
        orderId: order.id.toString(),
        tripId: trip.id.toString(),
        scanType: 'no_show',
        status: 'no_show',
        message: 'Penumpang tidak datang (No-Show). Tiket hangus, kuota kursi dikembalikan.',
      },
    );

    return {
      message:
        'Penumpang no-show berhasil dicatat. Tiket hangus tanpa refund, kuota kursi dikembalikan ke trip.',
      order: updatedOrder,
    };
  }

  // =========================================================================
  // 5. MITRA NO-SHOW (TIDAK DATANG KE POS)
  // =========================================================================
  async processMitraNoShow(
    currentUser: any,
    qrCodeTrip: string,
    posId?: string,
  ) {
    const targetPosId = await this.resolvePosId(currentUser, posId);
    const operatorUserIdStr = String(currentUser.id);

    const trip = await this.checkpointsRepository.findTripByQr(qrCodeTrip);
    if (!trip) {
      throw new NotFoundException('Trip tidak ditemukan.');
    }

    // Validasi status trip
    if (
      trip.status !== TripStatus.scheduled &&
      trip.status !== TripStatus.in_origin_pos
    ) {
      throw new BadRequestException(
        'Trip ini sudah berjalan atau selesai. Mitra no-show tidak dapat diproses.',
      );
    }

    const updatedTrip = await this.checkpointsRepository.processMitraNoShow(
      trip.id,
      targetPosId,
      operatorUserIdStr,
    );

    // Siarkan pembaruan status mitra no-show via WebSocket
    const originRegionId = trip.originPoint?.regionId
      ? trip.originPoint.regionId.toString()
      : '';

    this.trackingGateway.emitCheckpointScanned(
      trip.id.toString(),
      originRegionId,
      {
        tripId: trip.id.toString(),
        scanType: 'mitra_no_show',
        status: 'mitra_no_show',
        message: 'Mitra tidak datang ke pos (No-Show). Trip dibatalkan, semua penumpang di-refund.',
      },
    );

    return {
      message:
        'Mitra no-show berhasil dicatat. Trip dibatalkan dan semua penumpang di-refund.',
      trip: updatedTrip,
    };
  }

  // =========================================================================
  // 6. MANIFEST POS (DAFTAR TRIP & PENUMPANG)
  // =========================================================================
  async getManifest(currentUser: any, query: ManifestQueryDto) {
    const operatorUserIdStr = String(currentUser.id);
    const parsedOperatorId = this.safeParseBigInt(operatorUserIdStr);
    if (!parsedOperatorId) {
      throw new BadRequestException('ID Operator tidak valid');
    }

    // Resolve posId dari query atau dari assignment operator
    let targetPosId: bigint;
    if (query.posId) {
      const parsed = this.safeParseBigInt(query.posId);
      if (!parsed) {
        throw new BadRequestException('Format ID Pos tidak valid');
      }
      targetPosId = parsed;

      // Validasi otorisasi: operator harus ditugaskan di pos tersebut
      const assignedPos = await this.prisma.pickupPoint.findFirst({
        where: {
          id: targetPosId,
          operatorId: parsedOperatorId,
        },
      });

      if (!assignedPos) {
        throw new ForbiddenException(
          'Anda tidak berhak mengakses manifest pos ini. Anda tidak ditugaskan di pos tersebut.',
        );
      }
    } else {
      // Gunakan pos yang ditugaskan ke operator
      const assignedPos = await this.prisma.pickupPoint.findFirst({
        where: { operatorId: parsedOperatorId },
      });

      if (!assignedPos) {
        throw new BadRequestException(
          'Anda belum ditugaskan ke pos manapun. Hubungi admin.',
        );
      }

      targetPosId = assignedPos.id;
    }

    const dateStr = query.date || new Date().toISOString().split('T')[0];
    const gracePeriodMinutes = Number(process.env.NO_SHOW_GRACE_MINUTES || '15');

    const trips = await this.checkpointsRepository.getManifestForPos(
      targetPosId,
      dateStr,
    );

    const now = new Date();

    const manifestData = trips.map((trip) => {
      // Cek apakah QR trip sudah di-scan di pos ini
      const tripScannedAtPos = trip.checkpointsLogs.some(
        (log) => log.posId === targetPosId,
      );

      // Hitung grace period untuk mitra no-show
      const tripDateTime = new Date(
        `${trip.departureDate.toISOString().split('T')[0]}T${trip.departureTime.toISOString().split('T')[1]}`,
      );
      const gracePeriodEnd = new Date(
        tripDateTime.getTime() + gracePeriodMinutes * 60 * 1000,
      );
      const canMarkMitraNoShow =
        !tripScannedAtPos &&
        now > gracePeriodEnd &&
        trip.status !== TripStatus.mitra_no_show &&
        trip.status !== TripStatus.completed;

      // Process passengers
      const passengers = trip.orders.map((order) => {
        const orderPaidAt = order.createdAt;
        const orderGracePeriodEnd = new Date(
          orderPaidAt.getTime() + gracePeriodMinutes * 60 * 1000,
        );

        const canMarkNoShow =
          tripScannedAtPos &&
          now > orderGracePeriodEnd &&
          order.status === OrderStatus.paid &&
          !trip.checkpointsLogs.some(
            (log) => log.posId === targetPosId && log.orderId === order.id,
          );

        return {
          orderId: order.id.toString(),
          customerName: order.customer.name,
          customerPhone: order.customer.phone,
          seatsBooked: order.seatsBooked,
          totalWeightKg: order.totalWeightKg,
          status: order.status,
          canMarkNoShow,
        };
      });

      return {
        tripId: trip.id.toString(),
        mitraName: trip.mitra.name,
        mitraPhone: trip.mitra.phone,
        vehicle: trip.vehicle
          ? `${trip.vehicle.model} (${trip.vehicle.plateNumber})`
          : 'Kendaraan Resmi',
        vehicleType: trip.vehicleType,
        departureTime: trip.departureTime,
        status: trip.status,
        originPoint: trip.originPoint.name,
        destinationPoint: trip.destinationPoint.name,
        isOriginPos: trip.originPointId === targetPosId,
        isDestPos: trip.destinationPointId === targetPosId,
        canMarkMitraNoShow,
        passengers,
      };
    });

    return {
      posId: targetPosId.toString(),
      date: dateStr,
      trips: manifestData,
    };
  }

  // =========================================================================
  // 7. UPDATE ENDPOINT NO-SHOW (ID-BASED)
  // =========================================================================
  async processPassengerNoShowById(
    currentUser: any,
    dto: PassengerNoShowDto,
  ) {
    const operatorUserIdStr = String(currentUser.id);
    const parsedOperatorId = this.safeParseBigInt(operatorUserIdStr);
    if (!parsedOperatorId) {
      throw new BadRequestException('ID Operator tidak valid');
    }

    const orderId = this.safeParseBigInt(dto.orderId);
    if (!orderId) {
      throw new BadRequestException('Format Order ID tidak valid');
    }

    // Resolve posId
    let targetPosId: bigint;
    if (dto.posId) {
      const parsed = this.safeParseBigInt(dto.posId);
      if (!parsed) {
        throw new BadRequestException('Format ID Pos tidak valid');
      }
      targetPosId = parsed;
    } else {
      const assignedPos = await this.prisma.pickupPoint.findFirst({
        where: { operatorId: parsedOperatorId },
      });
      if (!assignedPos) {
        throw new BadRequestException(
          'Anda belum ditugaskan ke pos manapun. Hubungi admin.',
        );
      }
      targetPosId = assignedPos.id;
    }

    // Validasi otorisasi
    const assignedPos = await this.prisma.pickupPoint.findFirst({
      where: {
        id: targetPosId,
        operatorId: parsedOperatorId,
      },
    });

    if (!assignedPos) {
      throw new ForbiddenException(
        'Anda tidak berhak melakukan aksi ini di pos tersebut.',
      );
    }

    // Get order
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        trip: {
          include: {
            originPoint: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Order tidak ditemukan');
    }

    // Validasi state machine
    if (order.status !== OrderStatus.paid) {
      throw new BadRequestException(
        'Order tidak dalam status paid. Tidak dapat ditandai no-show.',
      );
    }

    // Cek apakah trip sudah check-in di pos
    const tripScannedAtPos = await this.prisma.checkpointsLog.findFirst({
      where: {
        tripId: order.tripId,
        posId: targetPosId,
        scanType: ScanType.checkin_origin,
      },
    });

    if (!tripScannedAtPos) {
      throw new BadRequestException(
        'Trip belum check-in di pos ini. Tidak dapat menandai penumpang no-show.',
      );
    }

    // Cek apakah order sudah check-in
    const orderScanned = await this.prisma.checkpointsLog.findFirst({
      where: {
        orderId,
        posId: targetPosId,
      },
    });

    if (orderScanned) {
      throw new BadRequestException(
        'Order sudah check-in di pos ini. Tidak dapat ditandai no-show.',
      );
    }

    const updatedOrder =
      await this.checkpointsRepository.processPassengerNoShowById(
        orderId,
        order.tripId,
        targetPosId,
        parsedOperatorId,
        dto.reason,
      );

    // Kirim notifikasi ke customer
    await this.notificationHelper.notifyNoShowMarked(
      order.customerId.toString(),
      order.id.toString(),
      order.trip.originPoint.name,
    );

    return {
      message: 'Penumpang no-show berhasil dicatat. Tiket hangus tanpa refund.',
      order: updatedOrder,
    };
  }

  async processMitraNoShowById(currentUser: any, dto: MitraNoShowDto) {
    const operatorUserIdStr = String(currentUser.id);
    const parsedOperatorId = this.safeParseBigInt(operatorUserIdStr);
    if (!parsedOperatorId) {
      throw new BadRequestException('ID Operator tidak valid');
    }

    const tripId = this.safeParseBigInt(dto.tripId);
    if (!tripId) {
      throw new BadRequestException('Format Trip ID tidak valid');
    }

    // Resolve posId
    let targetPosId: bigint;
    if (dto.posId) {
      const parsed = this.safeParseBigInt(dto.posId);
      if (!parsed) {
        throw new BadRequestException('Format ID Pos tidak valid');
      }
      targetPosId = parsed;
    } else {
      const assignedPos = await this.prisma.pickupPoint.findFirst({
        where: { operatorId: parsedOperatorId },
      });
      if (!assignedPos) {
        throw new BadRequestException(
          'Anda belum ditugaskan ke pos manapun. Hubungi admin.',
        );
      }
      targetPosId = assignedPos.id;
    }

    // Validasi otorisasi
    const assignedPos = await this.prisma.pickupPoint.findFirst({
      where: {
        id: targetPosId,
        operatorId: parsedOperatorId,
      },
    });

    if (!assignedPos) {
      throw new ForbiddenException(
        'Anda tidak berhak melakukan aksi ini di pos tersebut.',
      );
    }

    const updatedTrip = await this.checkpointsRepository.processMitraNoShowById(
      tripId,
      targetPosId,
      parsedOperatorId,
      dto.reason,
      dto.evidenceUrl,
    );

    // Kirim notifikasi ke mitra dan semua penumpang
    await this.notificationHelper.notifyMitraNoShow(
      updatedTrip.mitraId.toString(),
      updatedTrip.id.toString(),
    );

    return {
      message: 'Mitra no-show berhasil dicatat. Trip dibatalkan dan semua penumpang di-refund.',
      trip: updatedTrip,
    };
  }
}
