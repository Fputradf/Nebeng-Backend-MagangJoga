import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PaymentsRepository } from './repository/payments.repository';
import { OrdersRepository } from '../orders/repository/orders.repository';
import { PrismaService } from '../../prisma/prisma.service';
import { CheckoutPaymentDto } from './dto/checkout-payment.dto';
import { EscrowStatus, OrderStatus, PaymentStatus, Role, ServiceType, TransactionType, TripStatus } from '../../generated/prisma/enums';
import { randomBytes, timingSafeEqual } from 'crypto';
import * as bcrypt from 'bcrypt';
import { NotificationHelperService } from '../notifications/notification-helper.service';
import { computeOrderFinancials } from '../../common/utils/financial.util';
import { PaymentActiveMode, UpdatePaymentModeConfigDto } from './dto/payment-config.dto';
import { SubmitManualPaymentDto, UpdateManualPaymentStatusDto, VerifyManualPaymentDto } from './dto/submit-manual-payment.dto';

export const DEFAULT_PAYMENT_CONFIG = {
  activeMode: PaymentActiveMode.MANUAL, // MUTUALLY EXCLUSIVE DEFAULT: OPSI B
  gateway: {
    provider: 'XENDIT',
    environment: 'sandbox',
    status: 'inactive',
    enabledChannels: ['QRIS', 'EWALLET', 'VIRTUAL_ACCOUNT'],
    xenditSecretKey: '',
    xenditCallbackToken: '',
  },
  manual: {
    bankName: 'Bank Central Asia (BCA)',
    accountNumber: '8830192837',
    accountHolder: 'PT NEBENG INDONESIA DIGITAL',
    qrisImageUrl: '',
    qrisPayload:
      '00020101021226680016ID.CO.NEBENG011893600999999999999902150000000000000000303UMI51440014ID.LINKAJA.WWW02150000000000000000303UMI5204549953033605802ID5919NEBENG OWNER STORE6007JAKARTA61051234062070703A016304E07B',
    transferGuide: [
      'Buka aplikasi m-Banking (BCA, Mandiri, BRI, BNI) atau aplikasi e-wallet pilihan Anda.',
      'Pilih menu Transfer Rekening Bank Resmi atau Scan Barcode QRIS Statis Pemilik.',
      'Masukkan nominal tagihan tepat hingga digit terakhir sesuai ringkasan tagihan.',
      'Unggah foto struk/tangkapan layar bukti pembayaran pada form, lalu klik Konfirmasi Pembayaran.',
    ],
    autoVerifyManual: false,
  },
};

@Injectable()
export class PaymentsService {
  constructor(
    private readonly paymentsRepository: PaymentsRepository,
    private readonly ordersRepository: OrdersRepository,
    private readonly prisma: PrismaService,
    private readonly notificationHelper: NotificationHelperService,
  ) {}

  private safeParseBigInt(id: string): bigint | null {
    try {
      return BigInt(id);
    } catch {
      return null;
    }
  }

  async checkoutPayment(userIdStr: string, dto: CheckoutPaymentDto) {
    const ALLOWED_GATEWAYS = ['BANK_TRANSFER', 'QRIS', 'WALLET'];
    if (!ALLOWED_GATEWAYS.includes(dto.paymentGateway)) {
      throw new BadRequestException('Metode pembayaran tidak valid.');
    }

    const parsedUserId = this.safeParseBigInt(userIdStr);
    if (!parsedUserId) {
      throw new BadRequestException('ID User tidak valid.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: parsedUserId },
    });

    if (!user) {
      throw new NotFoundException('Data pengguna tidak ditemukan.');
    }

    if (!user.pinHash) {
      throw new BadRequestException(
        'Anda belum mengatur PIN Transaksi. Silakan buat PIN terlebih dahulu pada menu pengaturan akun.',
      );
    }

    const isPinValid = await bcrypt.compare(dto.pin, user.pinHash);
    if (!isPinValid) {
      throw new UnauthorizedException(
        'PIN transaksi yang Anda masukkan salah.',
      );
    }

    const order = await this.ordersRepository.findById(dto.orderId);

    if (!order) {
      throw new NotFoundException('Order tidak ditemukan.');
    }

    if (order.customerId.toString() !== userIdStr) {
      throw new BadRequestException('Order ini bukan milik Anda.');
    }

    if (order.status !== OrderStatus.pending_payment) {
      throw new BadRequestException(
        'Order ini tidak dalam status menunggu pembayaran.',
      );
    }

    if (dto.paymentGateway === 'WALLET') {
      const customerWallet = await this.prisma.wallet.findUnique({
        where: { userId: parsedUserId },
      });
      if (
        !customerWallet ||
        Number(customerWallet.balance) < Number(order.totalPrice)
      ) {
        throw new BadRequestException(
          'Saldo dompet tidak mencukupi untuk melakukan pembayaran.',
        );
      }
    }

    const transactionId = `TRX-${randomBytes(4).toString('hex').toUpperCase()}`;

    let adminFeePercentage = order.adminFeePercentage
      ? Number(order.adminFeePercentage)
      : 10;

    if (!order.adminFeePercentage) {
      const serviceType =
        order.type === 'passenger'
          ? order.trip.vehicleType === 'motor'
            ? ServiceType.motor
            : ServiceType.mobil
          : ServiceType.barang;

      const pricingSetting = await this.prisma.pricingSetting.findFirst({
        where: { serviceType },
      });

      if (pricingSetting?.adminFeePercentage) {
        adminFeePercentage = Number(pricingSetting.adminFeePercentage);
      }
    }

    const financials = computeOrderFinancials({
      subtotal: (order as any).subtotal || order.totalPrice,
      customerFee: (order as any).customerFee,
      totalPrice: order.totalPrice,
      discountAmount: (order as any).discountAmount,
      adminFeePercentage,
    });

    const mitraUserId = order.trip.mitraId.toString();

    const { payment } =
      await this.paymentsRepository.processCheckoutTransaction(
        dto.orderId,
        mitraUserId,
        dto.paymentGateway,
        transactionId,
        financials.customerPaid,
        financials.fee,
        financials.netMitra,
        false, // isWebhook = false untuk checkout langsung
        ...(financials.discount > 0 || financials.customerFee > 0
          ? [financials.adminNet]
          : []),
      );

    await this.notificationHelper.notifyOrderPaid(
      userIdStr,
      dto.orderId,
      financials.customerPaid,
    );

    if (!payment) {
      throw new BadRequestException('Payment gagal dibuat.');
    }

    return {
      message:
        'Pembayaran berhasil dikonfirmasi dan dana telah ditahan oleh Escrow System.',
      payment: {
        id: payment.id.toString(),
        transactionId: payment.transactionId,
        amount: Number(payment.amount),
        adminFeeAmount: financials.fee,
        netMitraAmount: financials.netMitra,
        status: payment.status,
      },
    };
  }

