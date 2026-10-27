import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from './prisma/prisma.service';
import { PaymentsService } from './modules/payments/payments.service';
import { PaymentsRepository } from './modules/payments/repository/payments.repository';
import { OrdersRepository } from './modules/orders/repository/orders.repository';
import { OrdersService } from './modules/orders/orders.service';
import { TripsRepository } from './modules/trips/repository/trips.repository';
import { NotificationHelperService } from './modules/notifications/notification-helper.service';
import { seedMinimalTestData } from '../test-integration/seed-helper';
import { assertConnectedToTestDb } from '../test-integration/env-guard';
import { cleanTestDatabase } from '../test-integration/test-helper';
import { OrderStatus, EscrowStatus, TransactionType } from './generated/prisma/client';
import * as bcrypt from 'bcrypt';

describe('Payments Bypass Removal & Wallet Payment Integration Tests', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let paymentsService: PaymentsService;
  let ordersService: OrdersService;

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
        PaymentsService,
        PaymentsRepository,
        OrdersRepository,
        OrdersService,
        TripsRepository,
        {
          provide: NotificationHelperService,
          useValue: {
            notifyOrderPaid: jest.fn(),
            notifyPaymentSuccess: jest.fn(),
            notifyOrderCancelled: jest.fn(),
            notifyOrderCreated: jest.fn(),
            notifyTripBookingRequest: jest.fn(),
          },
        },
      ],
    }).compile();

    prisma = moduleRef.get<PrismaService>(PrismaService);
    paymentsService = moduleRef.get<PaymentsService>(PaymentsService);
    ordersService = moduleRef.get<OrdersService>(OrdersService);

    await assertConnectedToTestDb(prisma);
    await cleanTestDatabase(prisma);
  }, 60000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // Helper to create a fresh pending order for testing
  async function createPendingOrder(seedData: any, customPrice = 158000) {
    const timestamp = Date.now() + Math.floor(Math.random() * 10000);
    return prisma.order.create({
      data: {
        tripId: seedData.trip.id,
        customerId: seedData.customer.id,
        type: 'passenger',
        seatsBooked: 1,
        totalPrice: customPrice,
        adminFeePercentage: 10,
        qrCodeTicket: `TKT-TEST-${timestamp}`,
        status: OrderStatus.pending_payment,
        escrowStatus: EscrowStatus.pending,
      },
    });
  }

  // =========================================================================
  // TAHAP 2 - BYPASS REMOVAL TESTS
  // =========================================================================

  describe('Bypass Removal Tests', () => {
    it('a. checkout with MANUAL_SIMULATION or invalid gateway should be rejected with 400', async () => {
      const seedData = await seedMinimalTestData(prisma);
      const pendingOrder = await createPendingOrder(seedData);

      // Set user PIN
      await prisma.user.update({
        where: { id: seedData.customer.id },
        data: { pinHash: await bcrypt.hash('123456', 10) },
      });

      // Try MANUAL_SIMULATION
      await expect(
        paymentsService.checkoutPayment(seedData.customer.id.toString(), {
          orderId: pendingOrder.id.toString(),
          paymentGateway: 'MANUAL_SIMULATION',
          pin: '123456',
        }),
      ).rejects.toThrow('Metode pembayaran tidak valid.');

      // Try random unknown gateway
      await expect(
        paymentsService.checkoutPayment(seedData.customer.id.toString(), {
          orderId: pendingOrder.id.toString(),
          paymentGateway: 'UNKNOWN_GATEWAY',
          pin: '123456',
        }),
      ).rejects.toThrow('Metode pembayaran tidak valid.');

      // Assert order is still pending_payment
      const orderAfter = await prisma.order.findUnique({
        where: { id: pendingOrder.id },
      });
      expect(orderAfter?.status).toBe(OrderStatus.pending_payment);

      // Assert no payment record created
      const payments = await prisma.payment.findMany({
        where: { orderId: pendingOrder.id },
      });
      expect(payments.length).toBe(0);
    });

    it('b. createXenditInvoice without XENDIT_SECRET_KEY should throw configuration error without changing order', async () => {
      const seedData = await seedMinimalTestData(prisma);
      const pendingOrder = await createPendingOrder(seedData);

      const originalKey = process.env.XENDIT_SECRET_KEY;
      delete process.env.XENDIT_SECRET_KEY;

      try {
        await expect(
          paymentsService.createXenditInvoice(
            seedData.customer.id.toString(),
            pendingOrder.id.toString(),
          ),
        ).rejects.toThrow('Konfigurasi XENDIT_SECRET_KEY belum diatur di server.');

        const orderAfter = await prisma.order.findUnique({
          where: { id: pendingOrder.id },
        });
        expect(orderAfter?.status).toBe(OrderStatus.pending_payment);
      } finally {
        process.env.XENDIT_SECRET_KEY = originalKey;
      }
    });

    it('c. Webhook without token or wrong token should be rejected with 401 and leave order unchanged', async () => {
      const seedData = await seedMinimalTestData(prisma);
      const pendingOrder = await createPendingOrder(seedData);

      process.env.XENDIT_CALLBACK_TOKEN = 'secret_callback_token_123';

      // 1. Wrong token
      await expect(
        paymentsService.handleXenditWebhook('wrong_token', {
          status: 'PAID',
          external_id: `ORDER-${pendingOrder.id.toString()}`,
          payment_method: 'QRIS',
          id: 'xnd_test_inv_1',
        }),
      ).rejects.toThrow('Token verifikasi callback tidak valid.');

      // 2. Empty token
      await expect(
        paymentsService.handleXenditWebhook('', {
          status: 'PAID',
          external_id: `ORDER-${pendingOrder.id.toString()}`,
          payment_method: 'QRIS',
          id: 'xnd_test_inv_2',
        }),
      ).rejects.toThrow('Token verifikasi callback tidak valid.');

      const orderAfter = await prisma.order.findUnique({
        where: { id: pendingOrder.id },
      });
      expect(orderAfter?.status).toBe(OrderStatus.pending_payment);
    });

    it('d. Webhook with correct token should set order to paid with escrow, admin fee, and OrderQrSession', async () => {
      const seedData = await seedMinimalTestData(prisma);
      const pendingOrder = await createPendingOrder(seedData);

      process.env.XENDIT_CALLBACK_TOKEN = 'secret_callback_token_123';

      // Pre-create pending Payment record as createXenditInvoice does
      await prisma.payment.create({
        data: {
          orderId: pendingOrder.id,
          paymentGateway: 'XENDIT',
          transactionId: 'xnd_valid_inv_100',
          amount: pendingOrder.totalPrice,
          status: 'pending',
        },
      });

      const result = await paymentsService.handleXenditWebhook('secret_callback_token_123', {
        status: 'PAID',
        external_id: `ORDER-${pendingOrder.id.toString()}`,
        payment_method: 'QRIS',
        id: 'xnd_valid_inv_100',
      });

      expect(result.success).toBe(true);

      const orderAfter = await prisma.order.findUnique({
        where: { id: pendingOrder.id },
      });
      expect(orderAfter?.status).toBe(OrderStatus.paid);
      expect(orderAfter?.escrowStatus).toBe(EscrowStatus.held);

      // Verify OrderQrSession created
      const qrSession = await prisma.orderQrSession.findFirst({
        where: { orderId: pendingOrder.id, scanPhase: 'checkin_origin' },
      });
      expect(qrSession).toBeDefined();
      expect(qrSession?.isUsed).toBe(false);
    });
  });

  // =========================================================================
  // TAHAP 4 - WALLET PAYMENT TESTS
  // =========================================================================

  describe('Wallet Payment Tests', () => {
    it('a. Bayar saldo berhasil: saldo berkurang tepat, walletTransaction tercatat, order lunas dengan efek sama', async () => {
      const seedData = await seedMinimalTestData(prisma);
      const pendingOrder = await createPendingOrder(seedData, 100000);

      // Setup customer wallet with 200,000 balance & PIN
      await prisma.user.update({
        where: { id: seedData.customer.id },
        data: { pinHash: await bcrypt.hash('123456', 10) },
      });
      await prisma.wallet.update({
        where: { userId: seedData.customer.id },
        data: { balance: 200000 },
      });

      const customerWalletBefore = await prisma.wallet.findUnique({
        where: { userId: seedData.customer.id },
      });
      const mitraWalletBefore = await prisma.wallet.findUnique({
        where: { userId: seedData.mitra.id },
      });
      const adminWalletBefore = await prisma.wallet.findUnique({
        where: { userId: seedData.admin.id },
      });

      const res = await paymentsService.checkoutPayment(seedData.customer.id.toString(), {
        orderId: pendingOrder.id.toString(),
        paymentGateway: 'WALLET',
        pin: '123456',
      });

      expect(res.payment.status).toBe('success');

      // 1. Customer balance reduced by exactly 100,000 (200,000 -> 100,000)
      const customerWalletAfter = await prisma.wallet.findUnique({
        where: { userId: seedData.customer.id },
      });
      expect(Number(customerWalletAfter?.balance)).toBe(
        Number(customerWalletBefore?.balance) - 100000,
      );

      // 2. Customer walletTransaction created with type 'payment'
      const customerTrx = await prisma.walletTransaction.findFirst({
        where: {
          walletId: customerWalletAfter!.id,
          orderId: pendingOrder.id,
          type: TransactionType.payment,
        },
      });
      expect(customerTrx).toBeDefined();
      expect(Number(customerTrx?.amount)).toBe(100000);
      expect(customerTrx?.description).toContain(`Pembayaran Tiket #${pendingOrder.id}`);

      // 3. Order is paid & escrow held
      const orderAfter = await prisma.order.findUnique({
        where: { id: pendingOrder.id },
      });
      expect(orderAfter?.status).toBe(OrderStatus.paid);
      expect(orderAfter?.escrowStatus).toBe(EscrowStatus.held);

      // 4. Mitra heldEscrowBalance increased by netMitraAmount (90,000)
      const mitraWalletAfter = await prisma.wallet.findUnique({
        where: { userId: seedData.mitra.id },
      });
      expect(Number(mitraWalletAfter?.heldEscrowBalance)).toBe(
        Number(mitraWalletBefore?.heldEscrowBalance) + 90000,
      );

      // 5. Admin balance increased by admin fee (10,000)
      const adminWalletAfter = await prisma.wallet.findUnique({
        where: { userId: seedData.admin.id },
      });
      expect(Number(adminWalletAfter?.balance)).toBe(
        Number(adminWalletBefore?.balance) + 10000,
      );

      // 6. OrderQrSession created
      const qrSession = await prisma.orderQrSession.findFirst({
        where: { orderId: pendingOrder.id, scanPhase: 'checkin_origin' },
      });
      expect(qrSession).toBeDefined();
    });

    it('b. Saldo kurang: ditolak, tidak ada perubahan data', async () => {
      const seedData = await seedMinimalTestData(prisma);
      const pendingOrder = await createPendingOrder(seedData, 100000);

      // Set customer balance to 50,000 (less than 100,000)
      await prisma.user.update({
        where: { id: seedData.customer.id },
        data: { pinHash: await bcrypt.hash('123456', 10) },
      });
      await prisma.wallet.update({
        where: { userId: seedData.customer.id },
        data: { balance: 50000 },
      });

      const walletBefore = await prisma.wallet.findUnique({
        where: { userId: seedData.customer.id },
      });
      const orderBefore = await prisma.order.findUnique({
        where: { id: pendingOrder.id },
      });

      await expect(
        paymentsService.checkoutPayment(seedData.customer.id.toString(), {
          orderId: pendingOrder.id.toString(),
          paymentGateway: 'WALLET',
          pin: '123456',
        }),
      ).rejects.toThrow('Saldo dompet tidak mencukupi untuk melakukan pembayaran.');

      // Assert nothing changed
      const walletAfter = await prisma.wallet.findUnique({
        where: { userId: seedData.customer.id },
      });
      const orderAfter = await prisma.order.findUnique({
        where: { id: pendingOrder.id },
      });
      const txCount = await prisma.walletTransaction.count({
        where: { orderId: pendingOrder.id },
      });

      expect(Number(walletAfter?.balance)).toBe(Number(walletBefore?.balance));
      expect(orderAfter?.status).toBe(orderBefore?.status);
      expect(txCount).toBe(0);
    });

    it('c. PIN salah: ditolak, tidak ada perubahan data', async () => {
      const seedData = await seedMinimalTestData(prisma);
      const pendingOrder = await createPendingOrder(seedData, 100000);

      await prisma.user.update({
        where: { id: seedData.customer.id },
        data: { pinHash: await bcrypt.hash('123456', 10) },
      });
      await prisma.wallet.update({
        where: { userId: seedData.customer.id },
        data: { balance: 200000 },
      });

      await expect(
        paymentsService.checkoutPayment(seedData.customer.id.toString(), {
          orderId: pendingOrder.id.toString(),
          paymentGateway: 'WALLET',
          pin: '999999', // Wrong PIN
        }),
      ).rejects.toThrow('PIN transaksi yang Anda masukkan salah.');

      const orderAfter = await prisma.order.findUnique({
        where: { id: pendingOrder.id },
      });
      expect(orderAfter?.status).toBe(OrderStatus.pending_payment);

      const walletAfter = await prisma.wallet.findUnique({
        where: { userId: seedData.customer.id },
      });
      expect(Number(walletAfter?.balance)).toBe(200000);
    });

    it('d. Pembayaran ganda pada order yang sama: hanya satu yang berhasil, saldo hanya terdebit sekali', async () => {
      const seedData = await seedMinimalTestData(prisma);
      const pendingOrder = await createPendingOrder(seedData, 100000);

      await prisma.user.update({
        where: { id: seedData.customer.id },
        data: { pinHash: await bcrypt.hash('123456', 10) },
      });
      await prisma.wallet.update({
        where: { userId: seedData.customer.id },
        data: { balance: 300000 },
      });

      // Call checkoutPayment twice concurrently on same order
      const results = await Promise.allSettled([
        paymentsService.checkoutPayment(seedData.customer.id.toString(), {
          orderId: pendingOrder.id.toString(),
          paymentGateway: 'WALLET',
          pin: '123456',
        }),
        paymentsService.checkoutPayment(seedData.customer.id.toString(), {
          orderId: pendingOrder.id.toString(),
          paymentGateway: 'WALLET',
          pin: '123456',
        }),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);

      // Verify wallet only debited ONCE (300,000 -> 200,000)
      const walletAfter = await prisma.wallet.findUnique({
        where: { userId: seedData.customer.id },
      });
      expect(Number(walletAfter?.balance)).toBe(200000);

      // Only one payment transaction
      const paymentTxs = await prisma.walletTransaction.findMany({
        where: { orderId: pendingOrder.id, type: TransactionType.payment },
      });
      expect(paymentTxs.length).toBe(1);
    });

    it('e. Dua order berbeda dibayar bersamaan dengan saldo yang hanya cukup untuk satu: hanya satu berhasil, saldo tidak negatif', async () => {
      const seedData = await seedMinimalTestData(prisma);
      const orderA = await createPendingOrder(seedData, 150000);
      const orderB = await createPendingOrder(seedData, 150000);

      await prisma.user.update({
        where: { id: seedData.customer.id },
        data: { pinHash: await bcrypt.hash('123456', 10) },
      });
      // Saldo 200,000: cukup untuk 1 order (150,000), tapi TIDAK cukup untuk 2 order (300,000)
      await prisma.wallet.update({
        where: { userId: seedData.customer.id },
        data: { balance: 200000 },
      });

      const results = await Promise.allSettled([
        paymentsService.checkoutPayment(seedData.customer.id.toString(), {
          orderId: orderA.id.toString(),
          paymentGateway: 'WALLET',
          pin: '123456',
        }),
        paymentsService.checkoutPayment(seedData.customer.id.toString(), {
          orderId: orderB.id.toString(),
          paymentGateway: 'WALLET',
          pin: '123456',
        }),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);

      // Saldo harus tepat 50,000 (200,000 - 150,000) dan TIDAK NEGATIF
      const walletAfter = await prisma.wallet.findUnique({
        where: { userId: seedData.customer.id },
      });
      expect(Number(walletAfter?.balance)).toBe(50000);
      expect(Number(walletAfter?.balance)).toBeGreaterThanOrEqual(0);
    });

    it('f. Order dibayar saldo lalu dibatalkan: saldo kembali penuh, walletTransaction credit tercatat', async () => {
      const seedData = await seedMinimalTestData(prisma);
      const pendingOrder = await createPendingOrder(seedData, 100000);

      await prisma.user.update({
        where: { id: seedData.customer.id },
        data: { pinHash: await bcrypt.hash('123456', 10) },
      });
      await prisma.wallet.update({
        where: { userId: seedData.customer.id },
        data: { balance: 200000 },
      });

      // 1. Pay with wallet
      await paymentsService.checkoutPayment(seedData.customer.id.toString(), {
        orderId: pendingOrder.id.toString(),
        paymentGateway: 'WALLET',
        pin: '123456',
      });

      // Balance now 100,000
      let wallet = await prisma.wallet.findUnique({
        where: { userId: seedData.customer.id },
      });
      expect(Number(wallet?.balance)).toBe(100000);

      // 2. Cancel order
      await ordersService.cancelOrder(seedData.admin, pendingOrder.id.toString());

      // 3. Balance restored to full 200,000
      wallet = await prisma.wallet.findUnique({
        where: { userId: seedData.customer.id },
      });
      expect(Number(wallet?.balance)).toBe(200000);

      // 4. Refund transaction recorded
      const refundTx = await prisma.walletTransaction.findFirst({
        where: {
          walletId: wallet!.id,
          orderId: pendingOrder.id,
          type: TransactionType.credit,
        },
      });
      expect(refundTx).toBeDefined();
      expect(Number(refundTx?.amount)).toBe(100000);
      expect(refundTx?.description).toContain(`Refund Order Dibatalkan #${pendingOrder.id}`);
    });
  });
});

