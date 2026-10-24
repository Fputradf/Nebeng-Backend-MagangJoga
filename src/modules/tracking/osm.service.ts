import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

export interface GeocodeResult {
  lat: number;
  lng: number;
  display_name: string;
  address: {
    city?: string;
    state?: string;
    country?: string;
    postcode?: string;
  };
}

export interface RouteResult {
  distanceKm: number;
  durationMinutes: number;
  polyline: string;
  geometry: any;
}

@Injectable()
export class OsmService {
  private readonly logger = new Logger(OsmService.name);
  private readonly nominatimUrl: string;
  private readonly osrmUrl: string;
  private readonly userAgent: string;
  private readonly routeCacheDays: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.nominatimUrl =
      this.configService.get<string>('OSM_NOMINATIM_API_URL') ||
      'https://nominatim.openstreetmap.org';
    this.osrmUrl =
      this.configService.get<string>('OSRM_API_URL') ||
      'https://router.project-osrm.org';
    this.userAgent =
      this.configService.get<string>('OSM_USER_AGENT') || 'NebengApp/1.0';
    this.routeCacheDays =
      Number(this.configService.get<string>('ROUTE_CACHE_DAYS')) || 7;
  }

  /**
   * Geocoding: Alamat → Lat/Long
   */
  async geocode(address: string): Promise<GeocodeResult | null> {
    try {
      const url = `${this.nominatimUrl}/search?format=json&q=${encodeURIComponent(
        address,
      )}&limit=1`;

      const response = await fetch(url, {
        headers: {
          'User-Agent': this.userAgent,
        },
      });

      if (!response.ok) {
        throw new Error(`Nominatim API error: ${response.statusText}`);
      }

      const data = await response.json();

      if (!data || data.length === 0) {
        return null;
      }

      const result = data[0];
      return {
        lat: parseFloat(result.lat),
        lng: parseFloat(result.lon),
        display_name: result.display_name,
        address: {
          city: result.address?.city || result.address?.town,
          state: result.address?.state,
          country: result.address?.country,
          postcode: result.address?.postcode,
        },
      };
    } catch (error: any) {
      this.logger.error(`Geocoding error: ${error.message}`);
      throw new InternalServerErrorException('Gagal melakukan geocoding alamat.');
    }
  }

  /**
   * Reverse Geocoding: Lat/Long → Alamat
   */
  async reverseGeocode(lat: number, lng: number): Promise<GeocodeResult | null> {
    try {
      const url = `${this.nominatimUrl}/reverse?format=json&lat=${lat}&lon=${lng}`;

      const response = await fetch(url, {
        headers: {
          'User-Agent': this.userAgent,
        },
      });

      if (!response.ok) {
        throw new Error(`Nominatim API error: ${response.statusText}`);
      }

      const data = await response.json();

      if (!data || data.error) {
        return null;
      }

      return {
        lat: parseFloat(data.lat),
        lng: parseFloat(data.lon),
        display_name: data.display_name,
        address: {
          city: data.address?.city || data.address?.town,
          state: data.address?.state,
          country: data.address?.country,
          postcode: data.address?.postcode,
        },
      };
    } catch (error: any) {
      this.logger.error(`Reverse geocoding error: ${error.message}`);
      throw new InternalServerErrorException(
        'Gagal melakukan reverse geocoding.',
      );
    }
  }

  /**
   * Route Calculation via OSRM
   * Menggunakan cache untuk mengurangi API calls
   */
  async calculateRoute(
    originLat: number,
    originLng: number,
    destLat: number,
    destLng: number,
  ): Promise<RouteResult> {
    // Round coordinates to 6 decimal places for cache key consistency
    const roundedOriginLat = Math.round(originLat * 1e6) / 1e6;
    const roundedOriginLng = Math.round(originLng * 1e6) / 1e6;
    const roundedDestLat = Math.round(destLat * 1e6) / 1e6;
    const roundedDestLng = Math.round(destLng * 1e6) / 1e6;

    // Check cache first
    const cached = await this.prisma.osmRouteCache.findFirst({
      where: {
        originLat: roundedOriginLat,
        originLng: roundedOriginLng,
        destLat: roundedDestLat,
        destLng: roundedDestLng,
      },
    });

    if (cached && new Date(cached.expiresAt) > new Date()) {
      this.logger.log('Route found in cache');
      return {
        distanceKm: Number(cached.distanceKm),
        durationMinutes: Number(cached.durationMinutes),
        polyline: cached.polyline,
        geometry: JSON.parse(cached.polyline),
      };
    }

    // If cache expired or not found, fetch from OSRM
    try {
      const url = `${this.osrmUrl}/route/v1/driving/${originLng},${originLat};${destLng},${destLat}?overview=full&geometries=geojson`;

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`OSRM API error: ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.routes || data.routes.length === 0) {
        throw new Error('No route found');
      }

      const route = data.routes[0];
      const distanceKm = route.distance / 1000; // Convert meters to km
      const durationMinutes = route.duration / 60; // Convert seconds to minutes
      const polyline = JSON.stringify(route.geometry);

      // Cache the result
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + this.routeCacheDays);

      await this.prisma.osmRouteCache.upsert({
        where: {
          originLat_originLng_destLat_destLng: {
            originLat: roundedOriginLat,
            originLng: roundedOriginLng,
            destLat: roundedDestLat,
            destLng: roundedDestLng,
          },
        },
        update: {
          distanceKm,
          durationMinutes,
          polyline,
          expiresAt,
        },
        create: {
          originLat: roundedOriginLat,
          originLng: roundedOriginLng,
          destLat: roundedDestLat,
          destLng: roundedDestLng,
          distanceKm,
          durationMinutes,
          polyline,
          expiresAt,
        },
      });

      this.logger.log('Route calculated and cached');

      return {
        distanceKm,
        durationMinutes,
        polyline,
        geometry: route.geometry,
      };
    } catch (error: any) {
      this.logger.error(`Route calculation error: ${error.message}`);
      throw new InternalServerErrorException('Gagal menghitung rute perjalanan.');
    }
  }

  /**
   * Calculate distance between two points using Haversine formula
   */
  calculateDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): number {
    const R = 6371; // Earth's radius in km
    const dLat = this.toRad(lat2 - lat1);
    const dLng = this.toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) *
        Math.cos(this.toRad(lat2)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Calculate ETA based on distance and average speed
   */
  calculateETA(distanceKm: number, averageSpeedKmh: number = 40): number {
    if (averageSpeedKmh <= 0) return 0;
    return (distanceKm / averageSpeedKmh) * 60; // Return in minutes
  }

  /**
   * Cleanup expired route cache
   */
  async cleanupExpiredCache(): Promise<{ deletedCount: number }> {
    const result = await this.prisma.osmRouteCache.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    });

    this.logger.log(`Cleaned up ${result.count} expired route cache entries`);
    return { deletedCount: result.count };
  }

  private toRad(degrees: number): number {
    return (degrees * Math.PI) / 180;
  }
}