  async getPaymentsByRegion(
    currentUser: any,
    regionId?: string,
    page: number = 1,
    limit: number = 10,
  ) {
    let parsedRegionId: bigint | null = null;

    if (currentUser.role === Role.regional) {
      if (!currentUser.regionId) {
        throw new ForbiddenException(
          'Akun Regional Admin ini belum dihubungkan dengan ID Wilayah manapun.',
        );
      }
      parsedRegionId = this.safeParseBigInt(currentUser.regionId.toString());
    } else if (regionId) {
      parsedRegionId = this.safeParseBigInt(regionId);
    }

    const skip = (page - 1) * limit;

    const whereCondition = {
      order: {
        trip: {
          originPoint: {
            ...(parsedRegionId ? { regionId: parsedRegionId } : {}),
          },
        },
      },
    };

    const [payments, totalItems] = await Promise.all([
      this.prisma.payment.findMany({
        where: whereCondition,
        skip,
        take: limit,
        include: {
          order: {
            include: {
              customer: true,
              trip: {
                include: {
                  originPoint: { include: { region: true } },
                  mitra: { include: { region: true } },
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.payment.count({ where: whereCondition }),
    ]);

    const formattedData = payments.map((p) => ({
      ...p,
      id: p.id.toString(),
      orderId: p.orderId.toString(),
      amount: Number(p.amount),
    }));

    return {
      pagination: {
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
        currentPage: page,
        limit,
      },
      data: formattedData,
    };
  }

  async getPaymentsByOperator(
    operatorUserIdStr: string,
    page: number = 1,
    limit: number = 10,
    month?: number,
    year?: number,
  ) {
    const { payments, totalItems, assignedPos, totalRevenue } =
      await this.paymentsRepository.getPaymentsByOperator(
        operatorUserIdStr,
        page,
        limit,
        month,
        year,
      );

    const formattedTransactions = payments.map((p) => ({
      id: p.id.toString(),
      orderId: p.orderId.toString(),
      amount: Number(p.amount),
      paymentGateway: p.paymentGateway,
      transactionId: p.transactionId,
      status: p.status,
      createdAt: p.createdAt,
      order: p.order
        ? {
            id: p.order.id.toString(),
            type: p.order.type,
            totalPrice: Number(p.order.totalPrice),
            status: p.order.status,
            customer: p.order.customer
              ? {
                  id: p.order.customer.id.toString(),
                  name: p.order.customer.name,
                  email: p.order.customer.email,
                }
              : null,
            trip: p.order.trip
              ? {
                  id: p.order.trip.id.toString(),
                  originPoint: p.order.trip.originPoint
                    ? {
                        id: p.order.trip.originPoint.id.toString(),
                        name: p.order.trip.originPoint.name,
                      }
                    : null,
                }
              : null,
          }
        : null,
    }));

    return {
      posSummary: assignedPos
        ? {
            posId: assignedPos.id.toString(),
            posName: assignedPos.name,
            totalRevenue,
          }
        : null,
      pagination: {
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
        currentPage: page,
        limit,
      },
      data: formattedTransactions,
    };
  }

  /**
   * 0. PENGATURAN MODE PEMBAYARAN TUNGGAL (MUTUALLY EXCLUSIVE)
   */
  async getRawPaymentConfig(): Promise<typeof DEFAULT_PAYMENT_CONFIG> {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { key: 'payment_mode_config' },
    });

    let config = DEFAULT_PAYMENT_CONFIG;
    if (setting?.value) {
      try {
        const parsed = JSON.parse(setting.value);
        config = {
          ...DEFAULT_PAYMENT_CONFIG,
          ...parsed,
          gateway: {
            ...DEFAULT_PAYMENT_CONFIG.gateway,
            ...(parsed.gateway || {}),
          },
          manual: {
            ...DEFAULT_PAYMENT_CONFIG.manual,
            ...(parsed.manual || {}),
          },
        };
      } catch (e) {
        console.error('Gagal parse payment_mode_config:', e);
      }
    } else {
      // Seed default ke database (Opsi B: Transfer Manual aktif)
      try {
        if (this.prisma.systemSetting?.create) {
          await this.prisma.systemSetting.create({
            data: {
              key: 'payment_mode_config',
              value: JSON.stringify(DEFAULT_PAYMENT_CONFIG),
              description:
                'Konfigurasi mode pembayaran tunggal mutually exclusive (Gateway vs Manual)',
            },
          });
        }
      } catch {}
    }

    return config;
  }

  async getPaymentConfig(isSuperadmin: boolean = false) {
    const config = await this.getRawPaymentConfig();

    if (!isSuperadmin) {
      // Mask / sembunyikan kredensial sensitif untuk customer
      return {
        activeMode: config.activeMode,
        gateway: {
          provider: config.gateway?.provider || 'XENDIT',
          environment: config.gateway?.environment || 'sandbox',
          enabledChannels: config.gateway?.enabledChannels || [
            'QRIS',
            'EWALLET',
            'VIRTUAL_ACCOUNT',
          ],
        },
        manual: {
          bankName: config.manual?.bankName,
          accountNumber: config.manual?.accountNumber,
          accountHolder: config.manual?.accountHolder,
          qrisImageUrl: config.manual?.qrisImageUrl,
          qrisPayload: config.manual?.qrisPayload,
          transferGuide: config.manual?.transferGuide,
        },
      };
    }

    return config;
  }

  async updatePaymentConfig(dto: UpdatePaymentModeConfigDto) {
    const current = await this.getRawPaymentConfig();

    // MUTUALLY EXCLUSIVE RULE: Hanya SALAH SATU metode pembayaran yang boleh aktif
    const nextMode = dto.activeMode;
    const isManual = nextMode === PaymentActiveMode.MANUAL;

    const updated = {
      ...current,
      activeMode: nextMode,
      gateway: {
        ...current.gateway,
        status: isManual ? 'inactive' : 'active',
        ...(dto.gatewayProvider ? { provider: dto.gatewayProvider } : {}),
        ...(dto.xenditSecretKey !== undefined
          ? { xenditSecretKey: dto.xenditSecretKey }
          : {}),
        ...(dto.xenditCallbackToken !== undefined
          ? { xenditCallbackToken: dto.xenditCallbackToken }
          : {}),
      },
      manual: {
        ...current.manual,
        status: isManual ? 'active' : 'inactive',
        ...(dto.manualBankName ? { bankName: dto.manualBankName } : {}),
        ...(dto.manualAccountNumber
          ? { accountNumber: dto.manualAccountNumber }
          : {}),
        ...(dto.manualAccountHolder
          ? { accountHolder: dto.manualAccountHolder }
          : {}),
        ...(dto.manualQrisImageUrl !== undefined
          ? { qrisImageUrl: dto.manualQrisImageUrl }
          : {}),
        ...(dto.manualQrisPayload !== undefined
          ? { qrisPayload: dto.manualQrisPayload }
          : {}),
        ...(dto.transferGuide
          ? {
              transferGuide: Array.isArray(dto.transferGuide)
                ? dto.transferGuide
                : [dto.transferGuide],
            }
          : {}),
        ...(dto.autoVerifyManual !== undefined
          ? { autoVerifyManual: dto.autoVerifyManual }
          : {}),
      },
    };

    await this.prisma.systemSetting.upsert({
      where: { key: 'payment_mode_config' },
      create: {
        key: 'payment_mode_config',
        value: JSON.stringify(updated),
        description:
          'Konfigurasi mode pembayaran tunggal mutually exclusive (Gateway vs Manual)',
      },
      update: {
        value: JSON.stringify(updated),
      },
    });

    return {
      message: `Pengaturan pembayaran berhasil diperbarui. Mode aktif: ${
        nextMode === PaymentActiveMode.MANUAL
          ? 'Opsi B (Transfer Manual & QRIS Statis Pemilik)'
          : 'Opsi A (Payment Gateway Otomatis)'
      }.`,
      config: updated,
    };
  }

  /**
   * PENGELOLAAN PEMBAYARAN MANUAL OLEH CUSTOMER & ADMIN
   */
  async submitManualPayment(userIdStr: string, dto: SubmitManualPaymentDto) {
    const parsedOrderId = this.safeParseBigInt(dto.orderId);
    if (!parsedOrderId) {
      throw new BadRequestException('ID Order tidak valid.');
    }

    const order = await this.prisma.order.findUnique({
      where: { id: parsedOrderId },
      include: {
        customer: true,
        trip: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Data pesanan tidak ditemukan.');
    }

    if (order.customerId.toString() !== userIdStr) {
      throw new ForbiddenException('Anda tidak berhak membayar pesanan ini.');
    }

    if (order.status !== OrderStatus.pending_payment) {
      throw new BadRequestException(
        `Pesanan tidak dapat dibayar karena status saat ini: ${order.status}`,
      );
    }

    if (!dto.proofUrl) {
      throw new BadRequestException('Struk / bukti transfer wajib diunggah.');
    }

    const transactionId = `MANUAL-${Date.now()}-${randomBytes(3).toString('hex').toUpperCase()}`;

    // Cek apakah sudah pernah ada pembayaran pending untuk order ini
    const existingPayment = await this.prisma.payment.findFirst({
      where: { orderId: order.id, status: PaymentStatus.pending },
    });

    let payment;
    if (existingPayment) {
      payment = await this.prisma.payment.update({
        where: { id: existingPayment.id },
        data: {
          paymentGateway: 'MANUAL_TRANSFER',
          transactionId,
          amount: order.totalPrice,
          proofUrl: dto.proofUrl,
          senderName: dto.senderName,
          bankName: dto.bankName,
          senderAccount: dto.senderAccount,
          notes: dto.notes,
        },
      });
    } else {
      payment = await this.prisma.payment.create({
        data: {
          orderId: order.id,
          paymentGateway: 'MANUAL_TRANSFER',
          transactionId,
          amount: order.totalPrice,
          status: PaymentStatus.pending,
          proofUrl: dto.proofUrl,
          senderName: dto.senderName,
          bankName: dto.bankName,
          senderAccount: dto.senderAccount,
          notes: dto.notes,
        },
      });
    }

    const config = await this.getRawPaymentConfig();
    if (config.manual.autoVerifyManual) {
      await this.verifyManualPayment(userIdStr, payment.id.toString(), {
        approved: true,
        reviewNotes: 'Verifikasi instan sistem otomatis aktif',
      });
      return {
        success: true,
        status: 'PAID',
        message: 'Bukti transfer berhasil diverifikasi secara instan. Tagihan lunas!',
        paymentId: payment.id.toString(),
      };
    }

    try {
      await this.notificationHelper.notifyAdminsManualPaymentSubmitted({
        orderId: order.id.toString(),
        paymentId: payment.id.toString(),
        customerName: order.customer?.name || dto.senderName || 'Pelanggan',
        amount: Number(order.totalPrice || 0),
        bankName: dto.bankName,
      });
    } catch {
      // Jangan gagalkan upload bukti pembayaran jika notifikasi admin gagal
    }

    return {
      success: true,
      status: 'PENDING_VERIFICATION',
      message:
        'Bukti pembayaran berhasil diunggah! Sistem & Petugas akan segera memverifikasi struk Anda.',
      paymentId: payment.id.toString(),
    };
  }

  async verifyManualPayment(
    adminUserIdStr: string,
    paymentIdStr: string,
    dto: VerifyManualPaymentDto,
  ) {
    const parsedPaymentId = this.safeParseBigInt(paymentIdStr);
    if (!parsedPaymentId) {
      throw new BadRequestException('ID Pembayaran tidak valid.');
    }

    const payment = await this.prisma.payment.findUnique({
      where: { id: parsedPaymentId },
      include: {
        order: {
          include: { trip: true, customer: true },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException('Data pembayaran tidak ditemukan.');
    }

    if (payment.status === PaymentStatus.success) {
      return {
        message: 'Pembayaran ini sudah pernah diverifikasi lunas.',
        payment: {
          id: payment.id.toString(),
          orderId: payment.orderId.toString(),
          status: payment.status,
        },
      };
    }

    if (dto.approved) {
      const order = payment.order;
      const adminFeePercentage = Number(order.adminFeePercentage || 10);
      const financials = computeOrderFinancials({
        subtotal: (order as any).subtotal || order.totalPrice,
        customerFee: (order as any).customerFee,
        totalPrice: order.totalPrice,
        discountAmount: (order as any).discountAmount,
        adminFeePercentage,
      });
      const mitraUserId = order.trip.mitraId.toString();

      await this.paymentsRepository.processCheckoutTransaction(
        order.id.toString(),
        mitraUserId,
        payment.paymentGateway || 'MANUAL_TRANSFER',
        payment.transactionId,
        financials.customerPaid,
        financials.fee,
        financials.netMitra,
        true,
        ...(financials.discount > 0 || financials.customerFee > 0
          ? [financials.adminNet]
          : []),
      );

      const updatedPayment = await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.success,
          notes: dto.reviewNotes || payment.notes,
        },
      });

      await this.notificationHelper.notifyOrderPaid(
        order.customerId.toString(),
        order.id.toString(),
        financials.customerPaid,
      );

      return {
        success: true,
        message: 'Pembayaran manual berhasil diverifikasi dan pesanan lunas!',
        payment: {
          id: updatedPayment.id.toString(),
          orderId: order.id.toString(),
          status: updatedPayment.status,
        },
      };
    } else {
      const updatedPayment = await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.failed,
          notes: dto.reviewNotes || 'Bukti transfer ditolak oleh administrator.',
        },
      });

      return {
        success: false,
        message: 'Pembayaran manual ditolak.',
        payment: {
          id: updatedPayment.id.toString(),
          orderId: payment.orderId.toString(),
          status: updatedPayment.status,
        },
      };
    }
  }

  async updateManualPaymentStatus(
    adminUserIdStr: string,
    paymentIdStr: string,
    dto: UpdateManualPaymentStatusDto,
  ) {
    const parsedPaymentId = this.safeParseBigInt(paymentIdStr);
    if (!parsedPaymentId) {
      throw new BadRequestException('ID Pembayaran tidak valid.');
    }

    const payment = await this.prisma.payment.findUnique({
      where: { id: parsedPaymentId },
      include: {
        order: {
          include: { trip: true, customer: true },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException('Data pembayaran tidak ditemukan.');
    }

    const targetStatus = dto.status as PaymentStatus;
    if (payment.status === targetStatus) {
      const updated = dto.reviewNotes
        ? await this.prisma.payment.update({
            where: { id: payment.id },
            data: { notes: dto.reviewNotes },
          })
        : payment;

      return {
        success: true,
        message: 'Status pembayaran tidak berubah.',
        payment: {
          id: updated.id.toString(),
          orderId: updated.orderId.toString(),
          status: updated.status,
        },
      };
    }

    // Jika target adalah Lunas (success), gunakan alur verifikasi standar
    if (targetStatus === PaymentStatus.success) {
      if (payment.order.status !== OrderStatus.pending_payment) {
        throw new BadRequestException(
          'Order tidak lagi dalam status menunggu pembayaran sehingga tidak dapat diubah menjadi Lunas.',
        );
      }
      if (payment.order.trip.status !== TripStatus.scheduled) {
        throw new BadRequestException(
          'Trip sudah berjalan atau dibatalkan sehingga pembayaran tidak dapat diubah menjadi Lunas.',
        );
      }

      if (payment.status === PaymentStatus.failed) {
        await this.prisma.payment.update({
          where: { id: payment.id },
          data: { status: PaymentStatus.pending },
        });
      }

      return this.verifyManualPayment(adminUserIdStr, paymentIdStr, {
        approved: true,
        reviewNotes: dto.reviewNotes || 'Status diubah menjadi Lunas oleh Superadmin',
      });
    }

    // Jika dari pending -> failed
    if (payment.status === PaymentStatus.pending && targetStatus === PaymentStatus.failed) {
      return this.verifyManualPayment(adminUserIdStr, paymentIdStr, {
        approved: false,
        reviewNotes: dto.reviewNotes || 'Status diubah menjadi Ditolak oleh Superadmin',
      });
    }

    // Jika dari success -> pending / failed, lakukan reversal escrow & order
    if (payment.status === PaymentStatus.success) {
      const order = payment.order;
      if (
        order.status !== OrderStatus.paid ||
        order.escrowStatus !== EscrowStatus.held
      ) {
        throw new BadRequestException(
          'Order sudah diproses lebih lanjut atau escrow sudah dilepas, status pembayaran Lunas tidak dapat diubah.',
        );
      }

      const adminFeePercentage = Number(order.adminFeePercentage || 10);
      const financials = computeOrderFinancials({
        subtotal: (order as any).subtotal || order.totalPrice,
        customerFee: (order as any).customerFee,
        totalPrice: order.totalPrice,
        discountAmount: (order as any).discountAmount,
        adminFeePercentage,
      });

      const updatedPayment = await this.prisma.$transaction(async (tx) => {
        const mitraWallet = await tx.wallet.findUnique({
          where: { userId: order.trip.mitraId },
        });
        if (mitraWallet && financials.netMitra > 0) {
          await tx.wallet.update({
            where: { id: mitraWallet.id },
            data: {
              heldEscrowBalance: { decrement: financials.netMitra },
            },
          });
          await tx.walletTransaction.create({
            data: {
              walletId: mitraWallet.id,
              orderId: order.id,
              amount: financials.netMitra,
              type: TransactionType.debit,
              description: `Reversal Escrow Order #${order.id.toString()} (Edit status pembayaran manual)`,
            },
          });
        }

        const systemAdminIdEnv = process.env.SYSTEM_ADMIN_USER_ID;
        const parsedSystemAdminId = systemAdminIdEnv
          ? this.safeParseBigInt(systemAdminIdEnv)
          : null;
        const adminUser = parsedSystemAdminId
          ? await tx.user.findUnique({ where: { id: parsedSystemAdminId } })
          : await tx.user.findFirst({
              where: { role: 'admin' },
              orderBy: { id: 'asc' },
            });

        if (adminUser) {
          const adminWallet = await tx.wallet.findUnique({
            where: { userId: adminUser.id },
          });
          const effectiveAdminNet =
            financials.discount > 0 || financials.customerFee > 0
              ? financials.adminNet
              : financials.fee;

          if (adminWallet && effectiveAdminNet !== 0) {
            if (effectiveAdminNet > 0) {
              await tx.wallet.update({
                where: { id: adminWallet.id },
                data: { balance: { decrement: effectiveAdminNet } },
              });
              await tx.walletTransaction.create({
                data: {
                  walletId: adminWallet.id,
                  orderId: order.id,
                  amount: effectiveAdminNet,
                  type: TransactionType.debit,
                  description: `Reversal Admin Fee Order #${order.id.toString()} (Edit status pembayaran manual)`,
                },
              });
            } else {
              const subsidy = Math.abs(effectiveAdminNet);
              await tx.wallet.update({
                where: { id: adminWallet.id },
                data: { balance: { increment: subsidy } },
              });
              await tx.walletTransaction.create({
                data: {
                  walletId: adminWallet.id,
                  orderId: order.id,
                  amount: subsidy,
                  type: TransactionType.credit,
                  description: `Reversal Subsidi Voucher Order #${order.id.toString()} (Edit status pembayaran manual)`,
                },
              });
            }
          }
        }

        await tx.order.update({
          where: { id: order.id },
          data: {
            status: OrderStatus.pending_payment,
            escrowStatus: EscrowStatus.pending,
          },
        });

        await tx.orderQrSession.deleteMany({
          where: {
            orderId: order.id,
            scanPhase: 'checkin_origin',
            isUsed: false,
          },
        });

        return tx.payment.update({
          where: { id: payment.id },
          data: {
            status: targetStatus,
            notes:
              dto.reviewNotes ||
              `Status diubah dari Lunas ke ${targetStatus === PaymentStatus.pending ? 'Menunggu' : 'Ditolak'} oleh Superadmin`,
          },
        });
      });

      return {
        success: true,
        message: 'Status pembayaran berhasil diperbarui dan escrow dikembalikan.',
        payment: {
          id: updatedPayment.id.toString(),
          orderId: payment.orderId.toString(),
          status: updatedPayment.status,
        },
      };
    }

    // Transisi antar status non-success (misal failed -> pending)
    const updatedPayment = await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: targetStatus,
        notes:
          dto.reviewNotes ||
          `Status diubah ke ${targetStatus === PaymentStatus.pending ? 'Menunggu' : 'Ditolak'} oleh Superadmin`,
      },
    });

    return {
      success: true,
      message: 'Status pembayaran manual berhasil diperbarui.',
      payment: {
        id: updatedPayment.id.toString(),
        orderId: payment.orderId.toString(),
        status: updatedPayment.status,
      },
    };
  }

  async getManualPayments(
    page: number = 1,
    limit: number = 20,
    status?: string,
  ) {
    const skip = (page - 1) * limit;
    const where: any = {
      paymentGateway: 'MANUAL_TRANSFER',
    };
    if (status && Object.values(PaymentStatus).includes(status as any)) {
      where.status = status as PaymentStatus;
    }

    const [payments, totalItems] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        skip,
        take: limit,
        include: {
          order: {
            include: {
              customer: true,
              trip: {
                include: {
                  originPoint: true,
                  destinationPoint: true,
                  mitra: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.payment.count({ where }),
    ]);

    return {
      pagination: {
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
        currentPage: page,
        limit,
      },
      data: payments.map((p) => ({
        id: p.id.toString(),
        orderId: p.orderId.toString(),
        amount: Number(p.amount),
        paymentGateway: p.paymentGateway,
        transactionId: p.transactionId,
        status: p.status,
        proofUrl: p.proofUrl,
        senderName: p.senderName,
        bankName: p.bankName,
        senderAccount: p.senderAccount,
        notes: p.notes,
        createdAt: p.createdAt,
        order: p.order
          ? {
              id: p.order.id.toString(),
              type: p.order.type,
              totalPrice: Number(p.order.totalPrice),
              status: p.order.status,
              customer: p.order.customer
                ? {
                    id: p.order.customer.id.toString(),
                    name: p.order.customer.name,
                    email: p.order.customer.email,
                    phone: p.order.customer.phone,
                  }
                : null,
              trip: p.order.trip
                ? {
                    id: p.order.trip.id.toString(),
                    origin: p.order.trip.originPoint?.name,
                    destination: p.order.trip.destinationPoint?.name,
                  }
                : null,
            }
          : null,
      })),
    };
  }

  /**
   * 1. MEMBUAT INVOICE XENDIT (Dipanggil saat Customer klik Bayar)
   */
  async createXenditInvoice(currentUserIdStr: string, orderIdStr: string) {
    const parsedOrderId = this.safeParseBigInt(orderIdStr);
    if (!parsedOrderId) {
      throw new BadRequestException('ID Order tidak valid.');
    }

    // CEK MODE AKTIF: Pada Opsi B, sistem sama sekali TIDAK BOLEH memanggil gateway
    const config = await this.getRawPaymentConfig();
    if (config.activeMode === PaymentActiveMode.MANUAL) {
      throw new BadRequestException(
        'Metode pembayaran gateway saat ini dinonaktifkan oleh administrator. Silakan lakukan pembayaran via Transfer Rekening Manual & QRIS Statis Pemilik.',
      );
    }

    // Cari data order beserta customer dan trip
    const order = await this.prisma.order.findUnique({
      where: { id: parsedOrderId },
      include: {
        customer: true,
        trip: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Data pesanan tidak ditemukan.');
    }

    if (order.customerId.toString() !== currentUserIdStr) {
      throw new ForbiddenException('Anda tidak berhak membayar pesanan ini.');
    }

    if (order.status !== OrderStatus.pending_payment) {
      throw new BadRequestException(
        `Pesanan tidak dapat dibayar karena status saat ini: ${order.status}`,
      );
    }

    const secretKey = process.env.XENDIT_SECRET_KEY;
    if (!secretKey) {
      throw new BadRequestException(
        'Konfigurasi XENDIT_SECRET_KEY belum diatur di server.',
      );
    }

    const amount = Number(order.totalPrice);
    const externalId = `ORDER-${order.id.toString()}`;

    // Basic Auth Xendit: format "SECRET_KEY:" di-encode base64
    const basicAuth = Buffer.from(`${secretKey}:`).toString('base64');

    try {
      // Panggil endpoint resmi Xendit v2 Invoices
      const response = await fetch('https://api.xendit.co/v2/invoices', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basicAuth}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          external_id: externalId,
          amount: amount,
          payer_email: order.customer.email,
          description: `Pembayaran Tiket Nebeng #${order.id.toString()} (${order.type.toUpperCase()})`,
          invoice_duration: 86400, // Aktif selama 24 jam (dalam detik)
          currency: 'IDR',
          reminder_time: 1,
          success_redirect_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/customer/tickets`,
          failure_redirect_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/customer/booking`,
        }),
      });

      const rawBody = await response.text();

      if (!response.ok) {
        console.error('Xendit Invoice Creation Failed. Status:', response.status, 'Body:', rawBody);
        let errMsg = 'Gagal berkomunikasi dengan gateway Xendit';
        try {
          const parsed = JSON.parse(rawBody);
          if (parsed.message) errMsg = parsed.message;
        } catch {}
        throw new BadRequestException(
          `Gagal membuat tagihan Xendit: ${errMsg}`,
        );
      }

      const invoiceData = JSON.parse(rawBody);

      // Catat record pembayaran status 'pending' di database
      await this.prisma.payment.create({
        data: {
          orderId: order.id,
          paymentGateway: 'XENDIT',
          transactionId: invoiceData.id, // ID Invoice dari Xendit
          amount: amount,
          status: 'pending',
        },
      });

      return {
        message: 'Invoice pembayaran berhasil dibuat.',
        invoiceUrl: invoiceData.invoice_url, // URL checkout pembayaran untuk customer
        invoiceId: invoiceData.id,
        expiryDate: invoiceData.expiry_date,
        amount: amount,
      };
    } catch (error: any) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      console.error('Xendit Invoice Creation Error:', error);
      throw new BadRequestException(
        `Gagal membuat tagihan Xendit: ${error.message}`,
      );
    }
  }

  /**
   * 2. MENDENGARKAN WEBHOOK XENDIT (Dipanggil otomatis oleh server Xendit)
   */
  async handleXenditWebhook(callbackToken: string, payload: any) {
    const expectedToken = process.env.XENDIT_CALLBACK_TOKEN;

    if (!expectedToken) {
      throw new InternalServerErrorException(
        'Konfigurasi XENDIT_CALLBACK_TOKEN belum diatur di server.',
      );
    }

    if (!callbackToken) {
      throw new UnauthorizedException('Token verifikasi callback tidak valid.');
    }

    const bufA = Buffer.from(callbackToken);
    const bufB = Buffer.from(expectedToken);

    if (bufA.length !== bufB.length || !timingSafeEqual(bufA, bufB)) {
      throw new UnauthorizedException('Token verifikasi callback tidak valid.');
    }

    // Kita hanya memproses status 'PAID' (pembayaran sukses)
    if (payload.status !== 'PAID') {
      return { message: `Event status '${payload.status}' diabaikan.` };
    }

    // Ekstrak ID dari external_id
    const externalId = payload.external_id as string;
    if (!externalId) {
      throw new BadRequestException('Format external_id tidak dikenali.');
    }

    // A. Cabang Top Up Saldo Dompet
    if (externalId.startsWith('TOPUP-')) {
      const parts = externalId.split('-');
      const userIdStr = parts[1];
      const parsedUserId = this.safeParseBigInt(userIdStr);
      if (!parsedUserId) {
        throw new BadRequestException('User ID pada Top Up tidak valid.');
      }

      let wallet = await this.prisma.wallet.findUnique({
        where: { userId: parsedUserId },
      });

      if (!wallet) {
        wallet = await this.prisma.wallet.create({
          data: { userId: parsedUserId },
        });
      }

      // Validasi idempoten
      const existingTx = await this.prisma.walletTransaction.findFirst({
        where: {
          walletId: wallet.id,
          description: { contains: payload.id },
        },
      });

      if (existingTx) {
        return { message: 'Top up sudah pernah diproses sebelumnya (idempoten).' };
      }

      const amount = Number(payload.amount);
      const paymentMethod = payload.payment_method || 'XENDIT';
      const paymentChannel = payload.payment_channel || 'QRIS/VA';
      const desc = `Top Up Saldo via ${paymentMethod} (${paymentChannel}) [ID: ${payload.id}]`;

      await this.prisma.$transaction(async (tx) => {
        await tx.wallet.update({
          where: { id: wallet.id },
          data: {
            balance: { increment: amount },
          },
        });

        await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            amount,
            type: TransactionType.credit,
            description: desc,
          },
        });
      });

      await this.notificationHelper.notifyPaymentSuccess(
        userIdStr,
        amount,
      );

      return {
        message: 'Top up saldo berhasil diproses.',
        userId: userIdStr,
        amount,
      };
    }

    // B. Cabang Pembayaran Tiket Order
    const orderIdStr = externalId.startsWith('ORDER-')
      ? externalId.replace('ORDER-', '')
      : null;
    if (!orderIdStr) {
      throw new BadRequestException('Format external_id tidak dikenali.');
    }

    const parsedOrderId = this.safeParseBigInt(orderIdStr);
    if (!parsedOrderId) {
      throw new BadRequestException('ID Order tidak valid.');
    }

    const order = await this.prisma.order.findUnique({
      where: { id: parsedOrderId },
      include: { trip: true },
    });

    if (!order) {
      throw new NotFoundException(`Order ID ${orderIdStr} tidak ditemukan.`);
    }

    const adminFeePercentage = Number(order.adminFeePercentage || 10);
    const financials = computeOrderFinancials({
      subtotal: (order as any).subtotal || order.totalPrice,
      customerFee: (order as any).customerFee,
      totalPrice: order.totalPrice,
      discountAmount: (order as any).discountAmount,
      adminFeePercentage,
    });
    const mitraUserId = order.trip.mitraId.toString();

    // Validasi payload.id harus ada
    if (!payload.id) {
      throw new BadRequestException('Payload Xendit tidak menyertakan ID transaksi.');
    }

    // B. Jalankan Transaksi Atomik Kunci Escrow & Order Lunas
    await this.paymentsRepository.processCheckoutTransaction(
      orderIdStr,
      mitraUserId,
      `XENDIT_${payload.payment_method || 'QRIS'}`,
      payload.id,
      financials.customerPaid,
      financials.fee,
      financials.netMitra,
      true, // isWebhook = true untuk webhook Xendit
      ...(financials.discount > 0 || financials.customerFee > 0
        ? [financials.adminNet]
        : []),
    );

    await this.notificationHelper.notifyOrderPaid(
      order.customerId.toString(),
      orderIdStr,
      financials.customerPaid,
    );

    return {
      success: true,
      message: 'Webhook Xendit berhasil diproses. Saldo masuk ke Escrow Mitra.',
      orderId: orderIdStr,
    };
  }

  async checkInvoiceStatus(orderIdStr: string) {
    const parsedOrderId = this.safeParseBigInt(orderIdStr);
    if (!parsedOrderId) throw new BadRequestException('Invalid Order ID');

    const order = await this.prisma.order.findUnique({
      where: { id: parsedOrderId },
    });

    if (!order) throw new NotFoundException('Order tidak ditemukan');

    if (order.status === OrderStatus.paid) {
      return { status: 'PAID', message: 'Tagihan lunas terverifikasi' };
    }

    if (order.status === OrderStatus.cancelled) {
      return { status: 'CANCELLED', message: 'Pesanan telah dibatalkan' };
    }

    // Ambil record pembayaran terbaru untuk order ini
    const payment = await this.prisma.payment.findFirst({
      where: { orderId: parsedOrderId },
      orderBy: { createdAt: 'desc' },
    });

    const config = await this.getRawPaymentConfig();

    // ATURAN MUTUALLY EXCLUSIVE: Pada Opsi B (Transfer Manual & QRIS Statis),
    // sistem sama sekali TIDAK BOLEH memanggil API gateway agar tidak memicu error!
    if (
      config.activeMode === PaymentActiveMode.MANUAL ||
      payment?.paymentGateway === 'MANUAL_TRANSFER'
    ) {
      if (payment?.status === PaymentStatus.success) {
        return {
          status: 'PAID',
          message: 'Pembayaran transfer manual telah diverifikasi dan lunas!',
        };
      }
      if (payment?.status === PaymentStatus.pending) {
        return {
          status: 'PENDING_VERIFICATION',
          message: 'Bukti transfer sedang diverifikasi oleh admin / sistem',
        };
      }
      return {
        status: 'PENDING',
        message: 'Menunggu transfer bank atau scan QRIS statis pemilik',
      };
    }

    if (
      !payment ||
      !payment.transactionId ||
      payment.paymentGateway !== 'XENDIT'
    ) {
      return { status: 'PENDING', message: 'Menunggu pembayaran' };
    }

    const secretKey =
      config.gateway?.xenditSecretKey || process.env.XENDIT_SECRET_KEY || '';
    if (!secretKey) {
      return { status: 'PENDING', message: 'Menunggu pembayaran' };
    }
    const basicAuth = Buffer.from(`${secretKey}:`).toString('base64');

    try {
      const response = await fetch(
        `https://api.xendit.co/v2/invoices/${payment.transactionId}`,
        {
          headers: { Authorization: `Basic ${basicAuth}` },
        },
      );
      const data = await response.json();

      if (data.status === 'PAID' || data.status === 'SETTLED') {
        // Trigger manual sinkronisasi sama seperti Webhook
        await this.handleXenditWebhook(
          config.gateway?.xenditCallbackToken ||
            process.env.XENDIT_CALLBACK_TOKEN ||
            '',
          {
            status: 'PAID',
            external_id: `ORDER-${order.id.toString()}`,
            payment_method: data.payment_method || 'MANUAL_SYNC',
            id: data.id,
          },
        );
        return {
          status: 'PAID',
          message: 'Sinkronisasi berhasil, tagihan lunas!',
        };
      }

      return { status: data.status, message: 'Belum dibayar' };
    } catch {
      return { status: 'ERROR', message: 'Gagal mengecek status ke Xendit' };
    }
  }
}
