import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: '/notifications',
})
export class NotificationsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationsGateway.name);

  constructor(private jwtService: JwtService) {}

  private extractToken(client: Socket): string | null {
    const raw =
      (client.handshake.auth?.token as string) ||
      (client.handshake.headers?.authorization as string) ||
      (client.handshake.query?.token as string) ||
      '';

    const token = raw.replace(/^Bearer\s+/i, '').trim();
    if (!token || token === 'undefined' || token === 'null') return null;
    return token;
  }

  async handleConnection(client: Socket) {
    try {
      const token = this.extractToken(client);

      if (!token) {
        this.logger.debug(`Connection rejected: No valid token provided`);
        client.disconnect(true);
        return;
      }

      this.logger.debug(`Attempting to verify token (len=${token.length})`);

      const payload = await this.jwtService.verifyAsync(token);
      const userId = payload.sub || payload.id;

      if (!userId) {
        this.logger.warn(`Connection rejected: Invalid token payload`);
        client.disconnect(true);
        return;
      }

      // Join user-specific room
      const roomName = `user_${userId}`;
      await client.join(roomName);
      this.logger.log(`Client ${client.id} joined room ${roomName}`);

      // Send initial unread count
      // This will be handled by the frontend when it connects
    } catch (error) {
      this.logger.warn(`Socket connection rejected: ${error.message}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client ${client.id} disconnected`);
  }

  // Method to emit notification to specific user
  async emitNotificationToUser(userId: string, notification: any, unreadCount: number) {
    this.server.to(`user_${userId}`).emit('notification:new', {
      notification,
      unreadCount,
    });
  }

  // Method to emit unread count update
  async emitUnreadCountUpdate(userId: string, unreadCount: number) {
    this.server.to(`user_${userId}`).emit('notification:unread-count', {
      unreadCount,
    });
  }
}
