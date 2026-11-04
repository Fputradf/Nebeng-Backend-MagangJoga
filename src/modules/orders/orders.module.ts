import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrdersRepository } from './repository/orders.repository';
import { OrdersExpirationCron } from './orders-cancellation.cron';
import { TripsModule } from '../trips/trips.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { VouchersModule } from '../vouchers/vouchers.module';

@Module({
  imports: [PrismaModule, TripsModule, NotificationsModule, VouchersModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrdersRepository, OrdersExpirationCron],
  exports: [OrdersService, OrdersRepository, OrdersExpirationCron],
})
export class OrdersModule {}
