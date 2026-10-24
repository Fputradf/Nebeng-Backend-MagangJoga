import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsRepository } from './repository/notifications.repository';
import { FirebaseService } from './firebase.service';
import { NotificationHelperService } from './notification-helper.service';
import { NotificationsScheduler } from './notifications.scheduler';
import { NotificationsGateway } from './notifications.gateway';
import { PushService } from './push.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    PrismaModule,
    ScheduleModule.forRoot(),
    AuthModule, // Import AuthModule untuk menggunakan JwtModule yang sama
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const expiresIn = configService.get<string>('JWT_EXPIRES_IN') || '1d';
        return {
          secret:
            configService.get<string>('JWT_SECRET') || 'nebeng_secret_key',
          signOptions: {
            expiresIn: expiresIn as any,
          },
        };
      },
    }),
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationsRepository,
    FirebaseService,
    NotificationHelperService,
    NotificationsScheduler,
    NotificationsGateway,
    PushService,
  ],
  exports: [NotificationsService, NotificationHelperService, NotificationsGateway, PushService],
})
export class NotificationsModule {}
