import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateDisbursementBankDto } from './dto/create-disbursement-bank.dto';
import { UpdateDisbursementBankDto } from './dto/update-disbursement-bank.dto';

const DEFAULT_BANKS = [
  { bankCode: 'BCA', bankName: 'Bank Central Asia (BCA)', orderIndex: 1, isActive: true, notes: 'Proses kliring / transfer instan' },
  { bankCode: 'BNI', bankName: 'Bank Negara Indonesia (BNI)', orderIndex: 2, isActive: true, notes: 'Proses kliring / transfer instan' },
  { bankCode: 'BRI', bankName: 'Bank Rakyat Indonesia (BRI)', orderIndex: 3, isActive: true, notes: 'Proses kliring / transfer instan' },
  { bankCode: 'MANDIRI', bankName: 'Bank Mandiri', orderIndex: 4, isActive: true, notes: 'Proses kliring / transfer instan' },
  { bankCode: 'PERMATA', bankName: 'Bank Permata', orderIndex: 5, isActive: true, notes: 'Proses kliring / transfer instan' },
  { bankCode: 'CIMB', bankName: 'CIMB Niaga', orderIndex: 6, isActive: true, notes: 'Proses kliring / transfer instan' },
  { bankCode: 'BSI', bankName: 'Bank Syariah Indonesia (BSI)', orderIndex: 7, isActive: true, notes: 'Proses kliring / transfer instan' },
  { bankCode: 'DANAMON', bankName: 'Bank Danamon', orderIndex: 8, isActive: true, notes: 'Proses kliring / transfer instan' },
  { bankCode: 'BTPN', bankName: 'Bank BTPN / Jenius', orderIndex: 9, isActive: true, notes: 'Proses kliring / transfer instan' },
];

@Injectable()
export class DisbursementBanksService {
  constructor(private readonly prisma: PrismaService) {}

  private serialize(item: any) {
    if (!item) return item;
    return {
      ...item,
      id: item.id.toString(),
    };
  }

  async ensureDefaultBanksSeeded() {
    const count = await this.prisma.disbursementBank.count();
    if (count === 0) {
      for (const item of DEFAULT_BANKS) {
        await this.prisma.disbursementBank.create({
          data: item,
        });
      }
    }
  }

  async findActive() {
    await this.ensureDefaultBanksSeeded();
    const banks = await this.prisma.disbursementBank.findMany({
      where: { isActive: true },
      orderBy: [{ orderIndex: 'asc' }, { bankName: 'asc' }],
    });
    return banks.map((b) => this.serialize(b));
  }

  async findAllAdmin() {
    await this.ensureDefaultBanksSeeded();
    const banks = await this.prisma.disbursementBank.findMany({
      orderBy: [{ orderIndex: 'asc' }, { bankName: 'asc' }],
    });
    return banks.map((b) => this.serialize(b));
  }

  async findOne(id: string) {
    const bank = await this.prisma.disbursementBank.findUnique({
      where: { id: BigInt(id) },
    });
    if (!bank) {
      throw new NotFoundException('Data konfigurasi bank tidak ditemukan');
    }
    return this.serialize(bank);
  }

  async create(dto: CreateDisbursementBankDto) {
    const normalizedCode = dto.bankCode.trim().toUpperCase();
    const existing = await this.prisma.disbursementBank.findUnique({
      where: { bankCode: normalizedCode },
    });
    if (existing) {
      throw new ConflictException(`Kode bank "${normalizedCode}" sudah terdaftar.`);
    }

    const created = await this.prisma.disbursementBank.create({
      data: {
        bankCode: normalizedCode,
        bankName: dto.bankName.trim(),
        accountNumberSample: dto.accountNumberSample?.trim() || null,
        logoUrl: dto.logoUrl?.trim() || null,
        orderIndex: dto.orderIndex ?? 0,
        isActive: dto.isActive !== undefined ? dto.isActive : true,
        notes: dto.notes?.trim() || null,
      },
    });

    return this.serialize(created);
  }

  async update(id: string, dto: UpdateDisbursementBankDto) {
    const existing = await this.prisma.disbursementBank.findUnique({
      where: { id: BigInt(id) },
    });
    if (!existing) {
      throw new NotFoundException('Data konfigurasi bank tidak ditemukan');
    }

    let normalizedCode = existing.bankCode;
    if (dto.bankCode && dto.bankCode.trim().toUpperCase() !== existing.bankCode) {
      normalizedCode = dto.bankCode.trim().toUpperCase();
      const codeDuplicate = await this.prisma.disbursementBank.findUnique({
        where: { bankCode: normalizedCode },
      });
      if (codeDuplicate && codeDuplicate.id !== existing.id) {
        throw new ConflictException(`Kode bank "${normalizedCode}" sudah digunakan.`);
      }
    }

    const updated = await this.prisma.disbursementBank.update({
      where: { id: BigInt(id) },
      data: {
        bankCode: normalizedCode,
        ...(dto.bankName !== undefined && { bankName: dto.bankName.trim() }),
        ...(dto.accountNumberSample !== undefined && { accountNumberSample: dto.accountNumberSample?.trim() || null }),
        ...(dto.logoUrl !== undefined && { logoUrl: dto.logoUrl?.trim() || null }),
        ...(dto.orderIndex !== undefined && { orderIndex: dto.orderIndex }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.notes !== undefined && { notes: dto.notes?.trim() || null }),
      },
    });

    return this.serialize(updated);
  }

  async toggleActive(id: string) {
    const existing = await this.prisma.disbursementBank.findUnique({
      where: { id: BigInt(id) },
    });
    if (!existing) {
      throw new NotFoundException('Data konfigurasi bank tidak ditemukan');
    }

    const updated = await this.prisma.disbursementBank.update({
      where: { id: BigInt(id) },
      data: {
        isActive: !existing.isActive,
      },
    });

    return this.serialize(updated);
  }

  async remove(id: string) {
    const existing = await this.prisma.disbursementBank.findUnique({
      where: { id: BigInt(id) },
    });
    if (!existing) {
      throw new NotFoundException('Data konfigurasi bank tidak ditemukan');
    }

    await this.prisma.disbursementBank.delete({
      where: { id: BigInt(id) },
    });

    return { message: `Bank ${existing.bankName} (${existing.bankCode}) berhasil dihapus.` };
  }

  async isBankCodeActive(bankNameOrCode: string): Promise<boolean> {
    if (!bankNameOrCode) return false;
    const clean = bankNameOrCode.trim().toUpperCase();
    await this.ensureDefaultBanksSeeded();

    const bank = await this.prisma.disbursementBank.findFirst({
      where: {
        isActive: true,
        OR: [
          { bankCode: clean },
          { bankName: { contains: clean } },
        ],
      },
    });

    return !!bank;
  }
}

