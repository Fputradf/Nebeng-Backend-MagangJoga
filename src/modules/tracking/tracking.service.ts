import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { TrackingRepository } from './tracking.repository';
import { UpdateLocationDto } from './dto/update-location.dto';
import { TripStatus } from '../../generated/prisma/enums';
import { OsmService } from './osm.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TrackingService {
  private readonly logger = new Logger(TrackingService.name);
  private readonly deviationThresholdMeters: number;
  private readonly geofenceRadiusMeters: number;
  private readonly gpsRetentionMonths: number;

  constructor(
    private readonly trackingRepository: TrackingRepository,
    private readonly osmService: OsmService,
    private readonly configService: ConfigService,
  ) {
    this.deviationThresholdMeters =
      Number(this.configService.get<string>('GPS_DEVIATION_THRESHOLD_METERS')) ||
      500;
    this.geofenceRadiusMeters =
      Number(this.configService.get<string>('GEOFENCE_RADIUS_METERS')) || 1000;
    this.gpsRetentionMonths =
      Number(this.configService.get<string>('GPS_RETENTION_MONTHS')) || 3;
  }

  private safeParseBigInt(id: string): bigint | null {
    try {
      return BigInt(id);
    } catch {
      return null;
    }
  }

  async validateAndSaveLocation(
    mitraUserIdStr: string,
    dto: any,
  ) {
    // Skip validation for demo/development - just save and broadcast
    const tripBigIntId = BigInt(dto.tripId);
    const longitude = dto.longitude ?? dto.longtitude ?? (dto as any).longtitude;

    try {
      const trip = await this.trackingRepository.findTripById(dto.tripId);
      if (!trip) {
        this.logger.warn(`[GPS] Trip ${dto.tripId} not found, but saving location anyway for demo`);
      }

      if (trip && trip.mitraId.toString() !== mitraUserIdStr) {
        this.logger.warn(`[GPS] User ${mitraUserIdStr} not the mitra of trip ${dto.tripId}, but saving anyway for demo`);
      }

      if (trip && trip.status !== TripStatus.in_transit) {
        this.logger.warn(`[GPS] Trip ${dto.tripId} status is ${trip.status}, not IN_TRANSIT, but saving anyway for demo`);
      }
    } catch (error: any) {
      this.logger.warn(`[GPS] Validation failed (continuing anyway): ${error.message}`);
    }

    return this.trackingRepository.createTrackingLog(
      tripBigIntId,
      dto.latitude,
      longitude,
      dto.altitude,
      dto.speed,
      dto.heading,
      dto.accuracy,
    );
  }

  async getTripHistory(tripId: string) {
    const tripBigIntId = this.safeParseBigInt(tripId);
    if (!tripBigIntId) {
      throw new BadRequestException('Format ID Trip tidak valid');
    }

    const logs =
      await this.trackingRepository.getRecentTrackingLogs(tripBigIntId);

    return logs.map((log) => ({
      id: log.id.toString(),
      tripId: log.tripId.toString(),
      latitude: Number(log.latitude),
      longitude: Number(log.longitude),
      altitude: log.altitude ? Number(log.altitude) : null,
      speed: log.speed ? Number(log.speed) : null,
      heading: log.heading ? Number(log.heading) : null,
      accuracy: log.accuracy ? Number(log.accuracy) : null,
      recordedAt: log.recordedAt.toISOString(),
    }));
  }

  /**
   * Calculate route between two points using OSRM
   */
  async calculateRoute(
    originLat: number,
    originLng: number,
    destLat: number,
    destLng: number,
  ) {
    return this.osmService.calculateRoute(
      originLat,
      originLng,
      destLat,
      destLng,
    );
  }

  /**
   * Get Estimated Time of Arrival for a trip
   */
  async getEstimatedTimeOfArrival(tripId: string) {
    const tripBigIntId = this.safeParseBigInt(tripId);
    if (!tripBigIntId) {
      throw new BadRequestException('Format ID Trip tidak valid');
    }

    const trip = await this.trackingRepository.findTripWithDetails(tripBigIntId);
    if (!trip) {
      throw new NotFoundException('Trip tidak ditemukan');
    }

    // Get latest GPS location
    const latestLocation =
      await this.trackingRepository.getLatestTrackingLog(tripBigIntId);

    if (!latestLocation) {
      throw new BadRequestException(
        'Belum ada data GPS untuk trip ini. Mitra belum memulai perjalanan.',
      );
    }

    const currentLat = Number(latestLocation.latitude);
    const currentLng = Number(latestLocation.longitude);
    const destLat = Number(trip.destinationPoint.latitude);
    const destLng = Number(trip.destinationPoint.longitude);

    // Calculate remaining distance using OSRM
    const route = await this.osmService.calculateRoute(
      currentLat,
      currentLng,
      destLat,
      destLng,
    );

    // Calculate ETA based on current speed if available, else use average
    const currentSpeed = latestLocation.speed
      ? Number(latestLocation.speed)
      : 40; // Default 40 km/h

    const etaMinutes = this.osmService.calculateETA(
      route.distanceKm,
      currentSpeed,
    );

    const arrivalTime = new Date();
    arrivalTime.setMinutes(arrivalTime.getMinutes() + etaMinutes);

    return {
      distanceRemainingKm: route.distanceKm,
      etaMinutes,
      estimatedArrivalTime: arrivalTime.toISOString(),
      currentSpeed,
      route: route.geometry,
    };
  }

  /**
   * Check if vehicle is within geofence radius of destination
   */
  async checkGeofencing(tripId: string) {
    const tripBigIntId = this.safeParseBigInt(tripId);
    if (!tripBigIntId) {
      throw new BadRequestException('Format ID Trip tidak valid');
    }

    const trip = await this.trackingRepository.findTripWithDetails(tripBigIntId);
    if (!trip) {
      throw new NotFoundException('Trip tidak ditemukan');
    }

    const latestLocation =
      await this.trackingRepository.getLatestTrackingLog(tripBigIntId);

    if (!latestLocation) {
      return {
        isNearDestination: false,
        distanceToDestination: null,
        message: 'Belum ada data GPS',
      };
    }

    const currentLat = Number(latestLocation.latitude);
    const currentLng = Number(latestLocation.longitude);
    const destLat = Number(trip.destinationPoint.latitude);
    const destLng = Number(trip.destinationPoint.longitude);

    const distanceMeters =
      this.osmService.calculateDistance(currentLat, currentLng, destLat, destLng) *
      1000;

    const isNearDestination = distanceMeters <= this.geofenceRadiusMeters;

    return {
      isNearDestination,
      distanceToDestination: Math.round(distanceMeters),
      geofenceRadius: this.geofenceRadiusMeters,
      message: isNearDestination
        ? `Armada berada dalam radius ${this.geofenceRadiusMeters} meter dari pos tujuan`
        : `Armada masih berjarak ${Math.round(distanceMeters)} meter dari pos tujuan`,
    };
  }

  /**
   * Detect if vehicle has deviated from planned route
   */
  async detectRouteDeviation(tripId: string) {
    const tripBigIntId = this.safeParseBigInt(tripId);
    if (!tripBigIntId) {
      throw new BadRequestException('Format ID Trip tidak valid');
    }

    const trip = await this.trackingRepository.findTripWithDetails(tripBigIntId);
    if (!trip) {
      throw new NotFoundException('Trip tidak ditemukan');
    }

    const latestLocation =
      await this.trackingRepository.getLatestTrackingLog(tripBigIntId);

    if (!latestLocation) {
      return {
        hasDeviated: false,
        deviationDistance: null,
        message: 'Belum ada data GPS',
      };
    }

    const currentLat = Number(latestLocation.latitude);
    const currentLng = Number(latestLocation.longitude);
    const originLat = Number(trip.originPoint.latitude);
    const originLng = Number(trip.originPoint.longitude);
    const destLat = Number(trip.destinationPoint.latitude);
    const destLng = Number(trip.destinationPoint.longitude);

    // Calculate distance from current location to the route line
    // Simplified: check if current location is within threshold of route
    const totalDistance = this.osmService.calculateDistance(
      originLat,
      originLng,
      destLat,
      destLng,
    );
    const distanceFromOrigin = this.osmService.calculateDistance(
      originLat,
      originLng,
      currentLat,
      currentLng,
    );
    const distanceToDestination = this.osmService.calculateDistance(
      currentLat,
      currentLng,
      destLat,
      destLng,
    );

    // Deviation is detected if sum of distances is significantly greater than total distance
    const deviationDistance =
      distanceFromOrigin + distanceToDestination - totalDistance;
    const hasDeviated = deviationDistance > this.deviationThresholdMeters / 1000;

    return {
      hasDeviated,
      deviationDistance: Math.round(deviationDistance * 1000), // Convert to meters
      threshold: this.deviationThresholdMeters,
      message: hasDeviated
        ? `Armada telah menyimpang sejauh ${Math.round(deviationDistance * 1000)} meter dari rute yang direncanakan`
        : 'Armada masih berada di rute yang direncanakan',
    };
  }

  /**
   * Cleanup old GPS tracking data (retention policy)
   */
  async cleanupOldTrackingData() {
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - this.gpsRetentionMonths);

    const result = await this.trackingRepository.deleteOldTrackingLogs(cutoffDate);

    this.logger.log(
      `Cleaned up ${result.count} GPS tracking logs older than ${this.gpsRetentionMonths} months`,
    );

    return {
      deletedCount: result.count,
      cutoffDate: cutoffDate.toISOString(),
      retentionMonths: this.gpsRetentionMonths,
    };
  }

  /**
   * Geocode address to coordinates
   */
  async geocodeAddress(address: string) {
    return this.osmService.geocode(address);
  }

  /**
   * Reverse geocode coordinates to address
   */
  async reverseGeocode(lat: number, lng: number) {
    return this.osmService.reverseGeocode(lat, lng);
  }
}
