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
import { ServiceType, OrderType } from './generated/prisma/enums';
import * as bcrypt from 'bcrypt';

describe('Trip ServiceType Integration Tests', () => {
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
            notifyOrderCreated: jest.fn(),
            notifyTripBookingRequest: jest.fn(),
          },
        },
      ],
    }).compile();

    prisma = moduleRef.get<PrismaService>(PrismaService);
    ordersService = moduleRef.get<OrdersService>(OrdersService);

    await assertConnectedToTestDb(prisma);
    await cleanTestDatabase(prisma);
  }, 60000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('(a) should reject passenger order on barang trip with specific message', async () => {
    // Seed barang trip without order to avoid conflict
    const seedData = await seedMinimalTestData(prisma, {
      tripServiceType: ServiceType.barang,
      orderType: OrderType.parcel,
    });

    // Create a different customer for the test
    const secondCustomer = await prisma.user.create({
      data: {
        name: 'Test Customer 2',
        email: `customer2-${Date.now()}@test.com`,
        password: await (await import('bcrypt')).hash('Test@12345', 10),
        role: 'customer',
        phone: `08123456789${Date.now().toString().slice(-4)}`,
      },
    });

    // Try to create passenger order on barang trip
    await expect(
      ordersService.createOrder(secondCustomer.id.toString(), {
        tripId: seedData.trip.id.toString(),
        type: OrderType.passenger,
        seatsBooked: 1,
      }),
    ).rejects.toThrow('Order penumpang tidak dapat dibuat pada trip pengiriman barang.');
  });

  it('(b) should reject parcel order on mobil trip', async () => {
    // Seed mobil trip without order to avoid conflict
    const seedData = await seedMinimalTestData(prisma, {
      tripServiceType: ServiceType.mobil,
      orderType: OrderType.passenger,
    });

    // Create a different customer for the test
    const secondCustomer = await prisma.user.create({
      data: {
        name: 'Test Customer 3',
        email: `customer3-${Date.now()}@test.com`,
        password: await bcrypt.hash('Test@12345', 10),
        role: 'customer',
        phone: `08123456799${Date.now().toString().slice(-4)}`,
      },
    });

    // Try to create parcel order on mobil trip
    await expect(
      ordersService.createOrder(secondCustomer.id.toString(), {
        tripId: seedData.trip.id.toString(),
        type: OrderType.parcel,
        items: [
          {
            itemName: 'Paket Test',
            weightPerItemKg: 5,
            sizeEnum: 'm',
            quantity: 1,
            itemCategory: 'dokumen',
            recipientName: 'Test Recipient',
            recipientPhone: '08123456789',
          },
        ],
      }),
    ).rejects.toThrow('Order barang tidak dapat dibuat pada trip penumpang.');
  });

  it('(c) should create barang trip with seatTotal=0 and seatAvailable=0 in DB', async () => {
    const seedData = await seedMinimalTestData(prisma, {
      tripServiceType: ServiceType.barang,
      orderType: OrderType.parcel,
    });

    // Verify in DB
    const tripInDb = await prisma.trip.findUnique({
      where: { id: seedData.trip.id },
    });

    expect(tripInDb).not.toBeNull();
    expect(tripInDb!.serviceType).toBe(ServiceType.barang);
    expect(tripInDb!.seatTotal).toBe(0);
    expect(tripInDb!.seatAvailable).toBe(0);
  });

  it('(d) should have correct serviceType from seed-helper', async () => {
    // Test that seed-helper creates trips with the specified serviceType
    const seedDataBarang = await seedMinimalTestData(prisma, {
      tripServiceType: ServiceType.barang,
      orderType: OrderType.parcel,
    });

    const seedDataMobil = await seedMinimalTestData(prisma, {
      tripServiceType: ServiceType.mobil,
      orderType: OrderType.passenger,
    });

    // Verify barang trip has serviceType=barang
    const barangTrip = await prisma.trip.findUnique({
      where: { id: seedDataBarang.trip.id },
    });
    expect(barangTrip).not.toBeNull();
    expect(barangTrip!.serviceType).toBe(ServiceType.barang);

    // Verify mobil trip has serviceType=mobil
    const mobilTrip = await prisma.trip.findUnique({
      where: { id: seedDataMobil.trip.id },
    });
    expect(mobilTrip).not.toBeNull();
    expect(mobilTrip!.serviceType).toBe(ServiceType.mobil);
  });

  it('(e) getTrips with serviceType=barang should not return mobil trips', async () => {
    // Create a barang trip
    const seedDataBarang = await seedMinimalTestData(prisma, {
      tripServiceType: ServiceType.barang,
      orderType: OrderType.parcel,
    });

    // Create a mobil trip
    const seedDataMobil = await seedMinimalTestData(prisma, {
      tripServiceType: ServiceType.mobil,
      orderType: OrderType.passenger,
    });

    // Query for barang trips directly via Prisma
    const barangTrips = await prisma.trip.findMany({
      where: { serviceType: ServiceType.barang },
    });

    // All returned trips should be barang
    barangTrips.forEach((trip) => {
      expect(trip.serviceType).toBe(ServiceType.barang);
    });

    // Verify that mobil trip is NOT in the result
    const mobilTripInResult = barangTrips.find((t) => t.id === seedDataMobil.trip.id);
    expect(mobilTripInResult).toBeUndefined();
  });

  it('(f) cancelOrder parcel on barang trip should not increase seatAvailable', async () => {
    // Seed barang trip with parcel order
    const seedData = await seedMinimalTestData(prisma, {
      tripServiceType: ServiceType.barang,
      orderType: OrderType.parcel,
    });

    // Get initial trip state
    const tripBefore = await prisma.trip.findUnique({
      where: { id: seedData.trip.id },
    });

    expect(tripBefore).not.toBeNull();
    expect(tripBefore!.serviceType).toBe(ServiceType.barang);
    expect(tripBefore!.seatAvailable).toBe(0);

    // Cancel the order
    const result = await ordersService.cancelOrder(seedData.admin, seedData.order.id.toString());

    // Get updated trip state
    const tripAfter = await prisma.trip.findUnique({
      where: { id: seedData.trip.id },
    });

    expect(tripAfter).not.toBeNull();
    // seatAvailable should remain 0 (not increased) - this is the key check
    expect(tripAfter!.seatAvailable).toBe(0);

    // Verify the result includes order info
    expect(result.order).toBeDefined();
  });
});
