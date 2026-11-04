import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { TransactionType } from '../../../generated/prisma/enums';

@Injectable()
export class WalletsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private safeParseBigInt(id: string): bigint | null {
    try {
      return BigInt(id);
    } catch {
      return null;
    }
  }

  async findByUserId(userId: string) {
    const parsedId = this.safeParseBigInt(userId);
    if (!parsedId) return null;

    return this.prisma.wallet.findUnique({
      where: { userId: parsedId },
      include: {
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });
  }

  async createWallets(userId: string) {
    const parsedId = this.safeParseBigInt(userId);
    if (!parsedId) {
      throw new BadRequestException('Format ID user tidak valid');
    }

    return this.prisma.wallet.create({
      data: {
        userId: parsedId,
      },
      include: {
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });
  }

  async processEscrowHold(
    walletId: bigint,
    orderIdStr: string,
    amount: number,
  ) {
    const parseOrderId = this.safeParseBigInt(orderIdStr);
    if (!parseOrderId) {
      throw new BadRequestException('Format ID Order tidak valid');
    }

    return this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.update({
        where: { id: walletId },
        data: {
          heldEscrowBalance: { increment: amount },
        },
      });

      await tx.walletTransaction.create({
        data: {
          walletId,
          orderId: parseOrderId,
          amount,
          type: TransactionType.escrow_hold,
          description: `Escrow hold untuk order #${orderIdStr}`,
        },
      });

      return wallet;
    });
  }

  async processEscrowRelease(
    walletId: bigint,
    orderIdStr: string,
    amount: number,
    platformFee: number = 0,
  ) {
    const parseOrderId = this.safeParseBigInt(orderIdStr);
    if (!parseOrderId) {
      throw new BadRequestException('Format ID order tidak valid');
    }

    const netAmount = amount - platformFee;

    return this.prisma.$transaction(async (tx) => {
      const updateResult = await tx.wallet.updateMany({
        where: {
          id: walletId,
          heldEscrowBalance: { gte: amount },
        },
        data: {
          heldEscrowBalance: { decrement: amount },
          balance: { increment: netAmount },
        },
      });

      if (updateResult.count === 0) {
        throw new BadRequestException(
          'Gagal mencairkan Escrow: Saldo Escrow ditahan tidak mencukupi.',
        );
      }

      await tx.walletTransaction.create({
        data: {
          walletId,
          orderId: parseOrderId,
          amount: netAmount,
          type: TransactionType.escrow_release,
          description: `Pencairan dana Escrow untuk order #${orderIdStr} (net mitra)`,
        },
      });

      return tx.wallet.findUnique({
        where: { id: walletId },
        include: {
          transactions: { orderBy: { createdAt: 'desc' }, take: 20 },
        },
      });
    });
  }

  async processWithdrawal(
    walletId: bigint,
    amount: number,
    bankDetails: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const updateResult = await tx.wallet.updateMany({
        where: {
          id: walletId,
          balance: { gte: amount },
        },
        data: {
          balance: { decrement: amount },
        },
      });

      if (updateResult.count === 0) {
        throw new BadRequestException(
          'Gagal melakukan penarikan: Saldo utama tidak mencukupi.',
        );
      }

      const transaction = await tx.walletTransaction.create({
        data: {
          walletId,
          amount,
          type: TransactionType.debit,
          description: `Penarikan saldo (Withdrawal) ke ${bankDetails}`,
        },
      });

      const wallet = await tx.wallet.findUnique({
        where: { id: walletId },
        include: {
          transactions: { orderBy: { createdAt: 'desc' }, take: 20 },
        },
      });

      return { wallet, transaction };
    });
  }

  async processTopUp(
    walletId: bigint,
    amount: number,
    description: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.update({
        where: { id: walletId },
        data: {
          balance: { increment: amount },
        },
      });

      const transaction = await tx.walletTransaction.create({
        data: {
          walletId,
          amount,
          type: TransactionType.credit,
          description,
        },
      });

      const updatedWallet = await tx.wallet.findUnique({
        where: { id: walletId },
        include: {
          transactions: { orderBy: { createdAt: 'desc' }, take: 20 },
        },
      });

      return { wallet: updatedWallet, transaction };
    });
  }
}
