import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from './prisma/prisma.service';
import { OrdersService } from './modules/orders/orders.service';
import { OrdersRepository } from './modules/orders/repository/orders.repository';
import { TripsRepository } from './modules/trips/repository/trips.repository';
import { NotificationHelperService } from './modules/notifications/notification-helper.service';
import { seedMinimalTestData } from '../test-integration/seed-helper';
import { assertConnectedToTestDb } from '../test-integration/env-guard';
import { cleanTestDatabase } from '../test-integration/test-helper';

describe('V4d - Orders Cancel Admin Wallet Check', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
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
        OrdersService,
        OrdersRepository,
        TripsRepository,
        {
          provide: NotificationHelperService,
          useValue: {
            notifyOrderCancelled: jest.fn(),
          },
        },
      ],
    }).compile();

    prisma = moduleRef.get<PrismaService>(PrismaService);
    ordersService = moduleRef.get<OrdersService>(OrdersService);

    await assertConnectedToTestDb(prisma);
    await cleanTestDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('should fail when admin wallet is missing', async () => {
    // Seed minimal test data
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
      // Attempt to cancel order - should throw specific error about missing admin wallet
      await expect(
        ordersService.cancelOrder(seedData.admin, seedData.order.id.toString()),
      ).rejects.toThrow('Wallet admin tidak ditemukan. Hubungi administrator untuk pembuatan wallet.');
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
      // Attempt to cancel order - should throw specific error about missing admin user
      await expect(
        ordersService.cancelOrder(seedData.admin, seedData.order.id.toString()),
      ).rejects.toThrow('Admin user tidak ditemukan. Hubungi administrator untuk konfigurasi admin.');
    } finally {
      // Restore original env
      process.env.SYSTEM_ADMIN_USER_ID = originalEnv;
    }
  });
});
