import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import webpush from 'web-push';
import { ConfigService } from '@nestjs/config';

interface PushSubscriptionInput {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  icon?: string;
}

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly vapidPublicKey?: string;
  private readonly vapidPrivateKey?: string;
  private readonly vapidSubject: string;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {
    this.vapidPublicKey = this.configService.get<string>('VAPID_PUBLIC_KEY');
    this.vapidPrivateKey = this.configService.get<string>('VAPID_PRIVATE_KEY');
    this.vapidSubject = this.configService.get<string>('VAPID_SUBJECT', 'mailto:admin@nebeng.com') || 'mailto:admin@nebeng.com';

    // Configure VAPID
    if (this.vapidPublicKey && this.vapidPrivateKey) {
      webpush.setVapidDetails(
        this.vapidSubject,
        this.vapidPublicKey,
        this.vapidPrivateKey,
      );
      this.logger.log('VAPID configured successfully');
    } else {
      this.logger.warn('VAPID keys not configured. Push notifications will not work.');
    }
  }

  getPublicKey(): string {
    if (!this.vapidPublicKey) {
      throw new BadRequestException('VAPID public key not configured');
    }
    return this.vapidPublicKey;
  }

  async subscribe(
    userId: bigint,
    subscription: PushSubscriptionInput,
    userAgent?: string,
  ): Promise<void> {
    // Check if endpoint already exists for another user
    const existing = await this.prisma.pushSubscription.findUnique({
      where: { endpoint: subscription.endpoint },
    });

    if (existing) {
      if (existing.userId !== userId) {
        // Move subscription to new user
        await this.prisma.pushSubscription.update({
          where: { endpoint: subscription.endpoint },
          data: {
            userId,
            p256dh: subscription.keys.p256dh,
            auth: subscription.keys.auth,
            userAgent,
            lastUsedAt: new Date(),
          },
        });
        this.logger.log(`Moved subscription from user ${existing.userId} to user ${userId}`);
      } else {
        // Update existing subscription
        await this.prisma.pushSubscription.update({
          where: { endpoint: subscription.endpoint },
          data: {
            p256dh: subscription.keys.p256dh,
            auth: subscription.keys.auth,
            userAgent,
            lastUsedAt: new Date(),
          },
        });
        this.logger.log(`Updated subscription for user ${userId}`);
      }
    } else {
      // Create new subscription
      await this.prisma.pushSubscription.create({
        data: {
          userId,
          endpoint: subscription.endpoint,
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
          userAgent,
          lastUsedAt: new Date(),
        },
      });
      this.logger.log(`Created new subscription for user ${userId}`);
    }
  }

  async unsubscribe(userId: bigint, endpoint: string): Promise<void> {
    await this.prisma.pushSubscription.deleteMany({
      where: {
        userId,
        endpoint,
      },
    });
    this.logger.log(`Unsubscribed user ${userId} from endpoint ${endpoint}`);
  }

  async unsubscribeAll(userId: bigint): Promise<void> {
    await this.prisma.pushSubscription.deleteMany({
      where: { userId },
    });
    this.logger.log(`Unsubscribed all subscriptions for user ${userId}`);
  }

  async sendToUser(userId: bigint, payload: PushPayload): Promise<void> {
    if (!this.vapidPublicKey || !this.vapidPrivateKey) {
      this.logger.warn('VAPID not configured, skipping push notification');
      return;
    }

    this.logger.log(`[Push] Attempting to send push to user ${userId}`);

    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: { userId },
    });

    if (subscriptions.length === 0) {
      this.logger.log(`[Push] No subscriptions found for user ${userId}`);
      return;
    }

    this.logger.log(`[Push] Found ${subscriptions.length} subscription(s) for user ${userId}`);

    const pushPayload = JSON.stringify({
      title: payload.title,
      body: payload.body,
      data: {
        url: payload.url,
      },
      tag: payload.tag,
      icon: payload.icon || '/icon-192.png',
    });

    for (const subscription of subscriptions) {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
          },
          pushPayload,
        );

        // Update last used
        await this.prisma.pushSubscription.update({
          where: { id: subscription.id },
          data: { lastUsedAt: new Date() },
        });

        this.logger.log(`[Push] Push sent to user ${userId} via ${subscription.endpoint}`);
      } catch (error: any) {
        if (error.statusCode === 404 || error.statusCode === 410) {
          // Subscription is invalid or expired, delete it
          await this.prisma.pushSubscription.delete({
            where: { id: subscription.id },
          });
          this.logger.warn(`[Push] Deleted invalid subscription ${subscription.id} for user ${userId}`);
        } else {
          // Log other errors but don't fail the operation
          this.logger.error(`[Push] Failed to send push to user ${userId}: ${error.message}`);
        }
      }
    }
  }
}
