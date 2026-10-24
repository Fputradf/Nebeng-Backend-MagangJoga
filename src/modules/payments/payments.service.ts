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
import { OrderStatus, Role, ServiceType } from '../../generated/prisma/enums';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { NotificationHelperService } from '../notifications/notification-helper.service';

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

    const transactionId = `TRX-${randomBytes(4).toString('hex').toUpperCase()}`;
    const totalPrice = Number(order.totalPrice);

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

    const adminFeeAmount = Math.round((totalPrice * adminFeePercentage) / 100);
    const netMitraAmount = totalPrice - adminFeeAmount;

    const mitraUserId = order.trip.mitraId.toString();

    const { payment } =
      await this.paymentsRepository.processCheckoutTransaction(
        dto.orderId,
        mitraUserId,
        dto.paymentGateway,
        transactionId,
        totalPrice,
        adminFeeAmount,
        netMitraAmount,
      );

    await this.notificationHelper.notifyOrderPaid(
      userIdStr,
      dto.orderId,
    );

    await this.notificationHelper.notifyPaymentSuccess(
      userIdStr,
      totalPrice,
    );

    return {
      message:
        'Pembayaran berhasil dikonfirmasi dan dana telah ditahan oleh Escrow System.',
      payment: {
        id: payment.id.toString(),
        transactionId: payment.transactionId,
        amount: Number(payment.amount),
        adminFeeAmount,
        netMitraAmount,
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

    const secretKey = process.env.XENDIT_SECRET_KEY || 'xnd_development_dummy';
    const amount = Number(order.totalPrice);
    const externalId = `ORDER-${order.id.toString()}`;

    // Mock for local testing with dummy key
    if (secretKey.includes('dummy')) {
      const invoiceId = `dummy_inv_${Date.now()}`;

      // Catat record pembayaran status 'pending' di database
      await this.prisma.payment.create({
        data: {
          orderId: order.id,
          paymentGateway: 'XENDIT_DUMMY',
          transactionId: invoiceId,
          amount: amount,
          status: 'pending',
        },
      });

      // Langsung simulasikan webhook Xendit untuk memproses Escrow & mengubah status tiket
      await this.handleXenditWebhook(process.env.XENDIT_CALLBACK_TOKEN || '', {
        status: 'PAID',
        external_id: externalId,
        payment_method: 'DUMMY',
        id: invoiceId,
      });

      return {
        message: 'Pembayaran simulasi berhasil (Dummy Mode).',
        invoiceUrl: '/customer/tickets', // Frontend akan redirect ke sini
        invoiceId: invoiceId,
        expiryDate: new Date(Date.now() + 86400000).toISOString(),
        amount: amount,
      };
    }

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

      const invoiceData = await response.json();

      if (!response.ok) {
        throw new Error(
          invoiceData.message || 'Gagal berkomunikasi dengan gateway Xendit',
        );
      }

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

    if (callbackToken !== expectedToken) {
      throw new UnauthorizedException('Token verifikasi callback tidak valid.');
    }

    // Kita hanya memproses status 'PAID' (pembayaran sukses)
    if (payload.status !== 'PAID') {
      return { message: `Event status '${payload.status}' diabaikan.` };
    }

    // Ekstrak ID Order dari external_id (contoh: "ORDER-12" -> "12")
    const externalId = payload.external_id as string;
    const orderIdStr = externalId ? externalId.replace('ORDER-', '') : null;
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

    // Idempotency: Jika order sudah dibayar sebelumnya, jangan proses ulang
    if (order.status === OrderStatus.paid) {
      return { message: 'Order sudah berstatus PAID sebelumnya.' };
    }

    const totalPrice = Number(order.totalPrice);
    const adminFeePercentage = Number(order.adminFeePercentage || 10);
    const adminFeeAmount = Math.round((totalPrice * adminFeePercentage) / 100);
    const netMitraAmount = totalPrice - adminFeeAmount;
    const mitraUserId = order.trip.mitraId.toString();

    // B. Jalankan Transaksi Atomik Kunci Escrow
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const result = await this.paymentsRepository.processCheckoutTransaction(
      orderIdStr,
      mitraUserId,
      `XENDIT_${payload.payment_method || 'QRIS'}`,
      payload.id || `TRX-${Date.now()}`,
      totalPrice,
      adminFeeAmount,
      netMitraAmount,
    );

    // C. Buat sesi QR Check-in Pos Asal (ORIGIN) untuk tiket ini
    const tokenExpiry = new Date(Date.now() + 48 * 60 * 60 * 1000);
    await this.prisma.orderQrSession.create({
      data: {
        orderId: order.id,
        qrToken: order.qrCodeTicket,
        scanPhase: 'checkin_origin',
        isUsed: false,
        expiredAt: tokenExpiry,
      },
    });

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
