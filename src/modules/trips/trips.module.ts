import { Module } from '@nestjs/common';
import { TripsController } from './trips.controller';
import { TripsService } from './trips.service';
import { TripsRepository } from './repository/trips.repository';
import { TripsExpirationCron } from './trips-expiration.cron';
import { VehiclesModule } from '../vehicles/vehicles.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminModule } from '../admin/admin.module';

@Module({
  imports: [PrismaModule, VehiclesModule, NotificationsModule, AdminModule],
  controllers: [TripsController],
  providers: [TripsService, TripsRepository, TripsExpirationCron],
  exports: [TripsService, TripsRepository, TripsExpirationCron],
})
export class TripsModule {}
