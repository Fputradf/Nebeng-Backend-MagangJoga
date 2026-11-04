import { Module } from '@nestjs/common';
import { CheckpointsController } from './checkpoints.controller';
import { CheckpointsService } from './checkpoints.service';
import { CheckpointsRepository } from './repository/checkpoints.repository';
import { TrackingModule } from '../tracking/tracking.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminModule } from '../admin/admin.module';

@Module({
  imports: [PrismaModule, TrackingModule, NotificationsModule, AdminModule],
  controllers: [CheckpointsController],
  providers: [CheckpointsService, CheckpointsRepository],
  exports: [CheckpointsService, CheckpointsRepository],
})
export class CheckpointsModule {}
