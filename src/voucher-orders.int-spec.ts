import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { OrdersService } from './modules/orders/orders.service';
import { OrdersRepository } from './modules/orders/repository/orders.repository';
import { TripsService } from './modules/trips/trips.service';
import { TripsRepository } from './modules/trips/repository/trips.repository';
import { VehiclesRepository } from './modules/vehicles/repository/vehicles.repository';
import { VouchersService } from './modules/vouchers/vouchers.service';
import { VouchersRepository } from './modules/vouchers/repository/vouchers.repository';
import { PaymentsService } from './modules/payments/payments.service';
import { PaymentsRepository } from './modules/payments/repository/payments.repository';
import { CheckpointsRepository } from './modules/checkpoints/repository/checkpoints.repository';
import { NotificationHelperService } from './modules/notifications/notification-helper.service';
import { NotificationsService } from './modules/notifications/notifications.service';
import { SanctionService } from './modules/admin/sanction.service';
import {
  DiscountType,
  EscrowStatus,
  OrderStatus,
  OrderType,
  Role,
  VoucherRedemptionStatus,
} from './generated/prisma/enums';
import { seedMinimalTestData } from '../test-integration/seed-helper';
import { assertConnectedToTestDb } from '../test-integration/env-guard';
import { cleanTestDatabase } from '../test-integration/test-helper';
import * as bcrypt from 'bcrypt';

