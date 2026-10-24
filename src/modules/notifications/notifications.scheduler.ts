import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationsRepository } from './repository/notifications.repository';

@Injectable()
export class NotificationsScheduler {
  private readonly logger = new Logger(NotificationsScheduler.name);

  constructor(private readonly notificationsRepository: NotificationsRepository) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanupOldNotifications() {
    try {
      this.logger.log('Starting cleanup of old notification logs...');

      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

      const deletedCount = await this.notificationsRepository.deleteOldNotificationLogs(
        threeMonthsAgo,
      );

      this.logger.log(
        `Cleanup completed. Deleted ${deletedCount} notification logs older than 3 months.`,
      );
    } catch (error: any) {
      this.logger.error(`Failed to cleanup old notifications: ${error.message}`);
    }
  }
}
