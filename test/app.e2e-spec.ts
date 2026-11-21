import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import {
  Role,
  VerificationStatus,
  VehicleType,
  OrderType,
  ScanType,
  UserStatus,
} from '../src/generated/prisma/enums';

describe('Sistem Trajek & Logistik (Full E2E Integration Test)', () => {
  jest.setTimeout(60000);

  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;

  // Header Tokens
  let adminToken: string;
  let approvedMitraToken: string;
  let unapprovedMitraToken: string;
  let customerToken: string;
  let operatorToken: string;

  // ID References
  let adminId: string;
  let mitraId: string;
  let customerId: string;
  let operatorId: string;
  let validVehicleId: string;
  let originPosId: string;
  let destPosId: string;

  // State dynamic untuk Alur Transaksi Sukses
  let createdTripId: string;
  let createdTripQr: string;
  let createdOrderId: string;
  let createdOrderTicketQr: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
    jwtService = app.get<JwtService>(JwtService);

    const timestamp = Date.now();

    // 1. Ambil/Buat Data Master Region & City
    let existingRegion = await prisma.region.findFirst();
    if (!existingRegion) {
      existingRegion = await prisma.region.create({
        data: { name: `Region E2E ${timestamp}`, code: `REG${timestamp}` },
      });
    }

    let existingCity = await prisma.city.findFirst();
    if (!existingCity) {
      existingCity = await prisma.city.create({
        data: {
          name: `Kota E2E ${timestamp}`,
          province: 'Jawa Tengah',
        },
      });
    }

    // 2. Seed Superadmin User
    const adminUser = await prisma.user.create({
      data: {
        name: 'Superadmin E2E',
        email: `admin.e2e.${timestamp}@example.com`,
        phone: `0811${Math.floor(10000000 + Math.random() * 90000000)}`,
        password: 'hashedpassword',
        role: Role.admin,
        status: UserStatus.active,
      },
    });
    adminId = adminUser.id.toString();
    adminToken = `Bearer ${jwtService.sign({ id: adminId, sub: adminId, role: Role.admin })}`;

    // 3. Seed Operator Pos User
    const operatorUser = await prisma.user.create({
      data: {
        name: 'Operator Pos E2E',
        email: `operator.e2e.${timestamp}@example.com`,
        phone: `0815${Math.floor(10000000 + Math.random() * 90000000)}`,
        password: 'hashedpassword',
        role: Role.operator,
        status: UserStatus.active,
      },
    });
    operatorId = operatorUser.id.toString();
    operatorToken = `Bearer ${jwtService.sign({
      id: operatorId,
      sub: operatorId,
      role: Role.operator,
    })}`;

    // 4. Seed Pos Asal & Pos Tujuan Master Data
    const originPos = await prisma.pickupPoint.create({
      data: {
        regionId: existingRegion.id,
        cityId: existingCity.id,
        operatorId: operatorUser.id,
        name: `Pos Asal Surakarta ${timestamp}`,
        address: 'Terminal Tirtonadi',
        latitude: -7.55,
        longitude: 110.82,
        qrCodePos: `POS-ORIGIN-${timestamp}`,
      },
    });
    originPosId = originPos.id.toString();

    const destPos = await prisma.pickupPoint.create({
      data: {
        regionId: existingRegion.id,
        cityId: existingCity.id,
        operatorId: operatorUser.id,
        name: `Pos Tujuan Jogja ${timestamp}`,
        address: 'Terminal Giwangan',
        latitude: -7.83,
        longitude: 110.39,
        qrCodePos: `POS-DEST-${timestamp}`,
      },
    });
    destPosId = destPos.id.toString();

    // 5. Seed Customer User (Dilengkapi pinHash dummy untuk PIN '123456')
    const hashedPinForTest = await bcrypt.hash('123456', 10);

    const customerUser = await prisma.user.create({
      data: {
        name: 'Customer E2E',
        email: `customer.e2e.${timestamp}@example.com`,
        phone: `0812${Math.floor(10000000 + Math.random() * 90000000)}`,
        password: 'hashedpassword',
        pinHash: hashedPinForTest, // Menggunakan hash asli yang valid
        role: Role.customer,
        status: UserStatus.active,
      },
    });
    customerId = customerUser.id.toString();
    customerToken = `Bearer ${jwtService.sign({ id: customerId, sub: customerId, role: Role.customer })}`;

    // 6. Seed Mitra User Approved & Kendaraan Sah
    const mitraUser = await prisma.user.create({
      data: {
        name: 'Mitra E2E Approved',
        email: `mitra.approved.${timestamp}@example.com`,
        phone: `0813${Math.floor(10000000 + Math.random() * 90000000)}`,
        password: 'hashedpassword',
        role: Role.mitra,
        status: UserStatus.active,
        statusVerification: VerificationStatus.approved,
      },
    });
    mitraId = mitraUser.id.toString();
    approvedMitraToken = `Bearer ${jwtService.sign({
      id: mitraId,
      sub: mitraId,
      role: Role.mitra,
      statusVerification: VerificationStatus.approved,
    })}`;

    const vehicle = await prisma.vehicle.create({
      data: {
        userId: BigInt(mitraId),
        type: VehicleType.mobil,
        model: 'Toyota Avanza E2E',
        plateNumber: `AD${Math.floor(1000 + Math.random() * 9000)}E2E`,
        color: 'Hitam',
        capacitySeats: 6,
        maxWeightCapacityKg: 100,
      },
    });
    validVehicleId = vehicle.id.toString();

    // 7. Seed Mitra User Pending
    const unapprovedMitraUser = await prisma.user.create({
      data: {
        name: 'Mitra E2E Pending',
        email: `mitra.pending.${timestamp}@example.com`,
        phone: `0814${Math.floor(10000000 + Math.random() * 90000000)}`,
        password: 'hashedpassword',
        role: Role.mitra,
        status: UserStatus.active,
        statusVerification: VerificationStatus.pending,
      },
    });
    unapprovedMitraToken = `Bearer ${jwtService.sign({
      id: unapprovedMitraUser.id.toString(),
      sub: unapprovedMitraUser.id.toString(),
      role: Role.mitra,
      statusVerification: VerificationStatus.pending,
    })}`;
  }, 60000);

  afterAll(async () => {
    await app.close();
  }, 60000);

  // =========================================================================
  // 🟢 SUITE 1: ALUR SUKSES TRANSAKSI PENUH (HAPPY PATH LIFE-CYCLE)
  // =========================================================================
  describe('1. FULL HAPPY PATH: Simulasi Alur Sukses dari Awal hingga Pencairan Escrow', () => {
    it('STEP 1: Mitra berhasil membuat Jadwal Trip dari Pos Asal ke Pos Tujuan', async () => {
      const res = await request(app.getHttpServer())
        .post('/trips')
        .set('Authorization', approvedMitraToken)
        .send({
          serviceType: 'mobil',
          vehicleId: validVehicleId,
          originPointId: originPosId,
          destinationPointId: destPosId,
          departureDate: '2026-12-01',
          departureTime: '2026-12-01T08:00:00.000Z',
          price: 50000,
          totalSeats: 4,
          maxWeightCapacityKg: 50,
        })
        .expect(201);

      createdTripId = res.body.id;
      createdTripQr = res.body.qrCodeTrip;
      expect(createdTripId).toBeDefined();
      expect(createdTripQr).toBeDefined();
    });

    it('STEP 2: Customer memesan tiket penumpang (Passenger Booking) pada Trip tersebut', async () => {
      const res = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', customerToken)
        .send({
          tripId: createdTripId,
          type: OrderType.passenger,
          seatsBooked: 2,
        })
        .expect(201);

      createdOrderId = res.body.id;
      createdOrderTicketQr = res.body.qrCodeTicket;
      expect(createdOrderId).toBeDefined();
      expect(createdOrderTicketQr).toBeDefined();
    });

    it('STEP 3: Customer melakukan pembayaran (Checkout Payment dengan PIN) & Dana ditahan di Escrow', async () => {
      const res = await request(app.getHttpServer())
        .post('/payments/checkout')
        .set('Authorization', customerToken)
        .send({
          orderId: createdOrderId,
          paymentGateway: 'QRIS',
          pin: '123456',
        })
        .expect(201);

      expect(res.body.payment.status).toEqual('success');
    });

    it('STEP 4: Operator Pos melakukan Check-in Pos Asal (Origin Scan) -> Status Trip & Order IN_TRANSIT', async () => {
      const res = await request(app.getHttpServer())
        .post('/checkpoints/scan')
        .set('Authorization', operatorToken)
        .send({
          qrCodeTrip: createdTripQr,
          qrCodeTicket: createdOrderTicketQr,
          posId: originPosId,
          scanType: ScanType.checkin_origin,
        })
        .expect(201);

      expect(res.body.message).toContain('Check-in Pos Asal berhasil');

      const updatedOrder = await prisma.order.findUnique({
        where: { id: BigInt(createdOrderId) },
      });
      if (updatedOrder?.qrCodeTicket) {
        createdOrderTicketQr = updatedOrder.qrCodeTicket;
      }
    });

    it('STEP 5: Operator Pos melakukan Check-in Pos Tujuan (Destination Scan) -> Status COMPLETED & Escrow Release', async () => {
      const res = await request(app.getHttpServer())
        .post('/checkpoints/scan')
        .set('Authorization', operatorToken)
        .send({
          qrCodeTrip: createdTripQr,
          qrCodeTicket: createdOrderTicketQr,
          posId: destPosId,
          scanType: ScanType.checkin_destination,
        })
        .expect(201);

      expect(res.body.message).toContain(
        'Dana Escrow dicairkan ke Wallet Mitra',
      );
    });

    it('STEP 6: Customer memberikan ulasan bintang 5 setelah transaksi selesai', async () => {
      const res = await request(app.getHttpServer())
        .post('/reviews')
        .set('Authorization', customerToken)
        .send({
          tripId: createdTripId,
          revieweeId: mitraId,
          rating: 5,
          comment: 'Perjalanan sangat nyaman dan tepat waktu!',
        })
        .expect(201);

      expect(res.body.rating).toEqual(5);
    });
  });

  // =========================================================================
  // 🔴 SUITE 2: SKENARIO PENOLAKAN & INTEGRITAS (NEGATIVE TESTS)
  // =========================================================================
  describe('2. SKENARIO PENOLAKAN: Memastikan Validasi Keamanan Sistem Berfungsi', () => {
    it('Mitra ber-status PENDING ditolak (403) saat membuat jadwal Trip', async () => {
      await request(app.getHttpServer())
        .post('/trips')
        .set('Authorization', unapprovedMitraToken)
        .send({
          serviceType: 'mobil',
          vehicleId: validVehicleId,
          originPointId: originPosId,
          destinationPointId: destPosId,
          departureDate: '2026-12-01',
          departureTime: '2026-12-01T08:00:00.000Z',
          price: 50000,
        })
        .expect(403);
    });

    it('Ditolak (400) jika Pos Asal dan Pos Tujuan SAMA', async () => {
      await request(app.getHttpServer())
        .post('/trips')
        .set('Authorization', approvedMitraToken)
        .send({
          serviceType: 'mobil',
          vehicleId: validVehicleId,
          originPointId: originPosId,
          destinationPointId: originPosId,
          departureDate: '2026-12-01',
          departureTime: '2026-12-01T08:00:00.000Z',
          price: 50000,
        })
        .expect(400);
    });

    it('User ditolak (400) jika mencoba mengulas dirinya sendiri', async () => {
      await request(app.getHttpServer())
        .post('/reviews')
        .set('Authorization', customerToken)
        .send({
          tripId: createdTripId,
          revieweeId: customerId,
          rating: 5,
        })
        .expect(400);
    });

    it('Admin ditolak (400) saat mencoba menangguhkan (suspend) akunnya sendiri', async () => {
      await request(app.getHttpServer())
        .patch(`/admin/users/${adminId}/governance`)
        .set('Authorization', adminToken)
        .send({ status: UserStatus.suspended })
        .expect(400);
    });
  });
});
