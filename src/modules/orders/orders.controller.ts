import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Patch,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
  ApiResponse,
} from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { DisputeNoShowDto } from '../checkpoints/dto/dispute-no-show.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../generated/prisma/enums';
import { GetUser } from '../../common/decorators/get-user.decorators';

@ApiTags('Orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @Roles(Role.customer)
  @ApiOperation({ summary: 'Buat pesanan baru (Passenger / Parcel Booking)' })
  @ApiResponse({ status: 201, description: 'Pesanan berhasil dibuat' })
  @ApiResponse({
    status: 400,
    description:
      'Sisa kursi/bagasi tidak mencukupi atau mencoba memesan di trip sendiri',
  })
  @ApiResponse({ status: 404, description: 'Jadwal trip tidak ditemukan' })
  async createOrder(@GetUser('id') user: string, @Body() dto: CreateOrderDto) {
    return this.ordersService.createOrder(String(user), dto);
  }

  @Get('me')
  @Roles(Role.customer)
  @ApiOperation({
    summary: 'Daftar riwayat pesanan milik Customer yang sedang login',
  })
  @ApiResponse({ status: 200, description: 'Daftar pesanan ditemukan' })
  async getMyOrders(@GetUser('id') user: string) {
    return this.ordersService.getMyOrders(String(user));
  }

  @Get(':id')
  @Roles(Role.customer, Role.mitra, Role.operator, Role.regional, Role.admin)
  @ApiOperation({
    summary: 'Detail pesanan berdasarkan ID (Dengan proteksi otorisasi)',
  })
  @ApiResponse({ status: 200, description: 'Detail pesanan ditemukan' })
  @ApiResponse({
    status: 403,
    description: 'Tidak memiliki hak akses ke order ini',
  })
  @ApiResponse({ status: 404, description: 'Order tidak ditemukan' })
  async getOrderById(@GetUser() user: any, @Param('id') id: string) {
    return this.ordersService.getOrderById(user, id);
  }

  @Patch(':id/cancel')
  @Roles(Role.customer, Role.operator, Role.regional, Role.admin)
  @ApiOperation({
    summary: 'Membatalkan pesanan dan mengembalikan kuota kursi/bagasi trip',
  })
  @ApiResponse({ status: 200, description: 'Pesanan berhasil dibatalkan' })
  @ApiResponse({
    status: 400,
    description: 'Pesanan sudah selesai/berjalan atau tidak dapat dibatalkan',
  })
  @ApiResponse({
    status: 403,
    description: 'Tidak memiliki hak akses untuk membatalkan pesanan ini',
  })
  @ApiResponse({ status: 404, description: 'Order tidak ditemukan' })
  async cancelOrder(@GetUser() user: any, @Param('id') id: string) {
    return this.ordersService.cancelOrder(user, id);
  }

  @Post(':id/dispute-no-show')
  @Roles(Role.customer)
  @ApiOperation({
    summary: 'Ajukan keberatan untuk penumpang no-show',
  })
  @ApiResponse({ status: 200, description: 'Keberatan berhasil diajukan' })
  @ApiResponse({
    status: 400,
    description: 'Jendela keberatan sudah berakhir atau order bukan no_show',
  })
  @ApiResponse({ status: 404, description: 'Order tidak ditemukan' })
  async disputeNoShow(
    @GetUser('id') user: string,
    @Param('id') id: string,
    @Body() dto: DisputeNoShowDto,
  ) {
    return this.ordersService.disputeNoShow(String(user), id, dto.reason);
  }
}
