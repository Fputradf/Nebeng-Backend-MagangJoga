import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { WalletsRepository } from './repository/wallets.repository';
import { WalletMapper } from './mappers/wallet.mapper';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { NotificationHelperService } from '../notifications/notification-helper.service';

@Injectable()
export class WalletsService {
  constructor(
    private readonly walletRepository: WalletsRepository,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly notificationHelper: NotificationHelperService,
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
            'X-IDEMPOTENCY-KEY': disbursementId,
          },
          body: JSON.stringify({
            external_id: disbursementId,
            bank_code: profile.bankName.trim().toUpperCase(),
            account_holder_name:
              profile.bankAccountHolder ||
              profile.fullNameKtp ||
              'Pemilik Rekening',
            account_number: profile.bankAccountNumber.trim(),
            description: `Penarikan Dana Mitra Nebeng - ${profile.bankAccountHolder || 'Customer'}`,
            amount: amount,
          }),
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(
            data.message || data.error_code || 'Gagal terhubung ke Xendit Disbursement',
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

    try {
      await this.notificationHelper.notifyWithdrawalProcessed(
        userIdStr,
        amount,
        bankDetails,
        disbursementId,
      );
    } catch (notifErr: any) {
      console.warn(`[Wallet] Gagal mengirim notifikasi penarikan: ${notifErr.message}`);
    }

    return {
      message: `Penarikan saldo sebesar Rp ${amount.toLocaleString('id-ID')} berhasil diproses via Xendit ke rekening ${bankDetails}.`,
      wallet: WalletMapper.toResponse(updatedWallet),
    };
  }

