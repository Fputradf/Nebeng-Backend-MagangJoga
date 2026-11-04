import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from './prisma/prisma.service';
import { TripsService } from './modules/trips/trips.service';
import { TripsRepository } from './modules/trips/repository/trips.repository';
import { VehiclesRepository } from './modules/vehicles/repository/vehicles.repository';
import { OrdersService } from './modules/orders/orders.service';
import { OrdersRepository } from './modules/orders/repository/orders.repository';
import { PaymentsService } from './modules/payments/payments.service';
import { PaymentsRepository } from './modules/payments/repository/payments.repository';
import { CheckpointsService } from './modules/checkpoints/checkpoints.service';
import { CheckpointsRepository } from './modules/checkpoints/repository/checkpoints.repository';
import { SanctionService } from './modules/admin/sanction.service';
import { NotificationHelperService } from './modules/notifications/notification-helper.service';
import { TrackingGateway } from './modules/tracking/tracking.gateway';
import { assertConnectedToTestDb } from '../test-integration/env-guard';
import { cleanTestDatabase } from '../test-integration/test-helper';
import {
  Role,
  VerificationStatus,
  VehicleType,
  ServiceType,
  OrderType,
  OrderStatus,
  EscrowStatus,
  ParcelSize,
  ScanType,
  TripStatus,
} from './generated/prisma/client';
import * as bcrypt from 'bcrypt';

