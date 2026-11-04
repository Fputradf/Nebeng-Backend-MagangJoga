import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { VouchersController } from './vouchers.controller';
import { VouchersAdminController } from './vouchers-admin.controller';
import { VouchersService } from './vouchers.service';
import { VouchersRepository } from './repository/vouchers.repository';

@Module({
  imports: [PrismaModule],
  controllers: [VouchersController, VouchersAdminController],
  providers: [VouchersService, VouchersRepository],
  exports: [VouchersService, VouchersRepository],
})
export class VouchersModule {}

