import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TrackingGateway } from './tracking.gateway';
import { TrackingService } from './tracking.service';
import { TrackingRepository } from './tracking.repository';
import { OsmService } from './osm.service';
import { TrackingController } from './tracking.controller';
import { TrackingCronService } from './tracking.cron';
import { PrismaModule } from '../../prisma/prisma.module';
import { WsJwtAuthGuard } from '../auth/guards/ws-jwt.guard';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    PrismaModule,
    ScheduleModule.forRoot(),
    AuthModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const secret =
          configService.get<string>('JWT_SECRET') || 'super-secret-key';
        const expiresIn = configService.get<string>('JWT_EXPIRES_IN') || '1d';

        return {
          secret,
          signOptions: {
            expiresIn: expiresIn as any,
          },
        };
      },
    }),
  ],
  controllers: [TrackingController],
  providers: [
    TrackingGateway,
    TrackingService,
    TrackingRepository,
    OsmService,
    TrackingCronService,
    WsJwtAuthGuard,
  ],
  exports: [TrackingService, TrackingGateway, OsmService],
})
export class TrackingModule {}