describe('Voucher Phase 1 Integration Tests', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let ordersService: OrdersService;
  let tripsService: TripsService;
  let paymentsService: PaymentsService;
  let checkpointsRepository: CheckpointsRepository;

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
        OrdersService,
        OrdersRepository,
        TripsService,
        TripsRepository,
        VehiclesRepository,
        VouchersService,
        VouchersRepository,
        PaymentsService,
        PaymentsRepository,
        CheckpointsRepository,
        {
          provide: NotificationHelperService,
          useValue: {
            notifyOrderCreated: jest.fn(),
            notifyOrderPaid: jest.fn(),
            notifyTripBookingRequest: jest.fn(),
            notifyPaymentSuccess: jest.fn(),
            notifyOrderCancelled: jest.fn(),
            notifyTripCancelledByMitra: jest.fn(),
            notifyMitraCancellationSanction: jest.fn(),
          },
        },
        {
          provide: NotificationsService,
          useValue: {
            sendNotification: jest.fn().mockResolvedValue(true),
          },
        },
        {
          provide: SanctionService,
          useValue: {
            applySanction: jest.fn().mockResolvedValue({
              scoreDeduction: 0,
              isSuspended: false,
              suspendedUntil: null,
            }),
            getMitraSanctions: jest.fn().mockResolvedValue({
              currentScore: 100,
            }),
          },
        },
      ],
    }).compile();

    prisma = moduleRef.get<PrismaService>(PrismaService);
    ordersService = moduleRef.get<OrdersService>(OrdersService);
    tripsService = moduleRef.get<TripsService>(TripsService);
    paymentsService = moduleRef.get<PaymentsService>(PaymentsService);
    checkpointsRepository =
      moduleRef.get<CheckpointsRepository>(CheckpointsRepository);

    await assertConnectedToTestDb(prisma);
    await cleanTestDatabase(prisma);
  }, 60000);

  beforeEach(async () => {
    await cleanTestDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // =========================================================================
  // TEST 1: Order bervoucher dibayar lalu escrow dicairkan
  // Customer bayar subtotal - diskon, mitra menerima subtotal - fee,
  // admin menerima totalPrice - netMitra (uji juga kasus diskon > fee sehingga admin net negatif).
  // =========================================================================
  it('1. Order bervoucher dibayar lalu escrow dicairkan (diskon > fee sehingga admin net negatif)', async () => {
    const seed = await seedMinimalTestData(prisma);

    // Hapus order bawaan seed agar customer dapat membuat order baru pada trip ini
    await prisma.walletTransaction.deleteMany({
      where: { orderId: seed.order.id },
    });
    await prisma.order.delete({ where: { id: seed.order.id } });

    // Pastikan harga trip 100,000 dan sisa kursi 4 agar perhitungan mudah diverifikasi
    await prisma.trip.update({
      where: { id: seed.trip.id },
      data: { price: 100000, seatAvailable: 4 },
    });

    // Buat voucher dengan diskon Rp 30.000 (lebih besar dari fee 10% = Rp 10.000)
    const voucher = await prisma.voucher.create({
      data: {
        code: `DISKON30K_${Date.now()}`,
        title: 'Diskon 30 Ribu',
        discountType: DiscountType.fixed_amount,
        discountValue: 30000,
        minOrderAmount: 50000,
        usageLimit: 10,
        usagePerUserLimit: 2,
        validFrom: new Date(Date.now() - 3600000),
        validUntil: new Date(Date.now() + 86400000),
        isActive: true,
      },
    });

    // Setup user customer dengan pin dan wallet saldo Rp 200.000
    await prisma.user.update({
      where: { id: seed.customer.id },
      data: { pinHash: await bcrypt.hash('123456', 10) },
    });
    await prisma.wallet.update({
      where: { userId: seed.customer.id },
      data: { balance: 200000, heldEscrowBalance: 0 },
    });

    // Setup mitra wallet awal 0
    await prisma.wallet.update({
      where: { userId: seed.mitra.id },
      data: { balance: 0, heldEscrowBalance: 0 },
    });

    // Setup admin wallet awal 0 (agar saldo negatif terlihat langsung)
    await prisma.wallet.update({
      where: { userId: seed.admin.id },
      data: { balance: 0, heldEscrowBalance: 0 },
    });

    // 1. Customer membuat order dengan voucher
    const orderCreated = await ordersService.createOrder(
      seed.customer.id.toString(),
      {
        tripId: seed.trip.id.toString(),
        type: OrderType.passenger,
        seatsBooked: 1,
        voucherCode: voucher.code,
      },
    );

    expect(orderCreated).toBeDefined();
    expect(Number(orderCreated!.subtotal)).toBe(100000);
    expect(Number(orderCreated!.discountAmount)).toBe(30000);
    expect(Number(orderCreated!.totalPrice)).toBe(70000); // Customer bayar subtotal - diskon
    expect(orderCreated!.voucherCode).toBe(voucher.code);

    // Cek voucher redemption berstatus 'reserved'
    const redemptionReserved = await prisma.voucherRedemption.findUnique({
      where: { orderId: BigInt(orderCreated!.id) },
    });
    expect(redemptionReserved).not.toBeNull();
    expect(redemptionReserved?.status).toBe(VoucherRedemptionStatus.reserved);
    expect(Number(redemptionReserved?.discountAmount)).toBe(30000);

    // 2. Customer membayar pesanan via WALLET
    await paymentsService.checkoutPayment(seed.customer.id.toString(), {
      orderId: orderCreated!.id.toString(),
      paymentGateway: 'WALLET',
      pin: '123456',
    });

    // Verifikasi saldo customer setelah checkout: berkurang totalPrice = 70.000
    const customerWalletAfterPay = await prisma.wallet.findUnique({
      where: { userId: seed.customer.id },
    });
    expect(Number(customerWalletAfterPay?.balance)).toBe(130000); // 200.000 - 70.000

    // Verifikasi saldo mitra setelah checkout: heldEscrow bertambah netMitra = 90.000 (subtotal 100k - fee 10k)
    const mitraWalletAfterPay = await prisma.wallet.findUnique({
      where: { userId: seed.mitra.id },
    });
    expect(Number(mitraWalletAfterPay?.heldEscrowBalance)).toBe(90000);
    expect(Number(mitraWalletAfterPay?.balance)).toBe(0);

    // Verifikasi saldo admin setelah checkout: adminNet = 70.000 - 90.000 = -20.000 (diskon > fee, admin subsidi)
    const adminWalletAfterPay = await prisma.wallet.findUnique({
      where: { userId: seed.admin.id },
    });
    expect(Number(adminWalletAfterPay?.balance)).toBe(-20000);

    // Verifikasi voucher redemption berubah menjadi 'used'
    const redemptionUsed = await prisma.voucherRedemption.findUnique({
      where: { orderId: BigInt(orderCreated!.id) },
    });
    expect(redemptionUsed?.status).toBe(VoucherRedemptionStatus.used);

    // 3. Escrow dicairkan saat tiba di tujuan
    await checkpointsRepository.processCheckinDestinationAndReleaseEscrow(
      seed.trip.id,
      BigInt(orderCreated!.id),
      seed.destPoint.id.toString(),
      seed.mitra.id.toString(),
      seed.mitra.id,
      seed.customer.id,
      70000,
      10,
      undefined,
      100000,
    );

    // Verifikasi saldo mitra setelah escrow cair:
    // heldEscrow berkurang 90.000 menjadi 0, balance bertambah 90.000 (subtotal - fee)
    const mitraWalletAfterRelease = await prisma.wallet.findUnique({
      where: { userId: seed.mitra.id },
    });
    expect(Number(mitraWalletAfterRelease?.heldEscrowBalance)).toBe(0);
    expect(Number(mitraWalletAfterRelease?.balance)).toBe(90000);

    // Verifikasi saldo admin tetap -20.000 (admin menerima totalPrice - netMitra)
    const adminWalletAfterRelease = await prisma.wallet.findUnique({
      where: { userId: seed.admin.id },
    });
    expect(Number(adminWalletAfterRelease?.balance)).toBe(-20000);

    // Verifikasi status order selesai
    const finishedOrder = await prisma.order.findUnique({
      where: { id: BigInt(orderCreated!.id) },
    });
    expect(finishedOrder?.status).toBe(OrderStatus.completed);
    expect(finishedOrder?.escrowStatus).toBe(EscrowStatus.released);
  });

  // =========================================================================
  // TEST 2: Order bervoucher dibatalkan mitra (cancelTripByMitra)
  // Tidak ada error konsistensi, customer di-refund totalPrice,
  // escrow dan admin kembali ke nol bersih, redemption released.
  // =========================================================================
  it('2. Order bervoucher dibatalkan mitra (cancelTripByMitra): tidak ada error konsistensi, dana kembali ke nol bersih, redemption released', async () => {
    const seed = await seedMinimalTestData(prisma);

    // Hapus order bawaan seed
    await prisma.walletTransaction.deleteMany({
      where: { orderId: seed.order.id },
    });
    await prisma.order.delete({ where: { id: seed.order.id } });

    await prisma.trip.update({
      where: { id: seed.trip.id },
      data: { price: 100000, seatAvailable: 4 },
    });

    const voucher = await prisma.voucher.create({
      data: {
        code: `DISKONBATAL_${Date.now()}`,
        title: 'Diskon Pembatalan',
        discountType: DiscountType.fixed_amount,
        discountValue: 30000,
        minOrderAmount: 50000,
        usageLimit: 10,
        usagePerUserLimit: 2,
        validFrom: new Date(Date.now() - 3600000),
        validUntil: new Date(Date.now() + 86400000),
        isActive: true,
      },
    });

    await prisma.user.update({
      where: { id: seed.customer.id },
      data: { pinHash: await bcrypt.hash('123456', 10) },
    });
    await prisma.wallet.update({
      where: { userId: seed.customer.id },
      data: { balance: 200000, heldEscrowBalance: 0 },
    });
    await prisma.wallet.update({
      where: { userId: seed.mitra.id },
      data: { balance: 0, heldEscrowBalance: 0 },
    });
    await prisma.wallet.update({
      where: { userId: seed.admin.id },
      data: { balance: 0, heldEscrowBalance: 0 },
    });

    // Customer membuat order dan membayar
    const order = await ordersService.createOrder(seed.customer.id.toString(), {
      tripId: seed.trip.id.toString(),
      type: OrderType.passenger,
      seatsBooked: 1,
      voucherCode: voucher.code,
    });

    expect(order).toBeDefined();

    await paymentsService.checkoutPayment(seed.customer.id.toString(), {
      orderId: order!.id.toString(),
      paymentGateway: 'WALLET',
      pin: '123456',
    });

    // Mitra membatalkan trip
    const cancelResult = await tripsService.cancelByMitra(
      seed.trip.id.toString(),
      seed.mitra.id.toString(),
      { reason: 'Kendaraan mengalami masalah teknis' },
    );
    expect(cancelResult).toBeDefined();

    // Verifikasi saldo customer di-refund penuh sebesar totalPrice (70.000) -> kembali ke 200.000
    const customerWalletAfterCancel = await prisma.wallet.findUnique({
      where: { userId: seed.customer.id },
    });
    expect(Number(customerWalletAfterCancel?.balance)).toBe(200000);

    // Verifikasi escrow mitra ditarik kembali (90.000) -> kembali ke 0 bersih
    const mitraWalletAfterCancel = await prisma.wallet.findUnique({
      where: { userId: seed.mitra.id },
    });
    expect(Number(mitraWalletAfterCancel?.heldEscrowBalance)).toBe(0);
    expect(Number(mitraWalletAfterCancel?.balance)).toBe(0);

    // Verifikasi admin: subsidi (-20.000) dikembalikan (+20.000) -> kembali ke 0 bersih
    const adminWalletAfterCancel = await prisma.wallet.findUnique({
      where: { userId: seed.admin.id },
    });
    expect(Number(adminWalletAfterCancel?.balance)).toBe(0);

    // Verifikasi status redemption menjadi 'released'
    const redemptionAfterCancel = await prisma.voucherRedemption.findUnique({
      where: { orderId: BigInt(order!.id) },
    });
    expect(redemptionAfterCancel?.status).toBe(VoucherRedemptionStatus.released);

    // Verifikasi status order
    const cancelledOrder = await prisma.order.findUnique({
      where: { id: BigInt(order!.id) },
    });
    expect(cancelledOrder?.status).toBe(OrderStatus.cancelled_by_mitra);
    expect(cancelledOrder?.escrowStatus).toBe(EscrowStatus.refunded);
  });

  // =========================================================================
  // TEST 3: Dua order dari dua customer berebut kuota terakhir via Promise.all
  // Hanya satu yang berhasil, yang lain gagal karena kuota habis.
  // =========================================================================
  it('3. Dua order dari dua customer berebut kuota terakhir via Promise.all: hanya satu berhasil', async () => {
    const seed = await seedMinimalTestData(prisma);

    // Hapus order bawaan seed
    await prisma.walletTransaction.deleteMany({
      where: { orderId: seed.order.id },
    });
    await prisma.order.delete({ where: { id: seed.order.id } });

    await prisma.trip.update({
      where: { id: seed.trip.id },
      data: { seatAvailable: 4 },
    });

    // Buat customer kedua
    const customerB = await prisma.user.create({
      data: {
        name: 'Customer Rebutan',
        email: `custrebutan${Date.now()}@test.com`,
        password: 'hashedpassword',
        role: Role.customer,
        phone: `0877${Date.now().toString().slice(-8)}`,
      },
    });

    // Buat voucher dengan usageLimit = 1 (kuota hanya 1)
    const voucher = await prisma.voucher.create({
      data: {
        code: `REBUTAN_${Date.now()}`,
        title: 'Voucher Kuota 1',
        discountType: DiscountType.fixed_amount,
        discountValue: 15000,
        minOrderAmount: 50000,
        usageLimit: 1,
        usagePerUserLimit: 1,
        validFrom: new Date(Date.now() - 3600000),
        validUntil: new Date(Date.now() + 86400000),
        isActive: true,
      },
    });

    // Dua customer memanggil createOrder secara bersamaan (Promise.allSettled)
    const [result1, result2] = await Promise.allSettled([
      ordersService.createOrder(seed.customer.id.toString(), {
        tripId: seed.trip.id.toString(),
        type: OrderType.passenger,
        seatsBooked: 1,
        voucherCode: voucher.code,
      }),
      ordersService.createOrder(customerB.id.toString(), {
        tripId: seed.trip.id.toString(),
        type: OrderType.passenger,
        seatsBooked: 1,
        voucherCode: voucher.code,
      }),
    ]);

    // Salah satu harus fulfilled, salah satu harus rejected
    const fulfilledResults = [result1, result2].filter(
      (r) => r.status === 'fulfilled',
    );
    const rejectedResults = [result1, result2].filter(
      (r) => r.status === 'rejected',
    );

    expect(fulfilledResults).toHaveLength(1);
    expect(rejectedResults).toHaveLength(1);

    const rejectedError = (rejectedResults[0] as PromiseRejectedResult).reason;
    expect(rejectedError).toBeInstanceOf(BadRequestException);
    expect(rejectedError.message).toContain(
      'Kuota penggunaan voucher ini sudah habis',
    );

    // Di database, hanya ada tepat 1 redemption untuk voucher ini
    const redemptionsInDb = await prisma.voucherRedemption.findMany({
      where: { voucherId: voucher.id },
    });
    expect(redemptionsInDb).toHaveLength(1);
    expect(redemptionsInDb[0].status).toBe(VoucherRedemptionStatus.reserved);
  });
});
