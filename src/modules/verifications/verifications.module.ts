import { Module } from '@nestjs/common';
import { VerificationController } from './verification.controller';
import { VerificationService } from './verification.service';
import { VerificationRepository } from './repositories/verification.repository';
import { PrismaModule } from '../../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [VerificationController],
  providers: [VerificationService, VerificationRepository],
  exports: [VerificationService],
})
export class DriverVerificationsModule {}
