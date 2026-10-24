import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TrackingService } from './tracking.service';
import { OsmService } from './osm.service';

@Injectable()
export class TrackingCronService {
  private readonly logger = new Logger(TrackingCronService.name);

  constructor(
    private readonly trackingService: TrackingService,
    private readonly osmService: OsmService,
  ) {}

  /**
   * Cleanup old GPS tracking data
   * Runs every day at 2:00 AM
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async handleCleanupOldTrackingData() {
    this.logger.log('Starting cleanup of old GPS tracking data...');
    try {
      const result = await this.trackingService.cleanupOldTrackingData();
      this.logger.log(
        `GPS tracking data cleanup completed: ${result.deletedCount} records deleted`,
      );
    } catch (error: any) {
      this.logger.error(
        `Error during GPS tracking data cleanup: ${error.message}`,
      );
    }
  }

  /**
   * Cleanup expired route cache
   * Runs every day at 3:00 AM
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handleCleanupExpiredRouteCache() {
    this.logger.log('Starting cleanup of expired route cache...');
    try {
      const result = await this.osmService.cleanupExpiredCache();
      this.logger.log(
        `Route cache cleanup completed: ${result.deletedCount} records deleted`,
      );
    } catch (error: any) {
      this.logger.error(
        `Error during route cache cleanup: ${error.message}`,
      );
    }
  }

  /**
   * Manual trigger for testing cleanup (can be called via API)
   */
  async triggerManualCleanup() {
    this.logger.log('Manual cleanup triggered...');
    const gpsResult = await this.trackingService.cleanupOldTrackingData();
    const cacheResult = await this.osmService.cleanupExpiredCache();

    return {
      gpsCleanup: gpsResult,
      cacheCleanup: cacheResult,
    };
  }
}
