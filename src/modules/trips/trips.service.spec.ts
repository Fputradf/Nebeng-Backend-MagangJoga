import { Test, TestingModule } from '@nestjs/testing';
import { TripsService } from './trips.service';
import { TripsRepository } from './repository/trips.repository';
import { VehiclesRepository } from '../vehicles/repository/vehicles.repository';
import { PrismaService } from '../../prisma/prisma.service';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationHelperService } from '../notifications/notification-helper.service';
import { SanctionService } from '../admin/sanction.service';

describe('TripsService (createTrip)', () => {
  let service: TripsService;
  let vehiclesRepository: any;
  let tripsRepository: any;

  const mockPrisma = {
    user: { findUnique: jest.fn() },
  };

  const mockApprovedUser = {
    id: '1',
    role: 'mitra',
    statusVerification: 'approved',
  };

  const mockVehicle = {
    id: '10',
    userId: '1',
    type: 'mobil',
    capacitySeats: 4,
    maxWeightCapacityKg: 500,
  };

  beforeEach(async () => {
    vehiclesRepository = {
      findUserVerificationStatus: jest.fn(),
      findById: jest.fn(),
    };
    tripsRepository = {
      findConflictingTrip: jest.fn(),
      create: jest.fn(),
    };
    const mockConfigService = {
      get: jest.fn((key: string, defaultValue?: any) => defaultValue),
    };
    const mockNotificationHelper = {
      notifyOrderPaid: jest.fn(),
      notifyPaymentSuccess: jest.fn(),
    };
    const mockSanctionService = {
      createSanction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TripsService,
        { provide: TripsRepository, useValue: tripsRepository },
        { provide: VehiclesRepository, useValue: vehiclesRepository },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: NotificationHelperService, useValue: mockNotificationHelper },
        { provide: SanctionService, useValue: mockSanctionService },
      ],
    }).compile();

    service = module.get(TripsService);

    vehiclesRepository.findUserVerificationStatus.mockResolvedValue(
      mockApprovedUser,
    );
    vehiclesRepository.findById.mockResolvedValue(mockVehicle);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('throws error when origin point equals destination point', async () => {
    await expect(
      service.createTrip('1', {
        vehicleId: '10',
        originPointId: '1',
        destinationPointId: '1',
        departureDate: '2026-10-21',
        departureTime: '08:00:00',
        price: 50000,
        serviceType: 'mobil',
      }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.createTrip('1', {
        vehicleId: '10',
        originPointId: '1',
        destinationPointId: '1',
        departureDate: '2026-10-21',
        departureTime: '08:00:00',
        price: 50000,
        serviceType: 'mobil',
      }),
    ).rejects.toThrow('Pos Asal dan Pos Tujuan tidak boleh sama.');
  });

  it('throws ForbiddenException when user verification is not approved', async () => {
    vehiclesRepository.findUserVerificationStatus.mockResolvedValue({
      id: '1',
      role: 'mitra',
      statusVerification: 'pending',
    } as any);

    await expect(
      service.createTrip('1', {
        vehicleId: '10',
        originPointId: '1',
        destinationPointId: '2',
        departureDate: '2026-10-21',
        departureTime: '08:00:00',
        price: 50000,
        serviceType: 'mobil',
      }),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      service.createTrip('1', {
        vehicleId: '10',
        originPointId: '1',
        destinationPointId: '2',
        departureDate: '2026-10-21',
        departureTime: '08:00:00',
        price: 50000,
        serviceType: 'mobil',
      }),
    ).rejects.toThrow(
      'Hanya Mitra terverifikasi (approved) yang dapat membuat jadwal trip.',
    );
  });

  it('throws BadRequestException when departure is in the past', async () => {
    vehiclesRepository.findUserVerificationStatus.mockResolvedValue(
      mockApprovedUser,
    );
    vehiclesRepository.findById.mockResolvedValue(mockVehicle);

    await expect(
      service.createTrip('1', {
        vehicleId: '10',
        originPointId: '1',
        destinationPointId: '2',
        departureDate: '2020-01-01',
        departureTime: '08:00:00',
        price: 50000,
        serviceType: 'mobil',
      }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.createTrip('1', {
        vehicleId: '10',
        originPointId: '1',
        destinationPointId: '2',
        departureDate: '2020-01-01',
        departureTime: '08:00:00',
        price: 50000,
        serviceType: 'mobil',
      }),
    ).rejects.toThrow('Waktu keberangkatan tidak boleh di masa lalu.');
  });

  it('throws ForbiddenException when the vehicle does not belong to the user', async () => {
    vehiclesRepository.findUserVerificationStatus.mockResolvedValue(
      mockApprovedUser,
    );
    vehiclesRepository.findById.mockResolvedValue({
      ...mockVehicle,
      userId: '9',
    } as any);

    await expect(
      service.createTrip('1', {
        vehicleId: '10',
        originPointId: '1',
        destinationPointId: '2',
        departureDate: '2026-10-21',
        departureTime: '08:00:00',
        price: 50000,
        serviceType: 'mobil',
      }),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      service.createTrip('1', {
        vehicleId: '10',
        originPointId: '1',
        destinationPointId: '2',
        departureDate: '2026-10-21',
        departureTime: '08:00:00',
        price: 50000,
        serviceType: 'mobil',
      }),
    ).rejects.toThrow('Kendaraan ini bukan milik Anda.');
  });
});
