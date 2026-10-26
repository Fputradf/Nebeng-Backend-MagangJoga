import { Test, TestingModule } from '@nestjs/testing';
import { CheckpointsService } from './checkpoints.service';
import { TrackingGateway } from '../tracking/tracking.gateway';
import { CheckpointsRepository } from './repository/checkpoints.repository';
import { PrismaService } from '../../prisma/prisma.service';
import { BadRequestException } from '@nestjs/common';
import { NotificationHelperService } from '../notifications/notification-helper.service';

describe('CheckpointsService (scanCheckpoint)', () => {
  let service: CheckpointsService;
  let checkpointsRepository: any;
  let mockPrisma: any;
  let trackingGateway: any;

  const mockTrip = {
    id: '1',
    originPointId: '1',
    destinationPointId: '2',
    qrCodeTrip: 'TRIP-ABCD',
    originPoint: {
      id: '1',
      name: 'Stasiun Solo Balapan',
      regionId: '1',
    },
    destinationPoint: {
      id: '2',
      name: 'Stasiun Tugu Yogyakarta',
      regionId: '1',
    },
  };

  const mockPassengerOrder = {
    id: '100',
    tripId: '1',
    status: 'paid',
    escrowStatus: 'held',
    type: 'passenger',
    otpClaim: null,
    qrCodeTicket: 'TKT-XYZ',
  };

  const mockParcelOrder = {
    ...mockPassengerOrder,
    type: 'parcel',
    otpClaim: '999999',
  };

  const mockCheckpointLog = {
    id: '1',
    tripId: '1',
    orderId: '100',
    posId: '999',
    scanType: 'checkin_origin',
    createdAt: new Date(),
  };

  beforeEach(async () => {
    checkpointsRepository = {
      findTripByQr: jest.fn(),
      findOrderByQr: jest.fn(),
      processCheckinOrigin: jest.fn(),
      processCheckinDestinationAndReleaseEscrow: jest.fn(),
    };

    mockPrisma = {
      pickupPoint: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
      },
      pricingSetting: {
        findFirst: jest.fn(),
      },
    };

    trackingGateway = {
      emitCheckpointScanned: jest.fn(),
    };
    const mockNotificationHelper = {
      notifyCheckpointScanned: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CheckpointsService,
        { provide: CheckpointsRepository, useValue: checkpointsRepository },
        { provide: TrackingGateway, useValue: trackingGateway },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificationHelperService, useValue: mockNotificationHelper },
      ],
    }).compile();

    service = module.get(CheckpointsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('allows origin check-in even at a different pos (flexible scanning)', async () => {
    checkpointsRepository.findTripByQr.mockResolvedValue(mockTrip);
    checkpointsRepository.findOrderByQr.mockResolvedValue(mockPassengerOrder);
    mockPrisma.pickupPoint.findFirst.mockResolvedValue(null);
    mockPrisma.pickupPoint.findUnique.mockResolvedValue({ id: '999' });
    checkpointsRepository.processCheckinOrigin.mockResolvedValue(mockCheckpointLog);

    const result = await service.scanCheckpoint(
      { id: '1' },
      {
        scanType: 'checkin_origin',
        qrCodeTrip: 'TRIP-ABCD',
        qrCodeTicket: 'TKT-1234',
        posId: '999',
      },
    );

    expect(result).toBeDefined();
    expect(result?.message).toContain('Check-in Pos Asal berhasil');
  });

  it('throws error when origin check-in is performed on an unpaid order', async () => {
    checkpointsRepository.findTripByQr.mockResolvedValue(mockTrip);
    checkpointsRepository.findOrderByQr.mockResolvedValue({
      ...mockPassengerOrder,
      status: 'pending_payment',
    });
    mockPrisma.pickupPoint.findFirst.mockResolvedValue({ id: '1' });

    await expect(
      service.scanCheckpoint(
        { id: '1' },
        {
          scanType: 'checkin_origin',
          qrCodeTrip: 'TRIP-ABCD',
          qrCodeTicket: 'TKT-1234',
          posId: '1',
        },
      ),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.scanCheckpoint(
        { id: '1' },
        {
          scanType: 'checkin_origin',
          qrCodeTrip: 'TRIP-ABCD',
          qrCodeTicket: 'TKT-1234',
          posId: '1',
        },
      ),
    ).rejects.toThrow(
      'Pesanan belum dibayar atau sudah melalui proses check-in.',
    );
  });

  it('throws error when destination check-in OTP claim is wrong', async () => {
    checkpointsRepository.findTripByQr.mockResolvedValue(mockTrip);
    checkpointsRepository.findOrderByQr.mockResolvedValue(mockParcelOrder);
    mockPrisma.pickupPoint.findFirst.mockResolvedValue({ id: '2' });

    await expect(
      service.scanCheckpoint(
        { id: '1' },
        {
          scanType: 'checkin_destination',
          qrCodeTrip: 'TRIP-ABCD',
          qrCodeTicket: 'TKT-XYZ',
          posId: '2',
          otpClaim: '123456',
        },
      ),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.scanCheckpoint(
        { id: '1' },
        {
          scanType: 'checkin_destination',
          qrCodeTrip: 'TRIP-ABCD',
          qrCodeTicket: 'TKT-XYZ',
          posId: '2',
          otpClaim: '123456',
        },
      ),
    ).rejects.toThrow('Kode OTP Klaim yang dimasukkan salah/tidak cocok.');
  });

  it('throws error when destination check-in is performed on an order without held escrow', async () => {
    checkpointsRepository.findTripByQr.mockResolvedValue(mockTrip);
    checkpointsRepository.findOrderByQr.mockResolvedValue({
      ...mockPassengerOrder,
      escrowStatus: 'pending',
    });
    mockPrisma.pickupPoint.findFirst.mockResolvedValue({ id: '2' });

    await expect(
      service.scanCheckpoint(
        { id: '1' },
        {
          scanType: 'checkin_destination',
          qrCodeTrip: 'TRIP-ABCD',
          qrCodeTicket: 'TKT-XYZ',
          posId: '2',
        },
      ),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.scanCheckpoint(
        { id: '1' },
        {
          scanType: 'checkin_destination',
          qrCodeTrip: 'TRIP-ABCD',
          qrCodeTicket: 'TKT-XYZ',
          posId: '2',
        },
      ),
    ).rejects.toThrow(
      'Dana escrow order ini sudah dicairkan atau tidak dalam status ditahan.',
    );
  });
});
