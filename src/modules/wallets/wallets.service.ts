import { Injectable, BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { WalletsRepository } from './repository/wallets.repository';
import { WalletMapper } from './mappers/wallet.mapper';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class WalletsService {
  constructor(
    private readonly walletRepository: WalletsRepository,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  private safeParseBigInt(id: string): bigint | null {
    try {
      return BigInt(id);
    } catch {
      return null;
    }
  }

  async getMyWallet(userIdStr: string) {
    let wallet = await this.walletRepository.findByUserId(userIdStr);

    if (!wallet) {
      wallet = await this.walletRepository.createWallets(userIdStr);
    }

    return WalletMapper.toResponse(wallet);
  }

  async holdEscrow(mitraUserIdStr: string, orderIdStr: string, amount: number) {
    let wallet = await this.walletRepository.findByUserId(mitraUserIdStr);

    if (!wallet) {
      wallet = await this.walletRepository.createWallets(mitraUserIdStr);
    }

    return this.walletRepository.processEscrowHold(
      wallet.id,
      orderIdStr,
      amount,
    );
  }

  async releaseEscrow(
    mitraUserIdStr: string,
    orderIdStr: string,
    amount: number,
    platformFee: number = 0,
  ) {
    let wallet = await this.walletRepository.findByUserId(mitraUserIdStr);

    if (!wallet) {
      wallet = await this.walletRepository.createWallets(mitraUserIdStr);
    }

    if (Number(wallet.heldEscrowBalance) < amount) {
      throw new BadRequestException(
        'Saldo Escrow tidak mencukupi untuk dicairkan.',
      );
    }

    const updatedWallet = await this.walletRepository.processEscrowRelease(
      wallet.id,
      orderIdStr,
      amount,
      platformFee,
    );

    return WalletMapper.toResponse(updatedWallet);
  }

  async requestWithdrawal(userIdStr: string, amount: number) {
    const withdrawEnabled = this.configService.get<string>('WITHDRAW_ENABLED') === 'true';
    if (!withdrawEnabled) {
      throw new ServiceUnavailableException(
        'Penarikan dana sementara dinonaktifkan.',
      );
    }

    if (amount <= 0) {
      throw new BadRequestException(
        'Jumlah penarikan saldo harus lebih besar dari 0.',
      );
    }

    const parsedUserId = this.safeParseBigInt(userIdStr);
    if (!parsedUserId) {
      throw new BadRequestException('Format ID User tidak valid.');
    }

    const profile = await this.prisma.userProfile.findUnique({
      where: { userId: parsedUserId },
    });

    if (!profile || !profile.bankName || !profile.bankAccountNumber) {
      throw new BadRequestException(
        'Informasi rekening bank belum diisi. Silakan lengkapi profil rekening Anda terlebih dahulu.',
      );
    }

    let wallet = await this.walletRepository.findByUserId(userIdStr);
    if (!wallet) {
      wallet = await this.walletRepository.createWallets(userIdStr);
    }

    if (Number(wallet.balance) < amount) {
      throw new BadRequestException(
        'Saldo utama Anda tidak mencukupi untuk melakukan penarikan.',
      );
    }

    const bankDetails = `${profile.bankName} - ${profile.bankAccountNumber} a.n ${
      profile.bankAccountHolder || profile.fullNameKtp || 'Pemilik Rekening'
    }`;

    let disbursementId = `WD-${Date.now()}`;
    const secretKey = process.env.XENDIT_SECRET_KEY || '';

    if (secretKey && !secretKey.includes('dummy')) {
      const basicAuth = Buffer.from(`${secretKey}:`).toString('base64');
      try {
        const response = await fetch('https://api.xendit.co/disbursements', {
          method: 'POST',
          headers: {
            Authorization: `Basic ${basicAuth}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            external_id: disbursementId,
            bank_code: profile.bankName.toUpperCase(),
            account_holder_name:
              profile.bankAccountHolder ||
              profile.fullNameKtp ||
              'Pemilik Rekening',
            account_number: profile.bankAccountNumber,
            description: `Penarikan Dana Mitra Nebeng - ${profile.bankAccountHolder}`,
            amount: amount,
          }),
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(
            data.message || 'Gagal terhubung ke Xendit Disbursement',
          );
        }
        disbursementId = data.id;
      } catch (error: any) {
        throw new BadRequestException(
          `Gagal mencairkan dana via Xendit: ${error.message}`,
        );
      }
    }

    const { wallet: updatedWallet } =
      await this.walletRepository.processWithdrawal(
        wallet.id,
        amount,
        bankDetails + ` (TRX ID: ${disbursementId})`,
      );

    return {
      message: `Penarikan saldo sebesar Rp ${amount.toLocaleString('id-ID')} berhasil diproses via Xendit ke rekening ${bankDetails}.`,
      wallet: WalletMapper.toResponse(updatedWallet),
    };
  }
}
