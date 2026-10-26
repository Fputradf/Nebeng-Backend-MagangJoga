import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from './prisma/prisma.service';
import { TripsService } from './modules/trips/trips.service';
import { TripsRepository } from './modules/trips/repository/trips.repository';
import { VehiclesRepository } from './modules/vehicles/repository/vehicles.repository';
import { NotificationHelperService } from './modules/notifications/notification-helper.service';
import { SanctionService } from './modules/admin/sanction.service';
import { assertConnectedToTestDb } from '../test-integration/env-guard';
import { cleanTestDatabase } from '../test-integration/test-helper';
import { seedMinimalTestData } from '../test-integration/seed-helper';
import * as bcrypt from 'bcrypt';

describe('V3 - CancelByMitra Normal Scenario', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let tripsService: TripsService;

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
        {
          provide: NotificationHelperService,
          useValue: {
            notifyTripCancelledByMitra: jest.fn(),
            notifyMitraCancellationSanction: jest.fn(),
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
    tripsService = moduleRef.get<TripsService>(TripsService);

    // Verify connection to test database
    await assertConnectedToTestDb(prisma);

    // Clean database before seeding
    await cleanTestDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('should cancelByMitra normally and refund correctly', async () => {
    // Seed minimal test data
    const seedData = await seedMinimalTestData(prisma);

    console.log('Seed data:', {
      orderTotalPrice: seedData.orderTotalPrice,
      escrowAmount: seedData.escrowAmount,
      adminFeeAmount: seedData.adminFeeAmount,
      netMitraAmount: seedData.netMitraAmount,
      adminId: seedData.admin.id,
      adminWalletId: seedData.adminWallet.id,
    });

    // Get initial balances
    const customerWalletBefore = await prisma.wallet.findUnique({
      where: { userId: seedData.customer.id },
    });
    const mitraWalletBefore = await prisma.wallet.findUnique({
      where: { userId: seedData.mitra.id },
    });
    const adminWalletBefore = await prisma.wallet.findUnique({
      where: { userId: seedData.admin.id },
    });

    console.log('Balances before cancel:', {
      customer: customerWalletBefore?.balance,
      mitraBalance: mitraWalletBefore?.balance,
      mitraEscrow: mitraWalletBefore?.heldEscrowBalance,
      admin: adminWalletBefore?.balance,
    });

    // Money conservation invariant before cancel
    const totalMoneyBefore = Number(customerWalletBefore?.balance) + Number(mitraWalletBefore?.balance) + Number(mitraWalletBefore?.heldEscrowBalance) + Number(adminWalletBefore?.balance);
    console.log('Total money before cancel:', totalMoneyBefore);

    // Count transactions before
    const transactionsBefore = await prisma.walletTransaction.findMany({
      where: { orderId: seedData.order.id },
    });
    console.log('Transactions before cancel:', transactionsBefore.length);

    // Cancel trip by mitra
    const result = await tripsService.cancelByMitra(
      seedData.trip.id.toString(),
      seedData.mitra.id.toString(),
      { reason: 'Test cancellation' },
    );

    console.log('Cancel result:', result);

    // Get updated balances
    const customerWalletAfter = await prisma.wallet.findUnique({
      where: { userId: seedData.customer.id },
    });
    const mitraWalletAfter = await prisma.wallet.findUnique({
      where: { userId: seedData.mitra.id },
    });
    const adminWalletAfter = await prisma.wallet.findUnique({
      where: { userId: seedData.admin.id },
    });

    console.log('Balances after cancel:', {
      customer: customerWalletAfter?.balance,
      mitraBalance: mitraWalletAfter?.balance,
      mitraEscrow: mitraWalletAfter?.heldEscrowBalance,
      admin: adminWalletAfter?.balance,
    });

    // Money conservation invariant after cancel
    const totalMoneyAfter = Number(customerWalletAfter?.balance) + Number(mitraWalletAfter?.balance) + Number(mitraWalletAfter?.heldEscrowBalance) + Number(adminWalletAfter?.balance);
    console.log('Total money after cancel:', totalMoneyAfter);

    // Money conservation invariant: total money before = total money after
    expect(totalMoneyBefore).toBe(totalMoneyAfter);

    // Count transactions after
    const transactionsAfter = await prisma.walletTransaction.findMany({
      where: { orderId: seedData.order.id },
    });
    console.log('Transactions after cancel:', transactionsAfter.length);

    // Assertions with literal values from seed
    const expectedCustomerBalance = Number(customerWalletBefore?.balance) + seedData.orderTotalPrice;
    const expectedMitraEscrow = Number(mitraWalletBefore?.heldEscrowBalance) - seedData.netMitraAmount;
    const expectedAdminBalance = Number(adminWalletBefore?.balance) - seedData.adminFeeAmount;

    console.log('Expected balances:', {
      customer: expectedCustomerBalance,
      mitraEscrow: expectedMitraEscrow,
      admin: expectedAdminBalance,
    });

    expect(Number(customerWalletAfter?.balance)).toBe(expectedCustomerBalance);
    expect(Number(mitraWalletAfter?.heldEscrowBalance)).toBe(expectedMitraEscrow);
    expect(Number(adminWalletAfter?.balance)).toBe(expectedAdminBalance);

    // Verify order status
    const updatedOrder = await prisma.order.findUnique({
      where: { id: seedData.order.id },
    });
    expect(updatedOrder?.status).toBe('cancelled_by_mitra');
    expect(updatedOrder?.escrowStatus).toBe('refunded');

    // Verify trip status
    const updatedTrip = await prisma.trip.findUnique({
      where: { id: seedData.trip.id },
    });
    expect(updatedTrip?.status).toBe('cancelled_by_mitra');

    // Verify transaction types
    const creditTx = transactionsAfter.filter((t) => t.type === 'credit');
    const debitTx = transactionsAfter.filter((t) => t.type === 'debit');
    const escrowHoldTx = transactionsAfter.filter((t) => t.type === 'escrow_hold');

    console.log('Transaction types:', {
      credit: creditTx.length,
      debit: debitTx.length,
      escrowHold: escrowHoldTx.length,
    });

    expect(creditTx.length).toBe(1); // Customer refund
    expect(debitTx.length).toBe(2); // Mitra escrow debit + admin fee debit
    expect(escrowHoldTx.length).toBe(1); // Original escrow hold
  });

  it('should fail when admin wallet is missing', async () => {
    // Seed minimal test data first (creates admin with wallet)
    const seedData = await seedMinimalTestData(prisma);

    // Get the admin created by seed and delete its wallet
    const adminWallet = await prisma.wallet.findUnique({
      where: { userId: seedData.admin.id },
    });
    if (adminWallet) {
      await prisma.wallet.delete({ where: { id: adminWallet.id } });
    }

    // Set environment variable to force service to use this admin (which now has no wallet)
    const originalEnv = process.env.SYSTEM_ADMIN_USER_ID;
    process.env.SYSTEM_ADMIN_USER_ID = seedData.admin.id.toString();

    try {
      // Get initial balances
      const customerWalletBefore = await prisma.wallet.findUnique({
        where: { userId: seedData.customer.id },
      });
      const mitraWalletBefore = await prisma.wallet.findUnique({
        where: { userId: seedData.mitra.id },
      });

      // Get initial order and trip status
      const orderBefore = await prisma.order.findUnique({
        where: { id: seedData.order.id },
      });
      const tripBefore = await prisma.trip.findUnique({
        where: { id: seedData.trip.id },
      });

      // Count transactions before
      const transactionsBefore = await prisma.walletTransaction.findMany({
        where: { orderId: seedData.order.id },
      });

      // Attempt to cancel - should throw error
      await expect(
        tripsService.cancelByMitra(
          seedData.trip.id.toString(),
          seedData.mitra.id.toString(),
          { reason: 'Test cancellation' },
        ),
      ).rejects.toThrow();

      // Verify nothing changed
      const customerWalletAfter = await prisma.wallet.findUnique({
        where: { userId: seedData.customer.id },
      });
      const mitraWalletAfter = await prisma.wallet.findUnique({
        where: { userId: seedData.mitra.id },
      });
      const orderAfter = await prisma.order.findUnique({
        where: { id: seedData.order.id },
      });
      const tripAfter = await prisma.trip.findUnique({
        where: { id: seedData.trip.id },
      });

      expect(Number(customerWalletAfter?.balance)).toBe(Number(customerWalletBefore?.balance));
      expect(Number(mitraWalletAfter?.heldEscrowBalance)).toBe(Number(mitraWalletBefore?.heldEscrowBalance));
      expect(orderAfter?.status).toBe(orderBefore?.status);
      expect(orderAfter?.escrowStatus).toBe(orderBefore?.escrowStatus);
      expect(tripAfter?.status).toBe(tripBefore?.status);

      // Verify no new transactions were created (rollback)
      const transactionsAfter = await prisma.walletTransaction.findMany({
        where: { orderId: seedData.order.id },
      });
      expect(transactionsAfter.length).toBe(transactionsBefore.length);
    } finally {
      // Restore original env
      process.env.SYSTEM_ADMIN_USER_ID = originalEnv;
    }
  });

  it('should fail when admin user is missing', async () => {
    // Seed minimal test data
    const seedData = await seedMinimalTestData(prisma);

    // Set environment variable to non-existent admin ID
    const originalEnv = process.env.SYSTEM_ADMIN_USER_ID;
    process.env.SYSTEM_ADMIN_USER_ID = '999999';

    try {
      // Get initial balances
      const customerWalletBefore = await prisma.wallet.findUnique({
        where: { userId: seedData.customer.id },
      });
      const mitraWalletBefore = await prisma.wallet.findUnique({
        where: { userId: seedData.mitra.id },
      });

      // Get initial order and trip status
      const orderBefore = await prisma.order.findUnique({
        where: { id: seedData.order.id },
      });
      const tripBefore = await prisma.trip.findUnique({
        where: { id: seedData.trip.id },
      });

      // Count transactions before
      const transactionsBefore = await prisma.walletTransaction.findMany({
        where: { orderId: seedData.order.id },
      });

      // Attempt to cancel - should throw error
      await expect(
        tripsService.cancelByMitra(
          seedData.trip.id.toString(),
          seedData.mitra.id.toString(),
          { reason: 'Test cancellation' },
        ),
      ).rejects.toThrow();

      // Verify nothing changed
      const customerWalletAfter = await prisma.wallet.findUnique({
        where: { userId: seedData.customer.id },
      });
      const mitraWalletAfter = await prisma.wallet.findUnique({
        where: { userId: seedData.mitra.id },
      });
      const orderAfter = await prisma.order.findUnique({
        where: { id: seedData.order.id },
      });
      const tripAfter = await prisma.trip.findUnique({
        where: { id: seedData.trip.id },
      });

      expect(Number(customerWalletAfter?.balance)).toBe(Number(customerWalletBefore?.balance));
      expect(Number(mitraWalletAfter?.heldEscrowBalance)).toBe(Number(mitraWalletBefore?.heldEscrowBalance));
      expect(orderAfter?.status).toBe(orderBefore?.status);
      expect(orderAfter?.escrowStatus).toBe(orderBefore?.escrowStatus);
      expect(tripAfter?.status).toBe(tripBefore?.status);

      // Verify no new transactions were created (rollback)
      const transactionsAfter = await prisma.walletTransaction.findMany({
        where: { orderId: seedData.order.id },
      });
      expect(transactionsAfter.length).toBe(transactionsBefore.length);
    } finally {
      // Restore original env
      process.env.SYSTEM_ADMIN_USER_ID = originalEnv;
    }
  });
});
