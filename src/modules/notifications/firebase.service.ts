import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

@Injectable()
export class FirebaseService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseService.name);
  private messaging: any;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    await this.initializeFirebase();
  }

  private async initializeFirebase() {
    try {
      const privateKey = this.configService.get<string>('FIREBASE_PRIVATE_KEY');
      const clientEmail = this.configService.get<string>('FIREBASE_CLIENT_EMAIL');
      const projectId = this.configService.get<string>('FIREBASE_PROJECT_ID');

      if (!privateKey || !clientEmail || !projectId) {
        this.logger.warn(
          'Firebase credentials not configured. Push notifications will be disabled.',
        );
        return;
      }

      // Prevent double initialization
      if (getApps().length > 0) {
        this.messaging = getMessaging();
        this.logger.log('Firebase Admin SDK already initialized');
        return;
      }

      // Convert escaped newlines back to actual newlines
      const formattedPrivateKey = privateKey.replace(/\\n/g, '\n');

      initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey: formattedPrivateKey,
        }),
      });

      this.messaging = getMessaging();
      this.logger.log('Firebase Admin SDK initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Firebase Admin SDK:', error);
    }
  }

  async sendToDevice(
    token: string,
    title: string,
    body: string,
    data?: Record<string, any>,
    imageUrl?: string,
  ): Promise<boolean> {
    if (!this.messaging) {
      this.logger.warn('Firebase not initialized, skipping notification');
      return false;
    }

    try {
      const message: any = {
        token,
        notification: {
          title,
          body,
          ...(imageUrl && { imageUrl }),
        },
        data: data ? this.sanitizeData(data) : undefined,
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
            },
          },
        },
      };

      await this.messaging.send(message);
      this.logger.log(`Notification sent successfully to token: ${token.substring(0, 20)}...`);
      return true;
    } catch (error: any) {
      if (error.code === 'messaging/registration-token-not-registered') {
        this.logger.warn(`Token not registered: ${token.substring(0, 20)}...`);
        throw new Error('TOKEN_INVALID');
      }
      this.logger.error(`Failed to send notification: ${error.message}`);
      return false;
    }
  }

  async sendMulticast(
    tokens: string[],
    title: string,
    body: string,
    data?: Record<string, any>,
    imageUrl?: string,
  ): Promise<{ success: number; failure: number; invalidTokens: string[] }> {
    if (!this.messaging || tokens.length === 0) {
      return { success: 0, failure: 0, invalidTokens: [] };
    }

    try {
      const message: any = {
        tokens,
        notification: {
          title,
          body,
          ...(imageUrl && { imageUrl }),
        },
        data: data ? this.sanitizeData(data) : undefined,
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
            },
          },
        },
      };

      const response = await this.messaging.sendEachForMulticast(message);
      this.logger.log(
        `Multicast notification: ${response.successCount} success, ${response.failureCount} failure`,
      );

      // Log individual token errors
      response.responses.forEach((resp: any, idx: number) => {
        if (!resp.success) {
          this.logger.error(`FCM failed for token ${idx}: ${resp.error?.code} - ${resp.error?.message}`);
        }
      });

      const invalidTokens: string[] = [];
      response.responses.forEach((resp: any, idx: number) => {
        if (
          resp.error?.code === 'messaging/registration-token-not-registered' ||
          resp.error?.code === 'messaging/invalid-registration-token'
        ) {
          invalidTokens.push(tokens[idx]);
          this.logger.warn(`Marking token ${idx} as invalid: ${tokens[idx].substring(0, 20)}...`);
        }
      });

      return {
        success: response.successCount,
        failure: response.failureCount,
        invalidTokens,
      };
    } catch (error: any) {
      this.logger.error(`Failed to send multicast notification: ${error.message}`);
      return { success: 0, failure: tokens.length, invalidTokens: [] };
    }
  }

  private sanitizeData(data: Record<string, any>): Record<string, string> {
    const sanitized: Record<string, string> = {};
    for (const [key, value] of Object.entries(data)) {
      sanitized[key] = String(value);
    }
    return sanitized;
  }

  isInitialized(): boolean {
    return !!this.messaging;
  }
}
