import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { ChatRepository } from './repository/chat.repository';
import { ChatsController } from './chat.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { WsJwtAuthGuard } from '../auth/guards/ws-jwt.guard';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    PrismaModule,
    NotificationsModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') || 'super-secret-key',
        signOptions: {
          expiresIn: (configService.get<string>('JWT_EXPIRES_IN') ||
            '1d') as any,
        },
      }),
    }),
  ],
  controllers: [ChatsController],
  providers: [ChatGateway, ChatService, ChatRepository, WsJwtAuthGuard],
  exports: [ChatService],
})
export class ChatModule {}
