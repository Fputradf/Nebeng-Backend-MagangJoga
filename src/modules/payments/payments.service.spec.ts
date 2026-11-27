import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { PaymentsService } from './payments.service';
import { OrdersRepository } from '../orders/repository/orders.repository';
import { PaymentsRepository } from './repository/payments.repository';
import { PrismaService } from '../../prisma/prisma.service';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { NotificationHelperService } from '../notifications/notification-helper.service';

describe('PaymentsService (checkoutPayment)', () => {
  let service: PaymentsService;
  let ordersRepository: any;
  let paymentsRepository: any;
  let mockPrisma: any;

  mockPrisma = {
    user: { findUnique: jest.fn() },
    pricingSetting: { findFirst: jest.fn() },
    payment: { create: jest.fn() },
    wallet: { findUnique: jest.fn() },
  };

  const mockUser = {
    id: '1',
    pinHash: bcrypt.hashSync('correct-pin', 10),
  };

  const mockOrder = {
    id: '1',
    customerId: '1',
    trip: {
      mitraId: '2',
      vehicleType: 'mobil',
    },
    status: 'pending_payment',
    totalPrice: 50000,
    adminFeePercentage: 10,
  };

  const mockPaymentResult = {
    payment: {
      id: '10',
      transactionId: 'TRX-DUMMY',
      amount: 50000,
      adminFeeAmount: 5000,
      netMitraAmount: 45000,
      status: 'success',
    },
  };

  beforeEach(async () => {
    ordersRepository = {
      findById: jest.fn(),
    };
    paymentsRepository = {
      processCheckoutTransaction: jest.fn(),
    };

    mockPrisma = {
      user: { findUnique: jest.fn() },
      pricingSetting: { findFirst: jest.fn() },
      payment: {
        create: jest.fn(),
        update: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      wallet: { findUnique: jest.fn().mockResolvedValue({ balance: 100000 }) },
      systemSetting: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 1n }),
        upsert: jest.fn().mockResolvedValue({ id: 1n }),
      },
      order: {
        findUnique: jest.fn(),
      },
    };
    const mockNotificationHelper = {
      notifyOrderPaid: jest.fn(),
      notifyPaymentSuccess: jest.fn(),
      notifyAdminsManualPaymentSubmitted: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: OrdersRepository, useValue: ordersRepository },
        { provide: PaymentsRepository, useValue: paymentsRepository },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificationHelperService, useValue: mockNotificationHelper },
      ],
    }).compile();

    service = module.get(PaymentsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('throws UnauthorizedException when the transaction PIN is wrong', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(mockUser);
    ordersRepository.findById.mockResolvedValue(mockOrder);
    mockPrisma.pricingSetting.findFirst.mockResolvedValue({
      adminFeePercentage: 10,
    });
    paymentsRepository.processCheckoutTransaction.mockResolvedValue(
      mockPaymentResult,
    );

    await expect(
      service.checkoutPayment('1', {
        orderId: '1',
        paymentGateway: 'WALLET',
        pin: 'wrong-pin',
      }),
    ).rejects.toThrow(UnauthorizedException);
    await expect(
      service.checkoutPayment('1', {
        orderId: '1',
        paymentGateway: 'WALLET',
        pin: 'wrong-pin',
      }),
    ).rejects.toThrow('PIN transaksi yang Anda masukkan salah.');
  });

  it('throws BadRequestException when the user has no transaction PIN set', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      ...mockUser,
      pinHash: null,
    });
    ordersRepository.findById.mockResolvedValue(mockOrder);
    mockPrisma.pricingSetting.findFirst.mockResolvedValue({
      adminFeePercentage: 10,
    });

    await expect(
      service.checkoutPayment('1', {
        orderId: '1',
        paymentGateway: 'WALLET',
        pin: 'anything',
      }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.checkoutPayment('1', {
        orderId: '1',
        paymentGateway: 'WALLET',
        pin: 'anything',
      }),
    ).rejects.toThrow('Anda belum mengatur PIN Transaksi.');
  });

  it('creates a checkout transaction and returns payment details when PIN is correct', async () => {
    ordersRepository.findById.mockResolvedValue(mockOrder);
    mockPrisma.user.findUnique.mockResolvedValue(mockUser);
    mockPrisma.pricingSetting.findFirst.mockResolvedValue({
      adminFeePercentage: 10,
    });
    paymentsRepository.processCheckoutTransaction.mockResolvedValue(
      mockPaymentResult,
    );

    const result = await service.checkoutPayment('1', {
      orderId: '1',
      paymentGateway: 'WALLET',
      pin: 'correct-pin',
    });

    expect(result.message).toBe(
      'Pembayaran berhasil dikonfirmasi dan dana telah ditahan oleh Escrow System.',
    );
    expect(paymentsRepository.processCheckoutTransaction).toHaveBeenCalledTimes(
      1,
    );
    expect(paymentsRepository.processCheckoutTransaction).toHaveBeenCalledWith(
      '1',
      '2',
      'WALLET',
      expect.any(String),
      50000,
      5000,
      45000,
      false,
    );
  });

  describe('Payment Config & Mutually Exclusive Mode', () => {
    it('returns default payment config with Option B (MANUAL) active', async () => {
      mockPrisma.systemSetting.findUnique.mockResolvedValue(null);
      mockPrisma.systemSetting.create.mockResolvedValue({ id: 1n });

      const config = await service.getPaymentConfig(false);
      expect(config.activeMode).toBe('MANUAL');
      expect(config.manual.bankName).toBeDefined();
      expect(config.manual.qrisPayload).toBeDefined();
    });

    it('blocks createXenditInvoice when Option B (MANUAL) is active', async () => {
      mockPrisma.order.findUnique.mockResolvedValue({
        id: 1n,
        customerId: 1n,
        status: 'pending_payment',
        totalPrice: 50000,
        customer: { email: 'user@test.com' },
        trip: {},
      });
      mockPrisma.systemSetting.findUnique.mockResolvedValue(null);

      await expect(service.createXenditInvoice('1', '1')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.createXenditInvoice('1', '1')).rejects.toThrow(
        /dinonaktifkan oleh administrator/,
      );
    });

    it('submits manual payment successfully with pending status', async () => {
      mockPrisma.order.findUnique.mockResolvedValue({
        id: 1n,
        customerId: 1n,
        status: 'pending_payment',
        totalPrice: 50000,
        customer: { email: 'user@test.com' },
        trip: {},
      });
      mockPrisma.payment.findFirst.mockResolvedValue(null);
      mockPrisma.payment.create.mockResolvedValue({
        id: 10n,
        status: 'pending',
      });
      mockPrisma.systemSetting.findUnique.mockResolvedValue(null);

      const res = await service.submitManualPayment('1', {
        orderId: '1',
        proofUrl: 'data:image/png;base64,sample',
        senderName: 'Test Sender',
        bankName: 'BCA Manual',
      });

      expect(res.success).toBe(true);
      expect(res.status).toBe('PENDING_VERIFICATION');
    });
  });
});
