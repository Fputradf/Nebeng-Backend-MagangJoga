import {
  Body,
  Controller,
  Get,
  Post,
  Patch,
  UseGuards,
  Query,
  Headers,
  Param,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { CheckoutPaymentDto } from './dto/checkout-payment.dto';
import { GetOperatorSummaryQueryDto } from './dto/operator-summary.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../generated/prisma/enums';
import { GetUser } from '../../common/decorators/get-user.decorators';
import { CreateXenditInvoiceDto } from './dto/create-xendit-invoice.dto';
import { UpdatePaymentModeConfigDto } from './dto/payment-config.dto';
import {
  SubmitManualPaymentDto,
  VerifyManualPaymentDto,
} from './dto/submit-manual-payment.dto';

@ApiTags('Payments')
@Controller('payments') // <-- Hapus @UseGuards di sini agar tidak memblokir webhook
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  /**
   * Pengaturan Mode Pembayaran Aktif untuk Checkout UI (Publik / Customer)
   */
  @Get('config')
  @ApiOperation({
    summary: 'Mendapatkan informasi konfigurasi metode pembayaran yang sedang aktif',
  })
  async getPaymentConfig() {
    return this.paymentsService.getPaymentConfig(false);
  }

  /**
   * Panel Superadmin: Ambil Pengaturan Pembayaran Lengkap
   */
  @Get('admin/config')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.admin)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Mendapatkan seluruh konfigurasi gateway & manual untuk Superadmin',
  })
  async getPaymentConfigAdmin() {
    return this.paymentsService.getPaymentConfig(true);
  }

  /**
   * Panel Superadmin: Simpan Mode Pembayaran (Mutually Exclusive)
   */
  @Patch('admin/config')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.admin)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Memperbarui mode pembayaran tunggal mutually exclusive (Superadmin)',
  })
  async updatePaymentConfigAdmin(@Body() dto: UpdatePaymentModeConfigDto) {
    return this.paymentsService.updatePaymentConfig(dto);
  }

  /**
   * Customer: Upload Struk Bukti Transfer Manual / QRIS Statis
   */
  @Post('manual/submit')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.customer)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Customer mengirimkan struk bukti pembayaran manual & QRIS statis',
  })
  async submitManualPayment(
    @GetUser('id') userId: string,
    @Body() dto: SubmitManualPaymentDto,
  ) {
    return this.paymentsService.submitManualPayment(String(userId), dto);
  }

  /**
   * Admin: Daftar Bukti Pembayaran Manual untuk Diverifikasi
   */
  @Get('admin/manual-payments')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.admin)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Melihat daftar pembayaran manual yang butuh verifikasi (Superadmin)',
  })
  async getManualPaymentsAdmin(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query('status') status?: string,
  ) {
    return this.paymentsService.getManualPayments(Number(page), Number(limit), status);
  }

  /**
   * Admin: Verifikasi / Tolak Bukti Pembayaran Manual
   */
  @Patch('admin/manual-payments/:id/verify')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.admin)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Verifikasi atau tolak pembayaran manual order (Superadmin)',
  })
  async verifyManualPaymentAdmin(
    @GetUser('id') adminId: string,
    @Param('id') paymentId: string,
    @Body() dto: VerifyManualPaymentDto,
  ) {
    return this.paymentsService.verifyManualPayment(
      String(adminId),
      paymentId,
      dto,
    );
  }

  /**
   * 1. Checkout Simulasi PIN (Hanya Customer Login)
   */
  @Post('checkout')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.customer)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Checkout pembayaran order (Customer Only)',
  })
  @ApiResponse({ status: 201, description: 'Pembayaran berhasil dikonfirmasi' })
  async checkoutPayment(
    @GetUser('id') userId: string,
    @Body() dto: CheckoutPaymentDto,
  ) {
    return this.paymentsService.checkoutPayment(String(userId), dto);
  }

  /**
   * 2. Membuat Invoice Xendit (Hanya Customer Login)
   */
  @Post('xendit/create-invoice')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.customer)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Membuat link pembayaran Xendit Invoice / QRIS (Customer Only)',
  })
  async createXenditInvoice(
    @GetUser('id') userId: string,
    @Body() dto: CreateXenditInvoiceDto,
  ) {
    return this.paymentsService.createXenditInvoice(
      String(userId),
      dto.orderId,
    );
  }

  /**
   * 3. Webhook Callback Xendit (PUBLIK - Tidak Perlu JWT)
   * Keamanan diverifikasi melalui header 'x-callback-token'
   */
  @Post('xendit-webhook')
  @ApiOperation({
    summary: 'Webhook callback penerima konfirmasi bayar dari Xendit',
  })
  async handleXenditWebhook(
    @Headers('x-callback-token') callbackToken: string,
    @Body() payload: any,
  ) {
    return this.paymentsService.handleXenditWebhook(callbackToken, payload);
  }

  /**
   * 4. Laporan Finansial Wilayah (Admin & Regional)
   */
  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.admin, Role.regional)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Melihat daftar transaksi wilayah (Admin & Regional)',
  })
  async getPayments(
    @GetUser() currentUser: any,
    @Query('regionId') queryRegionId?: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    return this.paymentsService.getPaymentsByRegion(
      currentUser,
      queryRegionId,
      Number(page),
      Number(limit),
    );
  }

  /**
   * 5. Rekap Finansial Pos (Operator, Regional, Admin)
   */
  @Get('operator-summary')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.operator, Role.regional, Role.admin)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Melihat rekapitulasi finansial pos untuk Operator',
  })
  async getOperatorSummary(
    @GetUser('id') operatorUserId: string,
    @Query() query: GetOperatorSummaryQueryDto,
  ) {
    return this.paymentsService.getPaymentsByOperator(
      String(operatorUserId),
      query.page,
      query.limit,
      query.month,
      query.year,
    );
  }

  @Get('check-status/:orderId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.customer)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mengecek status invoice secara manual ke Xendit' })
  async checkStatus(
    @GetUser('id') userId: string,
    @Param('orderId') orderId: string,
  ) {
    return this.paymentsService.checkInvoiceStatus(orderId);
  }
}
