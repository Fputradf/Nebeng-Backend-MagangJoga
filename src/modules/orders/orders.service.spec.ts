import { Test, TestingModule } from '@nestjs/testing';
import { OrdersService } from './orders.service';
import { TripsRepository } from '../trips/repository/trips.repository';
import { OrdersRepository } from './repository/orders.repository';
import { PrismaService } from '../../prisma/prisma.service';
import { BadRequestException } from '@nestjs/common';
import { NotificationHelperService } from '../notifications/notification-helper.service';

describe('OrdersService (createOrder)', () => {
  let service: OrdersService;
  let tripsRepository: any;
  let ordersRepository: any;

  const mockPrisma = {
    order: { findFirst: jest.fn() },
    pricingSetting: { findFirst: jest.fn() },
    region: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
  };

  const FUTURE_DATE = '2027-01-01';
  const FUTURE_DATETIME = '2027-01-01T08:00:00.000Z';

  const mockTripMotor = {
    id: '1',
    mitraId: '2',
    vehicleType: 'motor',
    seatAvailable: 1,
    remainingWeightCapacityKg: 50,
    status: 'scheduled',
    departureDate: FUTURE_DATE,
    departureTime: FUTURE_DATETIME,
    originPoint: { regionId: '1' },
  };

  const mockTripMobil = {
    ...mockTripMotor,
    vehicleType: 'mobil',
    seatAvailable: 4,
    serviceType: 'mobil',
  };

  const mockTripBarang = {
    ...mockTripMotor,
    vehicleType: 'mobil',
    serviceType: 'barang',
    seatAvailable: 0,
    maxWeightCapacityKg: 500,
  };

  beforeEach(async () => {
    tripsRepository = {
      findById: jest.fn(),
    };
    ordersRepository = {
      findById: jest.fn(),
      createOrderWithTransaction: jest.fn(),
      findByTicketQr: jest.fn(),
    };
    const mockNotificationHelper = {
      notifyOrderCreated: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: TripsRepository, useValue: tripsRepository },
        { provide: OrdersRepository, useValue: ordersRepository },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificationHelperService, useValue: mockNotificationHelper },
      ],
    }).compile();

    service = module.get(OrdersService);
    ordersRepository.findByTicketQr.mockResolvedValue(null);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('throws BadRequestException when a motor vehicle is booked more than 1 seat', async () => {
    tripsRepository.findById.mockResolvedValue(mockTripMotor);
    mockPrisma.pricingSetting.findFirst.mockResolvedValue({
      adminFeePercentage: 10,
      baseFare: 5000,
      farePerKm: 3000,
    });
    mockPrisma.order.findFirst.mockResolvedValue(null);
    mockPrisma.region.findUnique.mockResolvedValue({ pricePerKm: 3000 });

    const dto = {
      tripId: '1',
      type: 'passenger' as any,
      seatsBooked: 2,
    };

    await expect(service.createOrder('3', dto)).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.createOrder('3', dto)).rejects.toThrow(
      'Pemesanan trip motor hanya diperbolehkan maksimal 1 kursi.',
    );
  });

  it('throws BadRequestException when the remaining seat is insufficient', async () => {
    tripsRepository.findById.mockResolvedValue({
      ...mockTripMobil,
      seatAvailable: 1,
    });
    mockPrisma.pricingSetting.findFirst.mockResolvedValue({
      adminFeePercentage: 10,
      baseFare: 5000,
      farePerKm: 3000,
    });
    mockPrisma.order.findFirst.mockResolvedValue(null);
    mockPrisma.region.findUnique.mockResolvedValue({ pricePerKm: 3000 });

    const dto = {
      tripId: '1',
      type: 'passenger' as any,
      seatsBooked: 2,
    };

    await expect(service.createOrder('3', dto)).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.createOrder('3', dto)).rejects.toThrow(
      'Sisa kursi tidak mencukupi.',
    );
  });

  it('throws BadRequestException when order.type=passenger on trip serviceType=barang', async () => {
    tripsRepository.findById.mockResolvedValue(mockTripBarang);
    mockPrisma.pricingSetting.findFirst.mockResolvedValue({
      adminFeePercentage: 10,
      baseFare: 5000,
      farePerKm: 3000,
    });
    mockPrisma.order.findFirst.mockResolvedValue(null);
    mockPrisma.region.findUnique.mockResolvedValue({ pricePerKm: 3000 });

    const dto = {
      tripId: '1',
      type: 'passenger' as any,
      seatsBooked: 1,
    };

    await expect(service.createOrder('3', dto)).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.createOrder('3', dto)).rejects.toThrow(
      'Order penumpang tidak dapat dibuat pada trip pengiriman barang.',
    );
  });

  it('throws BadRequestException when order.type=parcel on trip serviceType=motor/mobil', async () => {
    tripsRepository.findById.mockResolvedValue(mockTripMobil);
    mockPrisma.pricingSetting.findFirst.mockResolvedValue({
      adminFeePercentage: 10,
      baseFare: 5000,
      farePerKg: 2000,
    });
    mockPrisma.order.findFirst.mockResolvedValue(null);
    mockPrisma.region.findUnique.mockResolvedValue({ pricePerKm: 3000 });

    const dto = {
      tripId: '1',
      type: 'parcel' as any,
      items: [{ itemName: 'Test', itemCategory: 'Elektronik', quantity: 1, weightPerItemKg: 5, sizeEnum: 'M' as any, recipientName: 'Test', recipientPhone: '08123456789' }],
    };

    await expect(service.createOrder('3', dto)).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.createOrder('3', dto)).rejects.toThrow(
      'Order barang tidak dapat dibuat pada trip penumpang.',
    );
  });
});
