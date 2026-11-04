import { Module } from '@nestjs/common';
import { DisbursementBanksController } from './disbursement-banks.controller';
import { DisbursementBanksService } from './disbursement-banks.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [DisbursementBanksController],
  providers: [DisbursementBanksService],
  exports: [DisbursementBanksService],
})
export class DisbursementBanksModule {}

