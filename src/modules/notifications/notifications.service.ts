import { Injectable, Logger } from '@nestjs/common';
import { NotificationsRepository } from './repository/notifications.repository';
import { FirebaseService } from './firebase.service';
import { NotificationType } from '../../generated/prisma/enums';
import { SendNotificationOptions, NotificationPayload } from './interfaces/notification-payload.interface';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsGateway } from './notifications.gateway';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly prisma: PrismaService;
  private readonly useFCM: boolean;

  constructor(
    private readonly notificationsRepository: NotificationsRepository,
    private readonly firebaseService: FirebaseService,
    private readonly notificationsGateway: NotificationsGateway,
    prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.prisma = prisma;
    this.useFCM = this.configService.get<string>('USE_FCM', 'true') === 'true';
    this.logger.log(`FCM enabled: ${this.useFCM}`);
  }

  async registerDevice(userId: string, token: string, platform: string = 'android', userAgent?: string) {
    try {
      // Deduplication: Deactivate all other tokens for the same user and user agent
      if (userAgent) {
        await this.notificationsRepository.deactivateOtherDeviceTokens(userId, token, userAgent);
      }

      await this.notificationsRepository.createDeviceToken(userId, token, platform);

      // Ensure notification preference exists and push notifications are enabled
      let preference = await this.notificationsRepository.getNotificationPreference(userId);
      if (!preference) {
        await this.notificationsRepository.createNotificationPreference(userId);
        await this.notificationsRepository.updateNotificationPreference(userId, {
          enablePushNotifications: true,
          enableEmailNotifications: false,
          orderNotifications: true,
          tripNotifications: true,
          chatNotifications: true,
          paymentNotifications: true,
          promotionNotifications: true,
        });
      } else if (!preference.enablePushNotifications) {
        // Enable push notifications if they were disabled
        await this.notificationsRepository.updateNotificationPreference(userId, {
          enablePushNotifications: true,
        });
      }

      this.logger.log(`Device registered for user ${userId} with push notifications enabled`);
      return { success: true, message: 'Device registered successfully' };
    } catch (error: any) {
      this.logger.error(`Failed to register device: ${error.message}`);
      throw error;
    }
  }

  async unregisterDevice(userId: string, token: string) {
    try {
      await this.notificationsRepository.deactivateDeviceToken(token);
      this.logger.log(`Device unregistered for user ${userId}`);
      return { success: true, message: 'Device unregistered successfully' };
    } catch (error: any) {
      this.logger.error(`Failed to unregister device: ${error.message}`);
      throw error;
    }
  }

  async updatePreferences(userId: string, preferences: any) {
    try {
      await this.notificationsRepository.updateNotificationPreference(userId, preferences);
      this.logger.log(`Preferences updated for user ${userId}`);
      return { success: true, message: 'Preferences updated successfully' };
    } catch (error: any) {
      this.logger.error(`Failed to update preferences: ${error.message}`);
      throw error;
    }
  }

  async getPreferences(userId: string) {
    try {
      const preference = await this.notificationsRepository.getNotificationPreference(userId);
      if (!preference) {
        await this.notificationsRepository.createNotificationPreference(userId);
        return await this.notificationsRepository.getNotificationPreference(userId);
      }
      return preference;
    } catch (error: any) {
      this.logger.error(`Failed to get preferences: ${error.message}`);
      throw error;
    }
  }

  async sendNotification(options: SendNotificationOptions): Promise<boolean> {
    const { userId, type, payload, deviceId } = options;

    try {
      this.logger.log(`[Notification] Sending to userId: ${userId}, type: ${type}`);

      let preference = await this.notificationsRepository.getNotificationPreference(userId);

      // Create preference with default enabled settings if not exists
      if (!preference) {
        this.logger.log(`[Notification] Creating default notification preference for user ${userId}`);
        preference = await this.notificationsRepository.createNotificationPreference(userId);
        // Enable all notifications by default
        await this.notificationsRepository.updateNotificationPreference(userId, {
          enablePushNotifications: true,
          enableEmailNotifications: false,
          orderNotifications: true,
          tripNotifications: true,
          chatNotifications: true,
          paymentNotifications: true,
          promotionNotifications: true,
        });
        preference = await this.notificationsRepository.getNotificationPreference(userId);
      }

      if (!preference?.enablePushNotifications) {
        this.logger.log(`Push notifications disabled for user ${userId}`);
        // Still save to UserNotification even if push is disabled
        await this.saveUserNotification(userId, type as NotificationType, payload);
        return false;
      }

      const typeEnabled = this.isNotificationTypeEnabled(preference, type as NotificationType);
      if (!typeEnabled) {
        this.logger.log(`Notification type ${type} disabled for user ${userId}`);
        // Still save to UserNotification even if type is disabled
        await this.saveUserNotification(userId, type as NotificationType, payload);
        return false;
      }

      const log = await this.notificationsRepository.createNotificationLog(
        userId,
        type as NotificationType,
        payload.title,
        payload.body,
        payload.data ? JSON.stringify(payload.data) : undefined,
        deviceId,
      );

      let deviceTokens: any[];
      if (deviceId) {
        const token = await this.prisma.deviceToken.findUnique({
          where: { id: BigInt(deviceId) },
        });
        deviceTokens = token ? [token] : [];
      } else {
        deviceTokens = await this.notificationsRepository.getActiveDeviceTokens(userId);
      }

      this.logger.log(`[Notification] Found ${deviceTokens.length} active tokens for user ${userId}`);

      if (deviceTokens.length === 0) {
        this.logger.warn(`No active device tokens for user ${userId}`);
        await this.notificationsRepository.updateNotificationLogStatus(
          log.id.toString(),
          'failed' as any,
          'No active device tokens',
        );
        // Still save to UserNotification even if no tokens
        await this.saveUserNotification(userId, type as NotificationType, payload);
        return false;
      }

      // Skip FCM if feature flag is disabled
      if (!this.useFCM) {
        this.logger.log(`[Notification] FCM disabled via USE_FCM flag, skipping FCM send`);
        await this.saveUserNotification(userId, type as NotificationType, payload);
        return true;
      }

      const tokens = deviceTokens.map((dt) => dt.token);
      this.logger.log(`[Notification] Sending FCM to ${tokens.length} tokens`);
      const result = await this.firebaseService.sendMulticast(
        tokens,
        payload.title,
        payload.body,
        payload.data,
        payload.imageUrl,
      );

      this.logger.log(`[Notification] FCM result: ${result.success} success, ${result.failure} failure`);

      if (result.invalidTokens.length > 0) {
        await this.notificationsRepository.cleanupInvalidTokens(result.invalidTokens);
      }

      // Save to UserNotification (always, regardless of FCM success)
      await this.saveUserNotification(userId, type as NotificationType, payload);

      if (result.success > 0) {
        await this.notificationsRepository.updateNotificationLogStatus(
          log.id.toString(),
          'sent' as any,
        );
        this.logger.log(`Notification sent to ${result.success} devices for user ${userId}`);
        return true;
      } else {
        await this.notificationsRepository.updateNotificationLogStatus(
          log.id.toString(),
          'failed' as any,
          'Failed to send to all devices',
        );
        return false;
      }
    } catch (error: any) {
      this.logger.error(`Failed to send notification: ${error.message}`);
      return false;
    }
  }

  private async saveUserNotification(
    userId: string,
    type: NotificationType,
    payload: NotificationPayload,
  ): Promise<void> {
    try {
      const conversationId = payload.data?.conversationId
        ? BigInt(payload.data.conversationId)
        : null;

      let notification;

      // For chat messages, group by conversationId
      if (type === NotificationType.chat_message && conversationId) {
        // Check if there's an unread notification for this conversation
        const existingNotification = await this.prisma.userNotification.findFirst({
          where: {
            userId: BigInt(userId),
            type: NotificationType.chat_message,
            conversationId,
            isRead: false,
          },
          orderBy: {
            createdAt: 'desc',
          },
        });

        if (existingNotification) {
          // Update existing notification instead of creating new one
          notification = await this.prisma.userNotification.update({
            where: { id: existingNotification.id },
            data: {
              body: `${payload.senderName || 'Seseorang'} mengirim pesan baru.`,
              data: JSON.stringify(payload.data),
              createdAt: new Date(), // Update timestamp to bring to top
            },
          });
          this.logger.log(`[Notification] Updated existing chat notification for conversation ${conversationId}`);
        } else {
          // Create new notification
          notification = await this.prisma.userNotification.create({
            data: {
              userId: BigInt(userId),
              type,
              title: payload.title,
              body: payload.body,
              data: payload.data ? JSON.stringify(payload.data) : null,
              conversationId,
              isRead: false,
            },
          });
          this.logger.log(`[Notification] Saved user notification for userId: ${userId}, type: ${type}`);
        }
      } else {
        // Create new notification for non-chat types
        notification = await this.prisma.userNotification.create({
          data: {
            userId: BigInt(userId),
            type,
            title: payload.title,
            body: payload.body,
            data: payload.data ? JSON.stringify(payload.data) : null,
            conversationId,
            isRead: false,
          },
        });
        this.logger.log(`[Notification] Saved user notification for userId: ${userId}, type: ${type}`);
      }

      // Emit realtime notification via socket.io
      if (notification) {
        const unreadCount = await this.notificationsRepository.getUnreadCount(userId);
        await this.notificationsGateway.emitNotificationToUser(
          userId,
          {
            id: notification.id.toString(),
            type: notification.type,
            title: notification.title,
            body: notification.body,
            data: notification.data ? JSON.parse(notification.data) : null,
            isRead: notification.isRead,
            conversationId: notification.conversationId?.toString(),
            createdAt: notification.createdAt,
          },
          unreadCount,
        );
      }
    } catch (error: any) {
      this.logger.error(`Failed to save user notification: ${error.message}`);
    }
  }

  async sendToSpecificDevice(
    token: string,
    title: string,
    body: string,
    data?: Record<string, any>,
    imageUrl?: string,
  ): Promise<boolean> {
    try {
      return await this.firebaseService.sendToDevice(token, title, body, data, imageUrl);
    } catch (error: any) {
      this.logger.error(`Failed to send to specific device: ${error.message}`);
      return false;
    }
  }

  async getNotificationHistory(userId: string, limit: number = 50, offset: number = 0) {
    try {
      return await this.notificationsRepository.getUserNotificationLogs(userId, limit, offset);
    } catch (error: any) {
      this.logger.error(`Failed to get notification history: ${error.message}`);
      throw error;
    }
  }

  private isNotificationTypeEnabled(preference: any, type: NotificationType): boolean {
    switch (type) {
      case NotificationType.order_created:
      case NotificationType.order_paid:
      case NotificationType.order_cancelled:
        return preference.orderNotifications;

      case NotificationType.trip_started:
      case NotificationType.trip_arrived:
      case NotificationType.trip_completed:
      case NotificationType.trip_booking_request:
        return preference.tripNotifications;

      case NotificationType.chat_message:
        return preference.chatNotifications;

      case NotificationType.payment_success:
      case NotificationType.payment_failed:
      case NotificationType.escrow_released:
        return preference.paymentNotifications;

      case NotificationType.reward_earned:
      case NotificationType.reward_redeemed:
        return preference.promotionNotifications;

      default:
        return true;
    }
  }

  // User Notification Methods
  async getUserNotifications(
    userId: string,
    type?: string,
    limit: number = 20,
    offset: number = 0,
  ) {
    try {
      const notifications = await this.notificationsRepository.getUserNotifications(
        userId,
        type,
        limit,
        offset,
      );
      return notifications.map((notif) => ({
        id: notif.id.toString(),
        type: notif.type,
        title: notif.title,
        body: notif.body,
        data: notif.data ? JSON.parse(notif.data) : null,
        isRead: notif.isRead,
        conversationId: notif.conversationId?.toString(),
        readAt: notif.readAt,
        createdAt: notif.createdAt,
      }));
    } catch (error: any) {
      this.logger.error(`Failed to get user notifications: ${error.message}`);
      throw error;
    }
  }

  async getUnreadCountByType(userId: string) {
    try {
      return await this.notificationsRepository.getUnreadCountByType(userId);
    } catch (error: any) {
      this.logger.error(`Failed to get unread count: ${error.message}`);
      throw error;
    }
  }

  async markAsRead(userId: string, notificationId: string) {
    try {
      // Verify ownership
      const notification = await this.prisma.userNotification.findUnique({
        where: { id: BigInt(notificationId) },
      });

      if (!notification || notification.userId.toString() !== userId) {
        throw new Error('Notification not found or access denied');
      }

      await this.notificationsRepository.markAsRead(notificationId);
    } catch (error: any) {
      this.logger.error(`Failed to mark notification as read: ${error.message}`);
      throw error;
    }
  }

  async markAllAsRead(userId: string) {
    try {
      await this.notificationsRepository.markAllAsRead(userId);
    } catch (error: any) {
      this.logger.error(`Failed to mark all notifications as read: ${error.message}`);
      throw error;
    }
  }

  async markConversationAsRead(userId: string, conversationId: string) {
    try {
      await this.notificationsRepository.markConversationAsRead(userId, conversationId);
    } catch (error: any) {
      this.logger.error(`Failed to mark conversation notifications as read: ${error.message}`);
      throw error;
    }
  }
}
