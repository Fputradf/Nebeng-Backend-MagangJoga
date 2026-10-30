import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
  ApiResponse,
} from '@nestjs/swagger';
import { WalletsService } from './wallets.service';
import { WithdrawWalletDto } from './withdraw-wallet.dto';
import { TopUpWalletDto } from './top-up-wallet.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../generated/prisma/enums';
import { GetUser } from '../../common/decorators/get-user.decorators';

@ApiTags('Wallets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('wallets')
export class WalletsController {
  constructor(private readonly walletService: WalletsService) {}

  @Get('me')
  @ApiOperation({ summary: 'Cek saldo & riwayat dompet digital milik sendiri' })
  @ApiResponse({ status: 200, description: 'Rincian dompet ditemukan' })
  async getMyWallet(@GetUser('id') userId: string) {
    return this.walletService.getMyWallet(String(userId));
  }

  @Post('top-up')
  @Roles(Role.mitra, Role.customer, Role.admin)
  @ApiOperation({
    summary: 'Membuat invoice Xendit untuk Top Up saldo dompet digital',
  })
  @ApiResponse({
    status: 201,
    description: 'Invoice Top Up berhasil dibuat',
  })
  async topUp(
    @GetUser('id') userId: string,
    @Body() dto: TopUpWalletDto,
  ) {
    return this.walletService.createTopUpInvoice(String(userId), dto.amount);
  }

  @Get('top-up/check-status/:invoiceId')
  @Roles(Role.mitra, Role.customer, Role.admin)
  @ApiOperation({
    summary: 'Cek status pembayaran invoice Top Up ke Xendit secara manual',
  })
  async checkTopUpStatus(
    @GetUser('id') userId: string,
    @Param('invoiceId') invoiceId: string,
  ) {
    return this.walletService.checkTopUpStatus(String(userId), invoiceId);
  }

  @Post('top-up/sync')
  @Roles(Role.mitra, Role.customer, Role.admin)
  @ApiOperation({
    summary: 'Sinkronisasi otomatis seluruh status invoice Top Up dari Xendit',
  })
  async syncTopUp(
    @GetUser('id') userId: string,
  ) {
    return this.walletService.syncMyTopUps(String(userId));
  }

  @Post('withdraw')
  @Roles(Role.mitra, Role.customer)
  @ApiOperation({
    summary: 'Penarikan saldo dompet ke rekening bank terdaftar',
  })
  @ApiResponse({
    status: 200,
    description: 'Permintaan penarikan saldo berhasil',
  })
  @ApiResponse({
    status: 400,
    description: 'Saldo tidak mencukupi atau rekening belum diisi',
  })
  async withdraw(
    @GetUser('id') userId: string,
    @Body() dto: WithdrawWalletDto,
  ) {
    return this.walletService.requestWithdrawal(String(userId), dto.amount);
  }
}