  async createTopUpInvoice(userIdStr: string, amount: number) {
    if (!amount || amount < 10000) {
      throw new BadRequestException('Minimal top up saldo adalah Rp 10.000.');
    }

    const parsedUserId = this.safeParseBigInt(userIdStr);
    if (!parsedUserId) {
      throw new BadRequestException('Format ID User tidak valid.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: parsedUserId },
    });

    if (!user) {
      throw new NotFoundException('Data pengguna tidak ditemukan.');
    }

    let wallet = await this.walletRepository.findByUserId(userIdStr);
    if (!wallet) {
      wallet = await this.walletRepository.createWallets(userIdStr);
    }

    const secretKey = process.env.XENDIT_SECRET_KEY;
    if (!secretKey) {
      throw new BadRequestException(
        'Konfigurasi XENDIT_SECRET_KEY belum diatur di server.',
      );
    }

    const externalId = `TOPUP-${userIdStr}-${Date.now()}`;
    const basicAuth = Buffer.from(`${secretKey}:`).toString('base64');

    try {
      const response = await fetch('https://api.xendit.co/v2/invoices', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basicAuth}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          external_id: externalId,
          amount: amount,
          payer_email: user.email,
          description: `Top Up Saldo Dompet Digital Nebeng - Rp ${amount.toLocaleString('id-ID')}`,
          invoice_duration: 86400,
          currency: 'IDR',
          reminder_time: 1,
          success_redirect_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/customer/wallet?topup=success`,
          failure_redirect_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/customer/wallet`,
        }),
      });

      const rawBody = await response.text();

      if (!response.ok) {
        console.error('Xendit Top Up Invoice Creation Failed. Status:', response.status, 'Body:', rawBody);
        let errMsg = 'Gagal berkomunikasi dengan gateway Xendit';
        try {
          const parsed = JSON.parse(rawBody);
          if (parsed.message) errMsg = parsed.message;
        } catch {}
        throw new BadRequestException(
          `Gagal membuat tagihan Top Up Xendit: ${errMsg}`,
        );
      }

      const invoiceData = JSON.parse(rawBody);

      return {
        message: 'Invoice Top Up berhasil dibuat.',
        invoiceUrl: invoiceData.invoice_url,
        invoiceId: invoiceData.id,
        expiryDate: invoiceData.expiry_date,
        amount: amount,
        externalId,
      };
    } catch (error: any) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      console.error('Xendit Top Up Invoice Error:', error);
      throw new BadRequestException(
        `Gagal membuat tagihan Top Up Xendit: ${error.message}`,
      );
    }
  }

  async checkTopUpStatus(userIdStr: string, invoiceId: string) {
    const parsedUserId = this.safeParseBigInt(userIdStr);
    if (!parsedUserId) {
      throw new BadRequestException('Format ID User tidak valid.');
    }

    const secretKey = process.env.XENDIT_SECRET_KEY;
    if (!secretKey) {
      throw new BadRequestException('Konfigurasi XENDIT_SECRET_KEY belum diatur.');
    }

    const basicAuth = Buffer.from(`${secretKey}:`).toString('base64');
    const response = await fetch(`https://api.xendit.co/v2/invoices/${invoiceId}`, {
      method: 'GET',
      headers: {
        Authorization: `Basic ${basicAuth}`,
      },
    });

    if (!response.ok) {
      throw new BadRequestException('Gagal mengambil status invoice dari Xendit.');
    }

    const invoice = await response.json();

    if (invoice.status === 'PAID' || invoice.status === 'SETTLED') {
      let wallet = await this.walletRepository.findByUserId(userIdStr);
      if (!wallet) {
        wallet = await this.walletRepository.createWallets(userIdStr);
      }

      const existingTx = await this.prisma.walletTransaction.findFirst({
        where: {
          walletId: wallet.id,
          description: { contains: invoice.id },
        },
      });

      if (!existingTx) {
        const amount = Number(invoice.amount);
        const paymentMethod = invoice.payment_method || 'XENDIT';
        const paymentChannel = invoice.payment_channel || 'QRIS/VA';
        const desc = `Top Up Saldo via ${paymentMethod} (${paymentChannel}) [ID: ${invoice.id}]`;

        const { wallet: updatedWallet } = await this.walletRepository.processTopUp(
          wallet.id,
          amount,
          desc,
        );

        try {
          await this.notificationHelper.notifyTopUpSuccess(
            userIdStr,
            amount,
            invoice.id,
          );
        } catch (notifErr: any) {
          console.warn(`[Wallet] Gagal mengirim notifikasi top up: ${notifErr.message}`);
        }

        return {
          status: invoice.status,
          message: `Top up sebesar Rp ${amount.toLocaleString('id-ID')} berhasil!`,
          wallet: WalletMapper.toResponse(updatedWallet),
        };
      }

      return {
        status: invoice.status,
        message: 'Top up sudah berhasil diproses.',
        wallet: WalletMapper.toResponse(wallet),
      };
    }

    return {
      status: invoice.status,
      message: `Status invoice saat ini: ${invoice.status}`,
    };
  }

  async syncMyTopUps(userIdStr: string) {
    const parsedUserId = this.safeParseBigInt(userIdStr);
    if (!parsedUserId) {
      throw new BadRequestException('Format ID User tidak valid.');
    }

    const secretKey = process.env.XENDIT_SECRET_KEY;
    let wallet = await this.walletRepository.findByUserId(userIdStr);
    if (!wallet) {
      wallet = await this.walletRepository.createWallets(userIdStr);
    }

    if (!secretKey) {
      return {
        syncedCount: 0,
        message: 'Konfigurasi gateway pembayaran belum disetel.',
        wallet: WalletMapper.toResponse(wallet),
      };
    }

    const basicAuth = Buffer.from(`${secretKey}:`).toString('base64');
    try {
      const response = await fetch('https://api.xendit.co/v2/invoices?limit=20', {
        method: 'GET',
        headers: {
          Authorization: `Basic ${basicAuth}`,
        },
      });

      if (!response.ok) {
        return {
          syncedCount: 0,
          message: 'Gagal mengambil data dari gateway pembayaran.',
          wallet: WalletMapper.toResponse(wallet),
        };
      }

      const invoices = await response.json();
      const prefix = `TOPUP-${userIdStr}-`;
      let syncedCount = 0;

      for (const inv of invoices) {
        if (
          inv.external_id &&
          inv.external_id.startsWith(prefix) &&
          (inv.status === 'PAID' || inv.status === 'SETTLED')
        ) {
          const existingTx = await this.prisma.walletTransaction.findFirst({
            where: {
              walletId: wallet.id,
              description: { contains: inv.id },
            },
          });

          if (!existingTx) {
            const amount = Number(inv.amount);
            const paymentMethod = inv.payment_method || 'XENDIT';
            const paymentChannel = inv.payment_channel || 'QRIS/VA';
            const desc = `Top Up Saldo via ${paymentMethod} (${paymentChannel}) [ID: ${inv.id}]`;

            const { wallet: updatedWallet } = await this.walletRepository.processTopUp(
              wallet.id,
              amount,
              desc,
            );
            if (updatedWallet) {
              wallet = updatedWallet;
            }
            syncedCount++;

            try {
              await this.notificationHelper.notifyTopUpSuccess(
                userIdStr,
                amount,
                inv.id,
              );
            } catch (notifErr: any) {
              console.warn(`[Wallet] Gagal mengirim notifikasi sync top up: ${notifErr.message}`);
            }
          }
        }
      }

      const latestWallet = await this.walletRepository.findByUserId(userIdStr);
      return {
        syncedCount,
        message:
          syncedCount > 0
            ? `${syncedCount} transaksi Top Up berhasil disinkronkan ke saldo Anda!`
            : 'Saldo sudah tersinkronisasi dengan status terbaru.',
        wallet: WalletMapper.toResponse(latestWallet || wallet),
      };
    } catch (error) {
      console.error('Error syncing top ups:', error);
      return {
        syncedCount: 0,
        message: 'Gagal menghubungi gateway pembayaran untuk sinkronisasi.',
        wallet: WalletMapper.toResponse(wallet),
      };
    }
  }
}