describe('Alur End-to-End Pemesanan Paket Barang (Parcel Flow)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let tripsService: TripsService;
  let ordersService: OrdersService;
  let paymentsService: PaymentsService;
  let checkpointsService: CheckpointsService;

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
        TripsService,
        TripsRepository,
        VehiclesRepository,
        OrdersService,
        OrdersRepository,
        PaymentsService,
        PaymentsRepository,
        CheckpointsService,
        CheckpointsRepository,
        SanctionService,
        {
          provide: NotificationHelperService,
          useValue: {
            notifyOrderPaid: jest.fn(),
            notifyPaymentSuccess: jest.fn(),
            notifyOrderCancelled: jest.fn(),
            notifyOrderCreated: jest.fn(),
            notifyTripBookingRequest: jest.fn(),
            notifyCheckpointScanned: jest.fn(),
            notifyTripArrivedAtDestination: jest.fn(),
            notifyEscrowReleased: jest.fn(),
          },
        },
        {
          provide: TrackingGateway,
          useValue: {
            emitCheckpointScanned: jest.fn(),
          },
        },
      ],
    }).compile();

    prisma = moduleRef.get<PrismaService>(PrismaService);
    tripsService = moduleRef.get<TripsService>(TripsService);
    ordersService = moduleRef.get<OrdersService>(OrdersService);
    paymentsService = moduleRef.get<PaymentsService>(PaymentsService);
    checkpointsService = moduleRef.get<CheckpointsService>(CheckpointsService);

    await assertConnectedToTestDb(prisma);
    await cleanTestDatabase(prisma);
  }, 60000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('Harus berhasil menjalankan seluruh alur pemesanan paket barang: Mitra buat trip -> Customer beli & bayar -> Check-in Pos Asal -> Handover Pos Tujuan dengan OTP', async () => {
    const timestamp = Date.now();
    const pinHash = await bcrypt.hash('123456', 10);
    const passwordHash = await bcrypt.hash('Password123!', 10);

    // =========================================================================
    // 0. SEED MASTER DATA (Wilayah, Pos, Tarif Paket, Admin)
    // =========================================================================
    const admin = await prisma.user.create({
      data: {
        name: 'Master Admin',
        email: `admin-${timestamp}@test.com`,
        password: passwordHash,
        role: Role.admin,
        phone: `08110000${timestamp.toString().slice(-4)}`,
      },
    });
    process.env.SYSTEM_ADMIN_USER_ID = admin.id.toString();

    await prisma.wallet.create({
      data: {
        userId: admin.id,
        balance: 1000000,
        heldEscrowBalance: 0,
      },
    });

    const region = await prisma.region.create({
      data: {
        code: `REG-${timestamp}`,
        name: 'Jawa Barat',
        pricePerKm: 2500,
        latitude: -6.9175,
        longitude: 107.6191,
      },
    });

    const city = await prisma.city.create({
      data: {
        name: 'Bandung',
        province: 'Jawa Barat',
      },
    });

    // Buat Pos Asal & Pos Tujuan
    const originPos = await prisma.pickupPoint.create({
      data: {
        name: 'Pos Asal Jakarta Timur',
        address: 'Terminal Pulogebang',
        latitude: -6.2125,
        longitude: 106.9536,
        cityId: city.id,
        regionId: region.id,
        qrCodePos: `POS-ORIGIN-${timestamp}`,
        isActive: true,
      },
    });

    const destPos = await prisma.pickupPoint.create({
      data: {
        name: 'Pos Tujuan Bandung Pusat',
        address: 'Stasiun Hall Bandung',
        latitude: -6.9147,
        longitude: 107.6025,
        cityId: city.id,
        regionId: region.id,
        qrCodePos: `POS-DEST-${timestamp}`,
        isActive: true,
      },
    });

    // Seed konfigurasi tarif paket barang (Pricing Settings)
    await prisma.pricingSetting.createMany({
      data: [
        {
          serviceType: ServiceType.barang,
          size: null,
          baseFare: 20000,
          farePerKm: 2000,
          farePerKg: 1000,
          maxWeightKg: 50,
          adminFeePercentage: 10,
        },
        {
          serviceType: ServiceType.barang,
          size: ParcelSize.m,
          baseFare: 30000,
          farePerKm: 2000,
          farePerKg: 1000,
          maxWeightKg: 10,
          adminFeePercentage: 10,
        },
      ],
    });

    // =========================================================================
    // 1. MITRA DAFTAR KENDARAAN & BUAT JADWAL TRIP PAKET BARANG
    // =========================================================================
    const mitra = await prisma.user.create({
      data: {
        name: 'Mitra Logistik',
        email: `mitra-${timestamp}@test.com`,
        password: passwordHash,
        role: Role.mitra,
        statusVerification: VerificationStatus.approved,
        phone: `08121111${timestamp.toString().slice(-4)}`,
      },
    });

    const mitraWallet = await prisma.wallet.create({
      data: {
        userId: mitra.id,
        balance: 0,
        heldEscrowBalance: 0,
      },
    });

    const vehicle = await prisma.vehicle.create({
      data: {
        userId: mitra.id,
        type: VehicleType.mobil,
        model: 'GranMax Blindvan',
        plateNumber: `D ${timestamp.toString().slice(-4)} BOX`,
        color: 'Putih',
        capacitySeats: 2,
        maxWeightCapacityKg: 500,
      },
    });

    // Waktu keberangkatan: 2 hari ke depan jam 09:00 WIB
    const departureDate = new Date();
    departureDate.setDate(departureDate.getDate() + 2);
    departureDate.setHours(9, 0, 0, 0);

    const tripResponse = await tripsService.createTrip(mitra.id.toString(), {
      vehicleId: vehicle.id.toString(),
      originPointId: originPos.id.toString(),
      destinationPointId: destPos.id.toString(),
      departureDate: departureDate.toISOString().split('T')[0],
      departureTime: departureDate.toISOString(),
      price: 45000, // Tarif dasar per paket
      maxWeightCapacityKg: 50, // Kapasitas muat paket 50 KG
      serviceType: ServiceType.barang,
    });

    expect(tripResponse).toBeDefined();
    expect(tripResponse.serviceType).toBe(ServiceType.barang);
    expect(tripResponse.seatTotal).toBe(0); // Khusus barang tidak ada kursi penumpang
    expect(tripResponse.seatAvailable).toBe(0);
    expect(tripResponse.maxWeightCapacityKg).toBe(50);
    expect(tripResponse.remainingWeightCapacityKg).toBe(50);

    const tripId = tripResponse.id.toString();

    // =========================================================================
    // 2. CUSTOMER MEMBUAT PESANAN PENGIRIMAN PAKET BARANG
    // =========================================================================
    const customer = await prisma.user.create({
      data: {
        name: 'Customer Pengirim',
        email: `customer-${timestamp}@test.com`,
        password: passwordHash,
        pinHash,
        role: Role.customer,
        phone: `08132222${timestamp.toString().slice(-4)}`,
      },
    });

    const customerWallet = await prisma.wallet.create({
      data: {
        userId: customer.id,
        balance: 300000, // Saldo Rp 300.000
        heldEscrowBalance: 0,
      },
    });

    // Pesan 2 item paket @ 3 KG = Total 6 KG ukuran M
    const orderCreated = await ordersService.createOrder(customer.id.toString(), {
      tripId,
      type: OrderType.parcel,
      items: [
        {
          itemName: 'Paket Suku Cadang Mesin',
          itemCategory: 'Elektronik & Mesin',
          quantity: 2,
          weightPerItemKg: 3,
          sizeEnum: ParcelSize.m,
          recipientName: 'Bapak Ahmad Penerima',
          recipientPhone: '081988776655',
        },
      ],
    });

    expect(orderCreated).toBeDefined();
    expect(orderCreated.type).toBe(OrderType.parcel);
    expect(orderCreated.status).toBe(OrderStatus.pending_payment);
    expect(orderCreated.totalItemsCount).toBe(1); // 1 entri item (2 qty)
    expect(orderCreated.totalWeightKg).toBe(6); // 2 item * 3 kg = 6 kg
    expect(orderCreated.qrCodeTicket).toMatch(/^TKT-/);
    expect(orderCreated.otpClaim).toBeDefined();
    expect(orderCreated.otpClaim?.length).toBe(6); // OTP Klaim 6 digit

    // Cek sisa kapasitas berat trip di database berkurang (50 KG - 6 KG = 44 KG)
    const tripAfterOrder = await prisma.trip.findUnique({
      where: { id: BigInt(tripId) },
    });
    expect(Number(tripAfterOrder?.remainingWeightCapacityKg)).toBe(44);

    const orderId = orderCreated.id.toString();
    const orderTotalPrice = Number(orderCreated.totalPrice);
    expect(orderTotalPrice).toBe(45000 * 2); // 90.000

    // =========================================================================
    // 3. CUSTOMER MELAKUKAN PEMBAYARAN VIA WALLET
    // =========================================================================
    const paymentResult = await paymentsService.checkoutPayment(customer.id.toString(), {
      orderId,
      paymentGateway: 'WALLET',
      pin: '123456',
    });

    expect(paymentResult.payment.status).toBe('success');

    // Cek saldo customer berkurang tepat Rp 90.000 (300.000 -> 210.000)
    const customerWalletAfterPay = await prisma.wallet.findUnique({
      where: { id: customerWallet.id },
    });
    expect(Number(customerWalletAfterPay?.balance)).toBe(300000 - orderTotalPrice);

    // Cek status order berubah menjadi PAID dan dana escrow berstatus HELD
    const paidOrder = await prisma.order.findUnique({
      where: { id: BigInt(orderId) },
    });
    expect(paidOrder?.status).toBe(OrderStatus.paid);
    expect(paidOrder?.escrowStatus).toBe(EscrowStatus.held);

    // Admin fee 10% dari 90.000 = 9.000, Bagian mitra = 81.000
    const expectedMitraNet = 90000 - Math.round(90000 * 0.1);
    const mitraWalletAfterPay = await prisma.wallet.findUnique({
      where: { id: mitraWallet.id },
    });
    expect(Number(mitraWalletAfterPay?.heldEscrowBalance)).toBe(expectedMitraNet);
    expect(Number(mitraWalletAfterPay?.balance)).toBe(0); // Belum cair sampai tiba di tujuan

    // =========================================================================
    // 4. CHECK-IN POS ASAL OLEH OPERATOR POS (Origin Checkpoint)
    // =========================================================================
    const operator = await prisma.user.create({
      data: {
        name: 'Petugas Operator Pulogebang',
        email: `operator-${timestamp}@test.com`,
        password: passwordHash,
        role: Role.operator,
        phone: `08153333${timestamp.toString().slice(-4)}`,
      },
    });

    const checkinOriginRes = await checkpointsService.scanCheckpoint(operator, {
      qrCodeTicket: paidOrder!.qrCodeTicket,
      posId: originPos.id.toString(),
      scanType: ScanType.checkin_origin,
      securitySealQr: `SEAL-${timestamp}-001`,
    });

    expect(checkinOriginRes.message).toContain('Check-in Pos Asal berhasil');

    const orderCheckedInOrigin = await prisma.order.findUnique({
      where: { id: BigInt(orderId) },
    });
    // Status order berubah menjadi checked_in_origin dan QR tiket dirotasi ke token tujuan
    expect(orderCheckedInOrigin?.status).toBe(OrderStatus.checked_in_origin);
    expect(orderCheckedInOrigin?.qrCodeTicket).toMatch(/^TKT-DEST-/);

    const tripInTransit = await prisma.trip.findUnique({
      where: { id: BigInt(tripId) },
    });
    expect(tripInTransit?.status).toBe(TripStatus.in_transit);

    // 4b. UJI COBA PENCEGAHAN BUG SCAN GANDA (SCAN 2X) DI POS ASAL
    await expect(
      checkpointsService.scanCheckpoint(operator, {
        qrCodeTicket: orderId, // scan ulang dengan ID tiket/order
        posId: originPos.id.toString(),
        scanType: ScanType.checkin_origin,
      }),
    ).rejects.toThrow('Tiket/Pesanan ini sudah melalui proses check-in di Pos Asal.');

    // Uji coba scan ulang QR Trip Mitra di Pos Asal
    await expect(
      checkpointsService.scanCheckpoint(operator, {
        qrCodeTrip: tripResponse.qrCodeTrip,
        posId: originPos.id.toString(),
        scanType: ScanType.checkin_origin,
      }),
    ).rejects.toThrow('Mitra/Trip ini sudah melakukan check-in di Pos Asal.');

    // =========================================================================
    // 5. PENGAMBILAN PAKET DI POS TUJUAN & PENCAIRAN ESCROW
    // =========================================================================
    // 5a. Uji coba dengan OTP Klaim yang salah (harus ditolak)
    await expect(
      checkpointsService.scanCheckpoint(operator, {
        qrCodeTicket: orderCheckedInOrigin!.qrCodeTicket,
        posId: destPos.id.toString(),
        scanType: ScanType.checkin_destination,
        otpClaim: '000000', // OTP Salah
        recipientName: 'Bapak Ahmad Penerima',
      }),
    ).rejects.toThrow('Kode OTP Klaim yang dimasukkan salah/tidak cocok.');

    // Status order harus tetap checked_in_origin
    const orderStillPendingHandover = await prisma.order.findUnique({
      where: { id: BigInt(orderId) },
    });
    expect(orderStillPendingHandover?.status).toBe(OrderStatus.checked_in_origin);

    // 5b. Handover dengan OTP Klaim yang benar
    const checkinDestRes = await checkpointsService.scanCheckpoint(operator, {
      qrCodeTicket: orderCheckedInOrigin!.qrCodeTicket,
      posId: destPos.id.toString(),
      scanType: ScanType.checkin_destination,
      otpClaim: paidOrder!.otpClaim!, // OTP Benar
      recipientName: 'Bapak Ahmad Penerima',
    });

    expect(checkinDestRes.message).toContain('Penyerahan Barang berhasil');

    // Status order berubah menjadi COMPLETED
    const completedOrder = await prisma.order.findUnique({
      where: { id: BigInt(orderId) },
    });
    expect(completedOrder?.status).toBe(OrderStatus.completed);
    expect(completedOrder?.escrowStatus).toBe(EscrowStatus.released);

    // Dana escrow Mitra dicairkan ke saldo dompet Mitra (balance)
    const mitraWalletFinal = await prisma.wallet.findUnique({
      where: { id: mitraWallet.id },
    });
    expect(Number(mitraWalletFinal?.heldEscrowBalance)).toBe(0);
    expect(Number(mitraWalletFinal?.balance)).toBe(expectedMitraNet); // Rp 81.000 telah masuk ke dompet mitra

    // 5c. UJI COBA PENCEGAHAN BUG SCAN GANDA (SCAN 2X) DI POS TUJUAN
    await expect(
      checkpointsService.scanCheckpoint(operator, {
        qrCodeTicket: orderCheckedInOrigin!.qrCodeTicket,
        posId: destPos.id.toString(),
        scanType: ScanType.checkin_destination,
        otpClaim: paidOrder!.otpClaim!,
        recipientName: 'Bapak Ahmad Penerima',
      }),
    ).rejects.toThrow();

    // Uji coba scan ulang QR Trip Mitra di Pos Tujuan setelah selesai
    await expect(
      checkpointsService.scanCheckpoint(operator, {
        qrCodeTrip: tripResponse.qrCodeTrip,
        posId: destPos.id.toString(),
        scanType: ScanType.checkin_destination,
      }),
    ).rejects.toThrow('Mitra/Trip ini sudah melakukan check-in di Pos Tujuan.');

    console.log('\n--- RINGKASAN TEST ALUR PEMESANAN PAKET SUKSES ---');
    console.log(`1. Trip Barang ID: ${tripId} (Kapasitas Awal: 50 KG)`);
    console.log(`2. Order ID: ${orderId} (Berat: 6 KG, OTP: ${paidOrder?.otpClaim}, Tiket: ${paidOrder?.qrCodeTicket})`);
    console.log(`3. Sisa Kapasitas Trip: ${tripAfterOrder?.remainingWeightCapacityKg} KG`);
    console.log(`4. Pembayaran Total: Rp ${orderTotalPrice.toLocaleString('id-ID')}`);
    console.log(`5. Saldo Masuk ke Mitra: Rp ${expectedMitraNet.toLocaleString('id-ID')} (Potongan Admin 10%)`);
    console.log(`6. Status Akhir: Order COMPLETED, Escrow RELEASED ke Dompet Mitra.\n`);
  });
});
