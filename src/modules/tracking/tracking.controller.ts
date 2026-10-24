import {
  Controller,
  Get,
  Post,
  Query,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { TrackingService } from './tracking.service';
import { TrackingCronService } from './tracking.cron';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../../generated/prisma/enums';

@Controller('tracking')
export class TrackingController {
  constructor(
    private readonly trackingService: TrackingService,
    private readonly trackingCronService: TrackingCronService,
  ) {}

  /**
   * Calculate route between two points using OSRM
   * Public endpoint (no auth required for flexibility)
   */
  @Get('route')
  @HttpCode(HttpStatus.OK)
  async calculateRoute(
    @Query('originLat') originLat: string,
    @Query('originLng') originLng: string,
    @Query('destLat') destLat: string,
    @Query('destLng') destLng: string,
  ) {
    if (!originLat || !originLng || !destLat || !destLng) {
      return {
        status: 'error',
        message: 'Parameter originLat, originLng, destLat, destLng wajib diisi',
      };
    }

    const route = await this.trackingService.calculateRoute(
      parseFloat(originLat),
      parseFloat(originLng),
      parseFloat(destLat),
      parseFloat(destLng),
    );

    return {
      status: 'success',
      data: route,
    };
  }

  /**
   * Get Estimated Time of Arrival for a trip
   * Requires authentication
   */
  @Get('eta/:tripId')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async getETA(@Param('tripId') tripId: string) {
    const eta = await this.trackingService.getEstimatedTimeOfArrival(tripId);
    return {
      status: 'success',
      data: eta,
    };
  }

  /**
   * Check geofencing - is vehicle near destination?
   * Requires authentication
   */
  @Get('geofence/:tripId')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async checkGeofencing(@Param('tripId') tripId: string) {
    const geofence = await this.trackingService.checkGeofencing(tripId);
    return {
      status: 'success',
      data: geofence,
    };
  }

  /**
   * Detect route deviation
   * Requires authentication
   */
  @Get('deviation/:tripId')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async detectDeviation(@Param('tripId') tripId: string) {
    const deviation = await this.trackingService.detectRouteDeviation(tripId);
    return {
      status: 'success',
      data: deviation,
    };
  }

  /**
   * Get GPS tracking history for a trip
   * Requires authentication
   */
  @Get('history/:tripId')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async getTripHistory(@Param('tripId') tripId: string) {
    const history = await this.trackingService.getTripHistory(tripId);
    return {
      status: 'success',
      data: history,
    };
  }

  /**
   * Geocode address to coordinates
   * Public endpoint
   */
  @Get('geocode')
  @HttpCode(HttpStatus.OK)
  async geocode(@Query('address') address: string) {
    if (!address) {
      return {
        status: 'error',
        message: 'Parameter address wajib diisi',
      };
    }

    const result = await this.trackingService.geocodeAddress(address);
    return {
      status: 'success',
      data: result,
    };
  }

  /**
   * Reverse geocode coordinates to address
   * Public endpoint
   */
  @Get('reverse-geocode')
  @HttpCode(HttpStatus.OK)
  async reverseGeocode(
    @Query('lat') lat: string,
    @Query('lng') lng: string,
  ) {
    if (!lat || !lng) {
      return {
        status: 'error',
        message: 'Parameter lat dan lng wajib diisi',
      };
    }

    const result = await this.trackingService.reverseGeocode(
      parseFloat(lat),
      parseFloat(lng),
    );
    return {
      status: 'success',
      data: result,
    };
  }

  /**
   * Manual trigger cleanup old GPS data and route cache
   * Admin only
   */
  @Post('cleanup')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.admin, Role.regional)
  @HttpCode(HttpStatus.OK)
  async cleanupOldData() {
    const result = await this.trackingCronService.triggerManualCleanup();
    return {
      status: 'success',
      message: 'Cleanup GPS data dan route cache berhasil',
      data: result,
    };
  }
}
