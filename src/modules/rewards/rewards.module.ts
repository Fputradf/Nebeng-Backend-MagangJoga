import { Module } from '@nestjs/common';
import { RewardsController } from './rewards.controller';
import { RewardsService } from './rewards.service';
import { RewardsRepository } from './repository/rewards.repository';
import { PrismaModule } from '../../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [RewardsController],
  providers: [RewardsService, RewardsRepository],
  exports: [RewardsService],
})
export class RewardsModule {}
