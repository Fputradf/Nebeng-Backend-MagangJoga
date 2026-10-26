import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
  ApiResponse,
} from '@nestjs/swagger';
import { TripsService } from './trips.service';
import { CreateTripDto } from './dto/create-trip.dto';
import { QueryTripDto } from './dto/query-trip.dto';
import { UpdateTripDto } from './dto/update-trip.dto';
import { CancelTripByMitraDto } from './dto/cancel-trip-by-mitra.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../generated/prisma/enums';
import { GetUser } from '../../common/decorators/get-user.decorators';

@ApiTags('Trips')
@Controller('trips')
export class TripsController {
  constructor(private readonly tripsService: TripsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.mitra)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Buat jadwal Trip baru (Mitra Terverifikasi)' })
  @ApiResponse({ status: 201, description: 'Jadwal trip berhasil dibuat' })
  @ApiResponse({
    status: 403,
    description: 'Mitra belum terverifikasi atau kendaraan bukan milik anda',
  })
  @ApiResponse({
    status: 400,
    description: 'Pos asal dan pos tujuan tidak boleh sama',
  })
  async createTrip(@GetUser('id') userId: string, @Body() dto: CreateTripDto) {
    return this.tripsService.createTrip(String(userId), dto);
  }

  @Get()
  @ApiOperation({ summary: 'Pencarian & Listing Trip (Publik / Customer)' })
  @ApiResponse({ status: 200, description: 'Daftar Trip ditemukan' })
  async getTrips(@Query() query: QueryTripDto, @GetUser('id') userId?: string) {
    return this.tripsService.getTrips(
      query,
      userId ? String(userId) : undefined,
    );
  }

  @Get('me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.mitra)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Daftar Trip milik Mitra yang sedang login' })
  @ApiResponse({
    status: 200,
    description: 'Daftar trip mitra berhasil diambil',
  })
  async getMyTrips(
    @GetUser('id') userId: string,
    @Query() query: QueryTripDto,
  ) {
    return this.tripsService.getTripsByMitra(String(userId), query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detail Trip berdasarkan ID' })
  @ApiResponse({ status: 200, description: 'Detail trip ditemukan' })
  @ApiResponse({ status: 404, description: 'Trip tidak ditemukan' })
  async getTripById(@Param('id') id: string) {
    return this.tripsService.getTripById(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.mitra)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update detail / status Trip (Mitra Owner Only)' })
  @ApiResponse({ status: 200, description: 'Trip berhasil diperbarui' })
  @ApiResponse({
    status: 403,
    description: 'Anda tidak berhak mengubah trip orang lain',
  })
  @ApiResponse({ status: 404, description: 'Trip tidak ditemukan' })
  async updateTrip(
    @Param('id') id: string,
    @GetUser('id') userId: string,
    @Body() dto: UpdateTripDto,
  ) {
    return this.tripsService.updateTrip(id, String(userId), dto);
  }

  @Post(':id/cancel-by-mitra')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.mitra)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Pembatalan Trip oleh Mitra (Fase 10 - Sebelum Jadwal)' })
  @ApiResponse({ status: 200, description: 'Trip berhasil dibatalkan dan diproses secara idempotent' })
  @ApiResponse({ status: 403, description: 'Mitra bukan pemilik trip' })
  @ApiResponse({ status: 400, description: 'Trip tidak dapat dibatalkan atau dialihkan ke admin review' })
  async cancelByMitra(
    @Param('id') id: string,
    @GetUser('id') userId: string,
    @Body() dto: CancelTripByMitraDto,
  ) {
    return this.tripsService.cancelByMitra(id, String(userId), dto);
  }
}
