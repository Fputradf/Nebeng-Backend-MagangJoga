import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';

@Injectable()
export class WsJwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(WsJwtAuthGuard.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const client: Socket = context.switchToWs().getClient<Socket>();

      const token =
        client.handshake?.auth?.token ||
        client.handshake?.headers?.authorization?.split(' ')[1];

      this.logger.log(`[WS_AUTH] Checking auth for client: ${client.id}`);
      this.logger.log(`[WS_AUTH] Token found: ${!!token}`);

      if (!token) {
        this.logger.error(`[WS_AUTH] No token provided for client: ${client.id}`);
        throw new WsException('Token autentikasi WebSocket tidak ditemukan.');
      }

      const secret = this.configService.get<string>('JWT_SECRET');
      if (!secret) {
        this.logger.error(`[WS_AUTH] JWT_SECRET not configured`);
        throw new WsException(
          'Konfigurasi server bermasalah (JWT_SECRET kosong).',
        );
      }

      const payload = await this.jwtService.verifyAsync(token, { secret });
      this.logger.log(`[WS_AUTH] Auth successful for user: ${payload.sub || payload.id}`);

      (client as any).user = payload;
      return true;
    } catch (error: any) {
      this.logger.error(`[WS_AUTH] Auth failed: ${error.message}`);
      throw new WsException(
        'Sesi WebSocket tidak valid atau telah kedaluwarsa.',
      );
    }
  }
}
