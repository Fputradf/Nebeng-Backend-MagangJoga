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
import { OrderStatus, Role, ServiceType, TransactionType } from '../../generated/prisma/enums';
import { randomBytes, timingSafeEqual } from 'crypto';
import * as bcrypt from 'bcrypt';
import { NotificationHelperService } from '../notifications/notification-helper.service';
import { computeOrderFinancials } from '../../common/utils/financial.util';

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
        ...(financials.discount > 0 ? [financials.adminNet] : []),
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
  ) {
    const { payments, totalItems, assignedPos } =
      await this.paymentsRepository.getPaymentsByOperator(
        operatorUserIdStr,
        page,
        limit,
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

    const totalRevenue = formattedTransactions.reduce(
      (acc, curr) => acc + curr.amount,
      0,
    );

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
   * 1. MEMBUAT INVOICE XENDIT (Dipanggil saat Customer klik Bayar)
   */
  async createXenditInvoice(currentUserIdStr: string, orderIdStr: string) {
    const parsedOrderId = this.safeParseBigInt(orderIdStr);
    if (!parsedOrderId) {
      throw new BadRequestException('ID Order tidak valid.');
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
      ...(financials.discount > 0 ? [financials.adminNet] : []),
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
      return { status: 'PAID', message: 'Sudah dibayar' };
    }

    const payment = await this.prisma.payment.findFirst({
      where: { orderId: parsedOrderId, status: 'pending' },
      orderBy: { createdAt: 'desc' },
    });

    if (
      !payment ||
      !payment.transactionId ||
      payment.paymentGateway !== 'XENDIT'
    ) {
      return { status: 'PENDING', message: 'Menunggu pembayaran' };
    }

    const secretKey = process.env.XENDIT_SECRET_KEY || '';
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
          process.env.XENDIT_CALLBACK_TOKEN || '',
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
