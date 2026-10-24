import { Test, TestingModule } from '@nestjs/testing';
import { OrdersService } from './orders.service';
import { TripsRepository } from '../trips/repository/trips.repository';
import { OrdersRepository } from './repository/orders.repository';
import { PrismaService } from '../../prisma/prisma.service';
import { BadRequestException } from '@nestjs/common';

describe('OrdersService (createOrder)', () => {
  let service: OrdersService;
  let tripsRepository: any;
  let ordersRepository: any;

  const mockPrisma = {
    order: { findFirst: jest.fn() },
    pricingSetting: { findFirst: jest.fn() },
    region: { findUnique: jest.fn() },
  };

  const mockTripMotor = {
    id: '1',
    mitraId: '1',
    vehicleType: 'motor',
    seatAvailable: 1,
    remainingWeightCapacityKg: 50,
    status: 'scheduled',
    departureDate: '2026-10-21',
    departureTime: '2026-10-21T08:00:00.000Z',
    originPoint: { regionId: '1' },
  };

  const mockTripMobil = {
    ...mockTripMotor,
    vehicleType: 'mobil',
    seatAvailable: 4,
  };

  beforeEach(async () => {
    tripsRepository = {
      findById: jest.fn(),
    };
    ordersRepository = {
      findById: jest.fn(),
      createOrderWithTransaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: TripsRepository, useValue: tripsRepository },
        { provide: OrdersRepository, useValue: ordersRepository },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get(OrdersService);
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

    await expect(service.createOrder('1', dto)).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.createOrder('2', dto)).rejects.toThrow(
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

    await expect(service.createOrder('1', dto)).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.createOrder('2', dto)).rejects.toThrow(
      'Sisa kursi tidak mencukupi.',
    );
  });
});
