import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationsRepository } from './repository/notifications.repository';

@Injectable()
export class NotificationsScheduler {
  private readonly logger = new Logger(NotificationsScheduler.name);

  constructor(
    private readonly notificationsRepository: NotificationsRepository,
    private readonly configService: ConfigService,
  ) {}

  @Cron(process.env.NOTIFICATION_CLEANUP_CRON || CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanupOldNotifications() {
    const enabled =
      this.configService.get<string>('NOTIFICATION_CLEANUP_ENABLED', 'true') !== 'false';
    if (!enabled) {
      this.logger.debug('Notification cleanup cron is disabled via config.');
      return;
    }

    const rawMonths = Number(
      this.configService.get<string>('NOTIFICATION_RETENTION_MONTHS', '3'),
    );
    const retentionMonths = Number.isFinite(rawMonths) && rawMonths > 0 ? rawMonths : 3;
    const cleanupUserNotifications =
      this.configService.get<string>('NOTIFICATION_CLEANUP_USER_NOTIFICATIONS', 'true') !==
      'false';

    try {
      this.logger.log(
        `Starting cleanup of notifications older than ${retentionMonths} month(s)...`,
      );

      const cutoffDate = new Date();
      cutoffDate.setMonth(cutoffDate.getMonth() - retentionMonths);

      const deletedLogsCount =
        await this.notificationsRepository.deleteOldNotificationLogs(cutoffDate);

      let deletedUserNotifsCount = 0;
      if (cleanupUserNotifications) {
        deletedUserNotifsCount =
          await this.notificationsRepository.deleteOldUserNotifications(cutoffDate);
      }

      this.logger.log(
        `Cleanup completed. Deleted ${deletedLogsCount} notification logs and ${deletedUserNotifsCount} user notifications older than ${retentionMonths} month(s).`,
      );
    } catch (error: any) {
      this.logger.error(`Failed to cleanup old notifications: ${error.message}`);
    }
  }
}
