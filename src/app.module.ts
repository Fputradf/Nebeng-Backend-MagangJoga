import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';

import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';

import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/users/users.module';
import { DriverVerificationsModule } from './modules/verifications/verifications.module';
import { RegionsModule } from './modules/regions/region.module';
import { PickupPointsModule } from './modules/pickup-points/pickup-points.module';
import { VehiclesModule } from './modules/vehicles/vehicles.module';
import { TripsModule } from './modules/trips/trips.module';
import { OrdersModule } from './modules/orders/orders.module';
import { WalletsModule } from './modules/wallets/wallets.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { CheckpointsModule } from './modules/checkpoints/checkpoints.module';
import { ChatModule } from './modules/chat/chat.module';
import { ReviewModule } from './modules/reviews/reviews.module';
import { RewardsModule } from './modules/rewards/rewards.module';
import { AdminModule } from './modules/admin/admin.module';
import { TrackingModule } from './modules/tracking/tracking.module';
import { UploadController } from './upload.controller';
import { MerchandiseModule } from './modules/merchandises/merchandise.module';
import { BannersModule } from './modules/banners/banners.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { VouchersModule } from './modules/vouchers/vouchers.module';
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 300,
      },
    ]),
    PrismaModule,
    UserModule,
    AuthModule,
    DriverVerificationsModule,
    RegionsModule,
    PickupPointsModule,
    VehiclesModule,
    TripsModule,
    OrdersModule,
    WalletsModule,
    PaymentsModule,
    CheckpointsModule,
    ChatModule,
    ReviewModule,
    RewardsModule,
    AdminModule,
    TrackingModule,
    MerchandiseModule,
    BannersModule,
    NotificationsModule,
    VouchersModule,
  ],
  controllers: [AppController, UploadController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
