import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WalletsService } from './wallets.service';
import { WalletsRepository } from './repository/wallets.repository';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationHelperService } from '../notifications/notification-helper.service';

describe('WalletsService - WITHDRAW_ENABLED Flag', () => {
  let service: WalletsService;
  let configService: ConfigService;

  const mockWalletRepository = {
    findByUserId: jest.fn(),
    createWallets: jest.fn(),
    processWithdrawal: jest.fn(),
  };

  const mockPrismaService = {
    user: {
      findUnique: jest.fn().mockResolvedValue({ pinHash: null }),
    },
    userProfile: {
      findUnique: jest.fn(),
    },
    disbursementBank: {
      count: jest.fn().mockResolvedValue(0),
      findFirst: jest.fn(),
    },
  };

  const mockNotificationHelper = {
    notifyWithdrawalProcessed: jest.fn(),
    notifyTopUpSuccess: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletsService,
        {
          provide: WalletsRepository,
          useValue: mockWalletRepository,
        },
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: NotificationHelperService,
          useValue: mockNotificationHelper,
        },
      ],
    }).compile();

    service = module.get<WalletsService>(WalletsService);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('requestWithdrawal - WITHDRAW_ENABLED flag validation', () => {
    const mockUserId = '1';
    const mockAmount = 50000;
    const mockProfile = {
      bankName: 'BCA',
      bankAccountNumber: '1234567890',
      bankAccountHolder: 'Test User',
    };
    const mockWallet = {
      id: BigInt(1),
      userId: BigInt(1),
      balance: 100000,
      heldEscrowBalance: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      transactions: [],
    };

    beforeEach(() => {
      mockPrismaService.userProfile.findUnique.mockResolvedValue(mockProfile);
      mockWalletRepository.findByUserId.mockResolvedValue(mockWallet);
      mockWalletRepository.processWithdrawal.mockResolvedValue({
        wallet: { ...mockWallet, balance: 50000 },
        transaction: {},
      });
    });

    it('should throw ServiceUnavailableException (503) when WITHDRAW_ENABLED is "false"', async () => {
      (configService.get as jest.Mock).mockReturnValue('false');

      await expect(
        service.requestWithdrawal(mockUserId, mockAmount),
      ).rejects.toThrow(ServiceUnavailableException);

      await expect(
        service.requestWithdrawal(mockUserId, mockAmount),
      ).rejects.toThrow('Penarikan dana sementara dinonaktifkan.');

      // Verify that withdrawal logic is NOT called
      expect(mockWalletRepository.processWithdrawal).not.toHaveBeenCalled();
    });

    it('should throw ServiceUnavailableException (503) when WITHDRAW_ENABLED is not set (undefined)', async () => {
      (configService.get as jest.Mock).mockReturnValue(undefined);

      await expect(
        service.requestWithdrawal(mockUserId, mockAmount),
      ).rejects.toThrow(ServiceUnavailableException);

      await expect(
        service.requestWithdrawal(mockUserId, mockAmount),
      ).rejects.toThrow('Penarikan dana sementara dinonaktifkan.');

      expect(mockWalletRepository.processWithdrawal).not.toHaveBeenCalled();
    });

    it('should throw ServiceUnavailableException (503) when WITHDRAW_ENABLED is empty string', async () => {
      (configService.get as jest.Mock).mockReturnValue('');

      await expect(
        service.requestWithdrawal(mockUserId, mockAmount),
      ).rejects.toThrow(ServiceUnavailableException);

      expect(mockWalletRepository.processWithdrawal).not.toHaveBeenCalled();
    });

    it('should throw ServiceUnavailableException (503) when WITHDRAW_ENABLED is "yes" (not "true")', async () => {
      (configService.get as jest.Mock).mockReturnValue('yes');

      await expect(
        service.requestWithdrawal(mockUserId, mockAmount),
      ).rejects.toThrow(ServiceUnavailableException);

      expect(mockWalletRepository.processWithdrawal).not.toHaveBeenCalled();
    });

    it('should throw ServiceUnavailableException (503) when WITHDRAW_ENABLED is "1" (not "true")', async () => {
      (configService.get as jest.Mock).mockReturnValue('1');

      await expect(
        service.requestWithdrawal(mockUserId, mockAmount),
      ).rejects.toThrow(ServiceUnavailableException);

      expect(mockWalletRepository.processWithdrawal).not.toHaveBeenCalled();
    });

    it('should proceed to withdrawal logic when WITHDRAW_ENABLED is "true"', async () => {
      (configService.get as jest.Mock).mockReturnValue('true');

      // Mock Xendit to dummy mode (secret key includes 'dummy')
      process.env.XENDIT_SECRET_KEY = 'xnd_development_dummy';

      const result = await service.requestWithdrawal(mockUserId, mockAmount);

      expect(result).toBeDefined();
      expect(mockWalletRepository.processWithdrawal).toHaveBeenCalled();
      expect(mockWalletRepository.processWithdrawal).toHaveBeenCalledWith(
        mockWallet.id,
        mockAmount,
        expect.stringContaining('TRX ID:'),
      );
    });

    it('should throw BadRequestException when user has PIN but no PIN provided', async () => {
      (configService.get as jest.Mock).mockReturnValue('true');
      const hashedPin = '$2b$10$abcdefghijklmnopqrstuvwxyz123456';
      mockPrismaService.user.findUnique.mockResolvedValueOnce({ pinHash: hashedPin });

      await expect(
        service.requestWithdrawal(mockUserId, mockAmount),
      ).rejects.toThrow(BadRequestException);
    });

    it('should proceed when user has PIN and correct PIN is provided', async () => {
      (configService.get as jest.Mock).mockReturnValue('true');
      process.env.XENDIT_SECRET_KEY = 'xnd_development_dummy';
      const bcrypt = require('bcrypt');
      const hashedPin = await bcrypt.hash('123456', 10);
      mockPrismaService.user.findUnique.mockResolvedValueOnce({ pinHash: hashedPin });

      const result = await service.requestWithdrawal(mockUserId, mockAmount, '123456');
      expect(result).toBeDefined();
    });
  });
});
