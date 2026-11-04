import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VouchersService } from './vouchers.service';
import { VouchersRepository } from './repository/vouchers.repository';
import { PrismaService } from '../../prisma/prisma.service';
import {
  DiscountType,
  OrderType,
  VoucherClaimType,
  VoucherRedemptionStatus,
} from '../../generated/prisma/enums';

describe('VouchersService', () => {
  let service: VouchersService;
  let vouchersRepository: jest.Mocked<any>;
  let prismaService: jest.Mocked<any>;
  let configService: jest.Mocked<any>;

  beforeEach(async () => {
    vouchersRepository = {
      findAllWithRedemptionCounts: jest.fn(),
      findAvailableVouchers: jest.fn(),
      findById: jest.fn(),
      findByCode: jest.fn(),
      countRedemptions: jest.fn(),
      countUserRedemptions: jest.fn(),
      hasAnyRedemptions: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateStatus: jest.fn(),
      delete: jest.fn(),
      findClaimedVoucher: jest.fn(),
      claimVoucher: jest.fn(),
    };

    prismaService = {
      voucher: {
        findUnique: jest.fn(),
      },
      voucherRedemption: {
        count: jest.fn(),
      },
      userVoucher: {
        findUnique: jest.fn(),
      },
    };

    configService = {
      get: jest.fn().mockImplementation((key, defaultVal) => defaultVal),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VouchersService,
        { provide: VouchersRepository, useValue: vouchersRepository },
        { provide: PrismaService, useValue: prismaService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<VouchersService>(VouchersService);
  });

  describe('redeemVoucher (Opsi A & Opsi B validation)', () => {
    it('harus menolak redeem jika kode voucher tidak ditemukan atau tidak aktif', async () => {
      vouchersRepository.findByCode.mockResolvedValue(null);

      await expect(service.redeemVoucher('1', 'TIDAKADA')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('harus menolak redeem jika voucher adalah tipe direct_platform (Opsi B)', async () => {
      const now = new Date();
      vouchersRepository.findByCode.mockResolvedValue({
        id: 10n,
        code: 'PLATFORM10',
        isActive: true,
        claimType: VoucherClaimType.direct_platform,
        validFrom: new Date(now.getTime() - 10000),
        validUntil: new Date(now.getTime() + 100000),
      });

      await expect(service.redeemVoucher('1', 'PLATFORM10')).rejects.toThrow(
        new BadRequestException(
          'Voucher ini sudah Anda miliki secara langsung dari platform dan hanya bisa didapatkan sekali.',
        ),
      );
    });

    it('harus menolak redeem jika user sudah pernah mengklaim voucher code_redemption yang sama (Opsi A duplikat)', async () => {
      const now = new Date();
      vouchersRepository.findByCode.mockResolvedValue({
        id: 20n,
        code: 'KODEKLAIM',
        isActive: true,
        claimType: VoucherClaimType.code_redemption,
        validFrom: new Date(now.getTime() - 10000),
        validUntil: new Date(now.getTime() + 100000),
      });
      vouchersRepository.findClaimedVoucher.mockResolvedValue({
        id: 1n,
        userId: 1n,
        voucherId: 20n,
      });

      await expect(service.redeemVoucher('1', 'KODEKLAIM')).rejects.toThrow(
        new BadRequestException(
          'Voucher ini sudah Anda miliki / sudah pernah di-redeem dan hanya bisa didapatkan sekali.',
        ),
      );
    });

    it('harus berhasil mengklaim voucher code_redemption jika belum pernah diklaim (Opsi A sukses)', async () => {
      const now = new Date();
      const mockVoucher = {
        id: 20n,
        code: 'KODEKLAIM',
        title: 'Diskon Spesial',
        description: 'Voucher Klaim',
        claimType: VoucherClaimType.code_redemption,
        isActive: true,
        discountType: DiscountType.fixed_amount,
        discountValue: 15000,
        maxDiscountAmount: null,
        minOrderAmount: 50000,
        validFrom: new Date(now.getTime() - 10000),
        validUntil: new Date(now.getTime() + 100000),
        usageLimit: 100,
      };
      vouchersRepository.findByCode.mockResolvedValue(mockVoucher);
      vouchersRepository.findClaimedVoucher.mockResolvedValue(null);
      vouchersRepository.countRedemptions.mockResolvedValue(5);
      vouchersRepository.claimVoucher.mockResolvedValue({
        id: 1n,
        userId: 1n,
        voucherId: 20n,
      });

      const res = await service.redeemVoucher('1', 'KODEKLAIM');

      expect(res.message).toContain('berhasil diklaim');
      expect(res.voucher.code).toBe('KODEKLAIM');
      expect(vouchersRepository.claimVoucher).toHaveBeenCalledWith(1n, 20n);
    });
  });

  describe('validateVoucherForOrder dengan kepemilikan voucher', () => {
    it('harus menolak voucher code_redemption jika customer belum melakukan klaim voucher', async () => {
      const now = new Date();
      prismaService.voucher.findUnique.mockResolvedValue({
        id: 50n,
        code: 'PROMO_KLAIM',
        isActive: true,
        claimType: VoucherClaimType.code_redemption,
        validFrom: new Date(now.getTime() - 10000),
        validUntil: new Date(now.getTime() + 100000),
        minOrderAmount: 0,
      });
      prismaService.userVoucher.findUnique.mockResolvedValue(null);

      await expect(
        service.validateVoucherForOrder(
          'PROMO_KLAIM',
          OrderType.passenger,
          50000,
          '1',
        ),
      ).rejects.toThrow(
        new BadRequestException(
          'Voucher ini memerlukan klaim kode terlebih dahulu. Silakan klaim voucher di menu Voucher Saya.',
        ),
      );
    });

    it('harus menerima voucher direct_platform tanpa memerlukan klaim di userVoucher', async () => {
      const now = new Date();
      prismaService.voucher.findUnique.mockResolvedValue({
        id: 60n,
        code: 'DIRECT_PLATFORM',
        isActive: true,
        claimType: VoucherClaimType.direct_platform,
        validFrom: new Date(now.getTime() - 10000),
        validUntil: new Date(now.getTime() + 100000),
        discountType: DiscountType.fixed_amount,
        discountValue: 10000,
        minOrderAmount: 0,
        usageLimit: null,
        usagePerUserLimit: 1,
      });
      prismaService.voucherRedemption.count.mockResolvedValue(0);

      const result = await service.validateVoucherForOrder(
        'DIRECT_PLATFORM',
        OrderType.passenger,
        50000,
        '1',
      );

      expect(result.discountAmount).toBe(10000);
      expect(result.totalPrice).toBe(40000);
    });
  });

  describe('deleteVoucher', () => {
    it('harus menolak hapus jika voucher tidak ditemukan', async () => {
      vouchersRepository.findById.mockResolvedValue(null);

      await expect(service.deleteVoucher('999')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('harus menolak hapus jika voucher sudah memiliki riwayat penggunaan', async () => {
      vouchersRepository.findById.mockResolvedValue({
        id: 10n,
        code: 'USED_VOUCHER',
      });
      vouchersRepository.hasAnyRedemptions.mockResolvedValue(true);

      await expect(service.deleteVoucher('10')).rejects.toThrow(
        new BadRequestException(
          'Voucher tidak dapat dihapus karena sudah memiliki riwayat penggunaan pada pesanan. Silakan nonaktifkan voucher sebagai gantinya.',
        ),
      );
    });

    it('harus berhasil menghapus voucher jika belum pernah digunakan', async () => {
      vouchersRepository.findById.mockResolvedValue({
        id: 10n,
        code: 'NEW_VOUCHER',
      });
      vouchersRepository.hasAnyRedemptions.mockResolvedValue(false);
      vouchersRepository.delete.mockResolvedValue({ id: 10n });

      const res = await service.deleteVoucher('10');

      expect(res.message).toBe("Voucher 'NEW_VOUCHER' berhasil dihapus.");
      expect(vouchersRepository.delete).toHaveBeenCalledWith(10n);
    });
  });
});
