import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UserController } from './users.controller';
import { UserRepository } from './repositories/user.repository';
import { AdminModule } from '../admin/admin.module';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [AdminModule, PrismaModule],
  controllers: [UserController],
  providers: [UsersService, UserRepository],
  exports: [UsersService, UserRepository],
})
export class UserModule {}
