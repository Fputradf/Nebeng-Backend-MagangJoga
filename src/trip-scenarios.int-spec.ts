import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from './prisma/prisma.service';
import { CheckpointsService } from './modules/checkpoints/checkpoints.service';
import { CheckpointsRepository } from './modules/checkpoints/repository/checkpoints.repository';
import { TripsExpirationCron } from './modules/trips/trips-expiration.cron';
import { SanctionService } from './modules/admin/sanction.service';
import { NotificationHelperService } from './modules/notifications/notification-helper.service';
import { TrackingGateway } from './modules/tracking/tracking.gateway';
import {
  Role,
  VehicleType,
  TripStatus,
  ServiceType,
  OrderType,
  OrderStatus,
  EscrowStatus,
  ScanType,
  SanctionViolationType,
} from './generated/prisma/enums';
import { assertConnectedToTestDb } from '../test-integration/env-guard';
import * as bcrypt from 'bcrypt';

jest.setTimeout(60000);

describe('Trip 10 AM Today - 5 Skenario Uji Operasional', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let checkpointsService: CheckpointsService;
  let tripsExpirationCron: TripsExpirationCron;
  let sanctionService: SanctionService;

  const RealDate = global.Date;

  function mockSystemDate(isoString: string) {
    const target = new RealDate(isoString);
    const mockDateConstructor: any = function (...args: any[]) {
      if (args.length === 0) {
        return new RealDate(target.getTime());
      }
      return new (RealDate as any)(...args);
    };
    mockDateConstructor.UTC = RealDate.UTC;
    mockDateConstructor.parse = RealDate.parse;
    mockDateConstructor.now = () => target.getTime();
    mockDateConstructor.prototype = RealDate.prototype;
    global.Date = mockDateConstructor;
  }

  function restoreSystemDate() {
    global.Date = RealDate;
  }

  const mockNotificationHelper = {
    notifyCheckpointScanned: jest.fn(),
    notifyEscrowReleased: jest.fn(),
    notifyTripArrivedAtDestination: jest.fn(),
    notifyMitraNoShow: jest.fn(),
    notifyMitraLateSanction: jest.fn(),
    notifyTripCancelledByMitra: jest.fn(),
    notifyTripDepartureReminderH30: jest.fn(),
    notifyTripDepartureUrgencyH0: jest.fn(),
    notifyNoShowMarked: jest.fn(),
  };

  const mockTrackingGateway = {
    emitCheckpointScanned: jest.fn(),
  };

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env.test',
        }),
      ],
      providers: [
        PrismaService,
        CheckpointsService,
        CheckpointsRepository,
        TripsExpirationCron,
        SanctionService,
        {
          provide: NotificationHelperService,
          useValue: mockNotificationHelper,
        },
        {
          provide: TrackingGateway,
          useValue: mockTrackingGateway,
        },
      ],
    }).compile();

    prisma = moduleRef.get<PrismaService>(PrismaService);
    checkpointsService = moduleRef.get<CheckpointsService>(CheckpointsService);
    tripsExpirationCron = moduleRef.get<TripsExpirationCron>(TripsExpirationCron);
    sanctionService = moduleRef.get<SanctionService>(SanctionService);

    await assertConnectedToTestDb(prisma);
  }, 60000);

  afterAll(async () => {
    restoreSystemDate();
    if (moduleRef) {
      await moduleRef.close();
    }
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    restoreSystemDate();
    jest.clearAllMocks();
  });

  /**
   * Helper untuk membuat data Trip jam 10:00 WIB hari ini beserta Operator, Mitra, Customer, Pos Asal, Pos Tujuan, dan Order.
   */
  async function setupTripTestEnvironment(customSuffix: string) {
    const passwordHash = await bcrypt.hash('Test@12345', 10);
    const ts = Date.now().toString().slice(-5) + customSuffix;

    const operator = await prisma.user.create({
      data: {
        name: `Operator Pos ${ts}`,
        email: `operator_${ts}@test.com`,
        password: passwordHash,
        role: Role.operator,
        phone: `081111${ts}`,
      },
    });

    const mitra = await prisma.user.create({
      data: {
        name: `Driver Mitra ${ts}`,
        email: `mitra_${ts}@test.com`,
        password: passwordHash,
        role: Role.mitra,
        phone: `082222${ts}`,
      },
    });

    const customer = await prisma.user.create({
      data: {
        name: `Customer Budi ${ts}`,
        email: `customer_${ts}@test.com`,
        password: passwordHash,
        role: Role.customer,
        phone: `083333${ts}`,
      },
    });

    const region = await prisma.region.create({
      data: {
        code: `REG-${ts}`,
        name: 'Wilayah Uji Operasional',
        pricePerKm: 2500,
        latitude: -6.2,
        longitude: 106.8,
      },
    });

    const city = await prisma.city.create({
      data: {
        name: 'Kota Uji',
        province: 'Jawa Tengah',
      },
    });

    const originPos = await prisma.pickupPoint.create({
      data: {
        name: `Pos 1 Asal (${ts})`,
        address: 'Jl. Terminal Pos Asal No. 1',
        latitude: -6.21,
        longitude: 106.81,
        cityId: city.id,
        regionId: region.id,
        operatorId: operator.id,
        qrCodePos: `POS-ORIGIN-${ts}`,
        isActive: true,
      },
    });

    const destPos = await prisma.pickupPoint.create({
      data: {
        name: `Pos 2 Tujuan (${ts})`,
        address: 'Jl. Terminal Pos Tujuan No. 2',
        latitude: -6.25,
        longitude: 106.85,
        cityId: city.id,
        regionId: region.id,
        qrCodePos: `POS-DEST-${ts}`,
        isActive: true,
      },
    });

    const vehicle = await prisma.vehicle.create({
      data: {
        plateNumber: `AB ${ts} TEST`,
        type: VehicleType.mobil,
        model: 'Toyota Avanza Veloz',
        color: 'Hitam Metalik',
        capacitySeats: 4,
        maxWeightCapacityKg: 150,
        userId: mitra.id,
      },
    });

    // Tanggal hari ini dengan jam keberangkatan 10:00:00 WIB (+07:00)
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const departureDate = new Date(`${todayStr}T00:00:00.000Z`);
    const departureTime = new Date(`${todayStr}T10:00:00.000Z`);

    const trip = await prisma.trip.create({
      data: {
        qrCodeTrip: `TRIP-${ts}`,
        departureDate,
        departureTime,
        originPointId: originPos.id,
        destinationPointId: destPos.id,
        vehicleId: vehicle.id,
        mitraId: mitra.id,
        vehicleType: VehicleType.mobil,
        serviceType: ServiceType.mobil,
        status: TripStatus.scheduled,
        seatTotal: 4,
        seatAvailable: 3,
        maxWeightCapacityKg: 150,
        remainingWeightCapacityKg: 150,
        price: 100000,
      },
    });

    const customerWallet = await prisma.wallet.create({
      data: {
        userId: customer.id,
        balance: 50000,
        heldEscrowBalance: 0,
      },
    });

    const mitraWallet = await prisma.wallet.create({
      data: {
        userId: mitra.id,
        balance: 100000,
        heldEscrowBalance: 90000,
      },
    });

    const order = await prisma.order.create({
      data: {
        tripId: trip.id,
        customerId: customer.id,
        qrCodeTicket: `TKT-${ts}`,
        type: OrderType.passenger,
        seatsBooked: 1,
        totalPrice: 100000,
        adminFeePercentage: 10,
        status: OrderStatus.paid,
        escrowStatus: EscrowStatus.held,
      },
    });

    const existingPricing = await prisma.pricingSetting.findFirst({
      where: { serviceType: ServiceType.mobil },
    });
    if (!existingPricing) {
      await prisma.pricingSetting.create({
        data: {
          serviceType: ServiceType.mobil,
          baseFare: 10000,
          farePerKm: 3000,
          adminFeePercentage: 10,
        },
      });
    }

    return {
      operator,
      mitra,
      customer,
      originPos,
      destPos,
      vehicle,
      trip,
      order,
      customerWallet,
      mitraWallet,
      departureDate,
      departureTime,
      todayStr,
    };
  }

  // =========================================================================
  // SKENARIO A: MITRA DRIVER & CUSTOMER DATANG SESUAI JADWAL SECARA NORMAL
  // =========================================================================
  it('Skenario A: Mitra driver & Customer datang normal, armada berangkat, tiba di tujuan & pencairan escrow', async () => {
    const env = await setupTripTestEnvironment('A');

    // 1. Mitra tiba di Pos Asal dan scan QR Trip
    const mitraScanResult = await checkpointsService.scanCheckpoint(env.operator, {
      qrCodeTrip: env.trip.qrCodeTrip,
      posId: env.originPos.id.toString(),
      scanType: ScanType.checkin_origin,
    });
    expect(mitraScanResult.message).toContain('Di Pos Asal (Stand-by)');

    const tripAfterMitraCheckin = await prisma.trip.findUnique({ where: { id: env.trip.id } });
    expect(tripAfterMitraCheckin?.status).toBe(TripStatus.in_origin_pos);

    // 2. Customer tiba di Pos Asal dan scan QR Tiket
    const customerScanResult = await checkpointsService.scanCheckpoint(env.operator, {
      qrCodeTicket: env.order.qrCodeTicket,
      posId: env.originPos.id.toString(),
      scanType: ScanType.checkin_origin,
    });
    expect(customerScanResult.message).toContain('Check-in Pos Asal berhasil');

    const orderAfterCustomerCheckin = await prisma.order.findUnique({ where: { id: env.order.id } });
    const tripAfterCustomerCheckin = await prisma.trip.findUnique({ where: { id: env.trip.id } });

    // Order status menjadi checked_in_origin, dan status Trip TETAP in_origin_pos (TIDAK langsung in_transit!)
    expect(orderAfterCustomerCheckin?.status).toBe(OrderStatus.checked_in_origin);
    expect(tripAfterCustomerCheckin?.status).toBe(TripStatus.in_origin_pos);

    // 3. Armada Berangkat (Scan kedua QR Trip oleh Mitra/Operator di Pos Asal untuk Dispatch)
    const departureResult = await checkpointsService.scanCheckpoint(env.operator, {
      qrCodeTrip: env.trip.qrCodeTrip,
      posId: env.originPos.id.toString(),
      scanType: ScanType.checkin_origin,
    });
    expect(departureResult.message).toContain('Armada resmi diberangkatkan');

    const tripDeparted = await prisma.trip.findUnique({ where: { id: env.trip.id } });
    const orderDeparted = await prisma.order.findUnique({ where: { id: env.order.id } });
    expect(tripDeparted?.status).toBe(TripStatus.in_transit);
    expect(orderDeparted?.status).toBe(OrderStatus.in_transit);

    // 4. Armada Tiba di Pos Tujuan dan Menyelesaikan Perjalanan
    const destScanResult = await checkpointsService.scanCheckpoint(env.operator, {
      qrCodeTrip: env.trip.qrCodeTrip,
      qrCodeTicket: orderDeparted!.qrCodeTicket, // Menggunakan token tiket pos tujuan hasil rotasi
      posId: env.destPos.id.toString(),
      scanType: ScanType.checkin_destination,
    });
    expect(destScanResult.message).toContain('Check-in Pos Tujuan');

    const finalOrder = await prisma.order.findUnique({ where: { id: env.order.id } });
    const finalMitraWallet = await prisma.wallet.findUnique({ where: { id: env.mitraWallet.id } });

    expect(finalOrder?.status).toBe(OrderStatus.completed);
    expect(finalOrder?.escrowStatus).toBe(EscrowStatus.released);
    // Saldo mitra bertambah dari pencairan escrow (100.000 - 10% fee = 90.000) -> 100.000 + 90.000 = 190.000
    expect(Number(finalMitraWallet?.balance)).toBe(190000);
    expect(Number(finalMitraWallet?.heldEscrowBalance)).toBe(0);
  });

  // =========================================================================
  // SKENARIO B: MITRA DATANG & STAND-BY, CUSTOMER TIDAK DATANG (CUSTOMER NO-SHOW)
  // =========================================================================
  it('Skenario B: Mitra datang stand-by hingga batas toleransi, customer tidak datang (tiket hangus, tanpa refund)', async () => {
    const env = await setupTripTestEnvironment('B');

    // 1. Mitra hadir dan scan di Pos Asal
    await checkpointsService.scanCheckpoint(env.operator, {
      qrCodeTrip: env.trip.qrCodeTrip,
      posId: env.originPos.id.toString(),
      scanType: ScanType.checkin_origin,
    });

    const tripInPos = await prisma.trip.findUnique({ where: { id: env.trip.id } });
    expect(tripInPos?.status).toBe(TripStatus.in_origin_pos);

    // Customer tidak pernah scan di pos asal -> status order tetap paid
    const orderBefore = await prisma.order.findUnique({ where: { id: env.order.id } });
    expect(orderBefore?.status).toBe(OrderStatus.paid);

    // 2. Operator menandai customer no-show setelah batas toleransi
    const noShowResult = await checkpointsService.processPassengerNoShowById(env.operator, {
      orderId: env.order.id.toString(),
      posId: env.originPos.id.toString(),
      reason: 'Customer tidak hadir di pos asal sampai toleransi habis',
    });
    expect(noShowResult.order.status).toBe(OrderStatus.no_show);

    const orderAfter = await prisma.order.findUnique({ where: { id: env.order.id } });
    const customerWalletAfter = await prisma.wallet.findUnique({ where: { id: env.customerWallet.id } });
    const tripAfter = await prisma.trip.findUnique({ where: { id: env.trip.id } });
    const mitraWalletAfter = await prisma.wallet.findUnique({ where: { id: env.mitraWallet.id } });

    // Status no_show: Tiket hangus, saldo customer TIDAK bertambah (no refund), kursi dikembalikan ke trip
    expect(orderAfter?.status).toBe(OrderStatus.no_show);
    expect(orderAfter?.escrowStatus).toBe(EscrowStatus.released); // Dana otomatis dicairkan ke Mitra
    expect(Number(customerWalletAfter?.balance)).toBe(50000); // Saldo awal customer tidak bertambah
    expect(tripAfter?.seatAvailable).toBe(4); // Kuota kursi dikembalikan dari 3 ke 4
    expect(tripAfter?.status).toBe(TripStatus.completed); // Trip otomatis selesai di pos asal
    expect(Number(mitraWalletAfter?.balance)).toBe(190000); // 100.000 awal + 90.000 net hak supir
    expect(Number(mitraWalletAfter?.heldEscrowBalance)).toBe(0);
  });

  // =========================================================================
  // SKENARIO B+: MITRA HADIR, SELURUH CUSTOMER TIDAK HADIR (OTOMATIS VIA CRON)
  // =========================================================================
  it('Skenario B+: Mitra hadir di Pos Asal, seluruh customer tidak hadir -> Trip otomatis diselesaikan via background cron & dana escrow cair ke Mitra tanpa perlu ke pos tujuan', async () => {
    const env = await setupTripTestEnvironment('BPlus');

    // 1. Mitra hadir dan scan di Pos Asal (status: in_origin_pos)
    await checkpointsService.scanCheckpoint(env.operator, {
      qrCodeTrip: env.trip.qrCodeTrip,
      posId: env.originPos.id.toString(),
      scanType: ScanType.checkin_origin,
    });

    const tripInPos = await prisma.trip.findUnique({ where: { id: env.trip.id } });
    expect(tripInPos?.status).toBe(TripStatus.in_origin_pos);

    // 2. Waktu berjalan melewati batas toleransi 15 menit (10:20 WIB)
    mockSystemDate(`${env.todayStr}T10:20:00+07:00`);

    // 3. Background Cron handleExpiredTrips berjalan
    await tripsExpirationCron.handleExpiredTrips();
    restoreSystemDate();

    // 4. Verifikasi hasil otomatis
    const tripFinished = await prisma.trip.findUnique({ where: { id: env.trip.id } });
    const orderFinished = await prisma.order.findUnique({ where: { id: env.order.id } });
    const customerWalletFinal = await prisma.wallet.findUnique({ where: { id: env.customerWallet.id } });
    const mitraWalletFinal = await prisma.wallet.findUnique({ where: { id: env.mitraWallet.id } });
    const mitraSanctions = await prisma.mitraSanction.findMany({ where: { tripId: env.trip.id } });

    // Trip otomatis diselesaikan di pos asal tanpa mitra harus pergi ke pos tujuan
    expect(tripFinished?.status).toBe(TripStatus.completed);

    // Tiket customer hangus tanpa refund (no_show), dan escrow dicairkan ke Mitra
    expect(orderFinished?.status).toBe(OrderStatus.no_show);
    expect(orderFinished?.escrowStatus).toBe(EscrowStatus.released);
    expect(Number(customerWalletFinal?.balance)).toBe(50000); // Customer tidak mendapat refund
    expect(Number(mitraWalletFinal?.balance)).toBe(190000); // Mitra menerima kompensasi penuh (100.000 + 90.000)
    expect(Number(mitraWalletFinal?.heldEscrowBalance)).toBe(0);

    // Mitra TIDAK dikenakan sanksi apapun (kesalahan ada pada penumpang)
    expect(mitraSanctions.length).toBe(0);
  });

  // =========================================================================
  // SKENARIO C: CUSTOMER DATANG DLIKAN & SCAN, MITRA TIDAK DATANG (MITRA NO-SHOW)
  // =========================================================================
  it('Skenario C: Customer scan lebih dulu, mitra tidak hadir melebihi toleransi -> Customer refund 100% & Mitra disanksi', async () => {
    const env = await setupTripTestEnvironment('C');

    // 1. Customer tiba dluan di Pos Asal dan scan QR tiket
    const custScanResult = await checkpointsService.scanCheckpoint(env.operator, {
      qrCodeTicket: env.order.qrCodeTicket,
      posId: env.originPos.id.toString(),
      scanType: ScanType.checkin_origin,
    });
    expect(custScanResult.message).toContain('Check-in Pos Asal berhasil');

    const orderCheckedIn = await prisma.order.findUnique({ where: { id: env.order.id } });
    const tripStillScheduled = await prisma.trip.findUnique({ where: { id: env.trip.id } });

    // Verifikasi fatal bug teratasi: Trip status TIDAK menjadi in_transit, tetap scheduled!
    expect(orderCheckedIn?.status).toBe(OrderStatus.checked_in_origin);
    expect(tripStillScheduled?.status).toBe(TripStatus.scheduled);

    // 2. Waktu berjalan melewati batas toleransi 15 menit (misal simulasi jam 10:20 WIB)
    mockSystemDate(`${env.todayStr}T10:20:00+07:00`);

    // 3. Background Cron handleExpiredTrips dijalankan
    await tripsExpirationCron.handleExpiredTrips();
    restoreSystemDate();

    // 4. Verifikasi hasil pemrosesan otomatis
    const tripAfterCron = await prisma.trip.findUnique({ where: { id: env.trip.id } });
    const orderAfterCron = await prisma.order.findUnique({ where: { id: env.order.id } });
    const customerWalletAfter = await prisma.wallet.findUnique({ where: { id: env.customerWallet.id } });
    const mitraSanctions = await prisma.mitraSanction.findMany({ where: { tripId: env.trip.id } });

    // Trip otomatis ditandai mitra_no_show
    expect(tripAfterCron?.status).toBe(TripStatus.mitra_no_show);
    // Order otomatis dibatalkan dan escrow di-refund
    expect(orderAfterCron?.status).toBe(OrderStatus.cancelled);
    expect(orderAfterCron?.escrowStatus).toBe(EscrowStatus.refunded);
    expect(orderAfterCron?.noShowReason).toContain('Mitra tidak hadir di pos asal melewati batas toleransi');

    // Skenario C: Customer yang hadir dan check-in di pos mendapat REFUND 100% (50.000 + 100.000 = 150.000)
    expect(Number(customerWalletAfter?.balance)).toBe(150000);

    // Mitra dikenakan sanksi otomatis (skor -30, suspend 1 hari)
    expect(mitraSanctions.length).toBeGreaterThanOrEqual(1);
    expect(mitraSanctions[0].violationType).toBe(SanctionViolationType.MITRA_NO_SHOW);
    expect(mitraSanctions[0].scoreDeduction).toBe(30);
    expect(mitraSanctions[0].isSuspended).toBe(true);
    expect(mitraSanctions[0].suspendedUntil).toBeDefined();

    // Notifikasi refund dan websocket broadcast terpanggil
    expect(mockNotificationHelper.notifyMitraNoShow).toHaveBeenCalledWith(
      env.mitra.id.toString(),
      env.trip.id.toString(),
    );
    expect(mockTrackingGateway.emitCheckpointScanned).toHaveBeenCalled();
  });

  // =========================================================================
  // SKENARIO D: KEDUANYA (MITRA & CUSTOMER) TIDAK HADIR
  // =========================================================================
  it('Skenario D: Keduanya tidak hadir -> Trip dibatalkan mitra_no_show, customer auto-cancel', async () => {
    const env = await setupTripTestEnvironment('D');

    // Tidak ada scan dari Mitra maupun Customer
    const tripInit = await prisma.trip.findUnique({ where: { id: env.trip.id } });
    const orderInit = await prisma.order.findUnique({ where: { id: env.order.id } });
    expect(tripInit?.status).toBe(TripStatus.scheduled);
    expect(orderInit?.status).toBe(OrderStatus.paid);

    // Waktu melewati toleransi 15 menit (10:20 WIB)
    mockSystemDate(`${env.todayStr}T10:20:00+07:00`);

    await tripsExpirationCron.handleExpiredTrips();
    restoreSystemDate();

    const tripFinal = await prisma.trip.findUnique({ where: { id: env.trip.id } });
    const orderFinal = await prisma.order.findUnique({ where: { id: env.order.id } });

    expect(tripFinal?.status).toBe(TripStatus.mitra_no_show);
    expect(orderFinal?.status).toBe(OrderStatus.cancelled);
    expect(orderFinal?.noShowReason).toContain('Mitra & customer tidak hadir melewati toleransi');
    expect(tripFinal?.mitraNoShowReason).toContain('toleransi 15 menit');
  });

  // =========================================================================
  // SKENARIO E: CHECK NOTIF ALERT PENGINGAT MITRA DAN CUSTOMER (H-30 & H-0)
  // =========================================================================
  it('Skenario E: Check notifikasi alert pengingat H-30 menit dan H-0 menit keberangkatan', async () => {
    const env = await setupTripTestEnvironment('E');

    // 1. Uji Alert H-30 Menit (Jam 09:30:00 WIB, tepat 30 menit sebelum jam 10:00:00 WIB)
    mockSystemDate(`${env.todayStr}T09:30:00+07:00`);

    await tripsExpirationCron.handleTripDepartureAlerts();
    restoreSystemDate();

    // Verifikasi alert H-30 terkirim ke Mitra dan Customer
    expect(mockNotificationHelper.notifyTripDepartureReminderH30).toHaveBeenCalledWith(
      env.mitra.id.toString(),
      env.trip.id.toString(),
      'mitra',
      expect.stringContaining('Pos 1 Asal'),
      30,
    );

    expect(mockNotificationHelper.notifyTripDepartureReminderH30).toHaveBeenCalledWith(
      env.customer.id.toString(),
      env.trip.id.toString(),
      'customer',
      expect.stringContaining('Pos 1 Asal'),
      30,
    );

    // 2. Uji Alert H-0 Menit (Jam 10:00:00 WIB, waktu keberangkatan telah tiba)
    mockSystemDate(`${env.todayStr}T10:00:00+07:00`);

    await tripsExpirationCron.handleTripDepartureAlerts();
    restoreSystemDate();

    // Verifikasi alert urgensi H-0 terkirim ke Mitra dan Customer
    expect(mockNotificationHelper.notifyTripDepartureUrgencyH0).toHaveBeenCalledWith(
      env.mitra.id.toString(),
      env.trip.id.toString(),
      'mitra',
      expect.stringContaining('Pos 1 Asal'),
    );

    expect(mockNotificationHelper.notifyTripDepartureUrgencyH0).toHaveBeenCalledWith(
      env.customer.id.toString(),
      env.trip.id.toString(),
      'customer',
      expect.stringContaining('Pos 1 Asal'),
    );
  });
});
