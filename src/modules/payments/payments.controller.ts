import {
  Body,
  Controller,
  Get,
  Post,
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

@ApiTags('Payments')
@Controller('payments') // <-- Hapus @UseGuards di sini agar tidak memblokir webhook
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

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
