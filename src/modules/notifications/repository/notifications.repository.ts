import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { NotificationType, NotificationStatus } from '../../../generated/prisma/enums';

@Injectable()
export class NotificationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createDeviceToken(
    userId: string,
    token: string,
    platform: string = 'android',
    userAgent?: string,
  ) {
    return this.prisma.deviceToken.upsert({
      where: { token },
      update: {
        userId: BigInt(userId),
        platform,
        userAgent,
        isActive: true,
        lastUsedAt: new Date(),
        updatedAt: new Date(),
      },
      create: {
        userId: BigInt(userId),
        token,
        platform,
        userAgent,
        isActive: true,
        lastUsedAt: new Date(),
      },
    });
  }

  async getActiveDeviceTokens(userId: string) {
    return this.prisma.deviceToken.findMany({
      where: {
        userId: BigInt(userId),
        isActive: true,
      },
      orderBy: {
        lastUsedAt: 'desc',
      },
    });
  }

  async deactivateDeviceToken(token: string) {
    return this.prisma.deviceToken.update({
      where: { token },
      data: {
        isActive: false,
        updatedAt: new Date(),
      },
    });
  }

  async deactivateAllUserTokens(userId: string) {
    return this.prisma.deviceToken.updateMany({
      where: {
        userId: BigInt(userId),
        isActive: true,
      },
      data: {
        isActive: false,
        updatedAt: new Date(),
      },
    });
  }

  async deactivateOtherDeviceTokens(userId: string, currentToken: string, userAgent: string) {
    // Deactivate all other tokens for the same user and user agent (same device)
    return this.prisma.deviceToken.updateMany({
      where: {
        userId: BigInt(userId),
        token: { not: currentToken },
        userAgent: userAgent,
        isActive: true,
      },
      data: {
        isActive: false,
        updatedAt: new Date(),
      },
    });
  }

  async getNotificationPreference(userId: string) {
    return this.prisma.notificationPreference.findUnique({
      where: { userId: BigInt(userId) },
    });
  }

  async createNotificationPreference(userId: string) {
    return this.prisma.notificationPreference.create({
      data: {
        userId: BigInt(userId),
      },
    });
  }

  async updateNotificationPreference(
    userId: string,
    preferences: Partial<{
      enablePushNotifications: boolean;
      enableEmailNotifications: boolean;
      orderNotifications: boolean;
      tripNotifications: boolean;
      chatNotifications: boolean;
      paymentNotifications: boolean;
      promotionNotifications: boolean;
    }>,
  ) {
    return this.prisma.notificationPreference.upsert({
      where: { userId: BigInt(userId) },
      update: preferences,
      create: {
        userId: BigInt(userId),
        ...preferences,
      },
    });
  }

  async createNotificationLog(
    userId: string,
    type: NotificationType,
    title: string,
    body: string,
    data?: string,
    deviceId?: string,
  ) {
    return this.prisma.notificationLog.create({
      data: {
        userId: BigInt(userId),
        type,
        title,
        body,
        data,
        deviceId: deviceId ? BigInt(deviceId) : null,
        status: NotificationStatus.pending,
      },
    });
  }

  async updateNotificationLogStatus(
    logId: string,
    status: NotificationStatus,
    errorMessage?: string,
  ) {
    return this.prisma.notificationLog.update({
      where: { id: BigInt(logId) },
      data: {
        status,
        errorMessage,
        sentAt: status === NotificationStatus.sent ? new Date() : null,
      },
    });
  }

  async getUserNotificationLogs(
    userId: string,
    limit: number = 50,
    offset: number = 0,
  ) {
    return this.prisma.notificationLog.findMany({
      where: { userId: BigInt(userId) },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });
  }

  async cleanupInvalidTokens(invalidTokens: string[]) {
    if (invalidTokens.length === 0) return;

    return this.prisma.deviceToken.updateMany({
      where: {
        token: { in: invalidTokens },
      },
      data: {
        isActive: false,
        updatedAt: new Date(),
      },
    });
  }

  async deleteOldNotificationLogs(beforeDate: Date): Promise<number> {
    const result = await this.prisma.notificationLog.deleteMany({
      where: {
        createdAt: {
          lt: beforeDate,
        },
      },
    });

    return result.count;
  }

  // User Notification methods
  async getUserNotifications(
    userId: string,
    type?: string,
    limit: number = 20,
    offset: number = 0,
  ) {
    const where: any = {
      userId: BigInt(userId),
    };

    if (type) {
      where.type = type;
    }

    return this.prisma.userNotification.findMany({
      where,
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
      skip: offset,
    });
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.prisma.userNotification.count({
      where: {
        userId: BigInt(userId),
        isRead: false,
      },
    });
  }

  async getUnreadCountByType(userId: string): Promise<Record<string, number>> {
    const results = await this.prisma.userNotification.groupBy({
      by: ['type'],
      where: {
        userId: BigInt(userId),
        isRead: false,
      },
      _count: {
        type: true,
      },
    });

    const counts: Record<string, number> = {
      total: 0,
      chat_message: 0,
    };

    results.forEach((result) => {
      counts[result.type] = result._count.type;
      counts.total += result._count.type;
    });

    return counts;
  }

  async markAsRead(notificationId: string): Promise<void> {
    await this.prisma.userNotification.update({
      where: { id: BigInt(notificationId) },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });
  }

  async markAllAsRead(userId: string): Promise<void> {
    await this.prisma.userNotification.updateMany({
      where: {
        userId: BigInt(userId),
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });
  }

  async markConversationAsRead(userId: string, conversationId: string): Promise<void> {
    await this.prisma.userNotification.updateMany({
      where: {
        userId: BigInt(userId),
        conversationId: BigInt(conversationId),
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });
  }
}
