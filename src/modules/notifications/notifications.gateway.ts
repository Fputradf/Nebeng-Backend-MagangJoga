import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';

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

  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
  ) {}

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

      // Check if user is regional admin, admin, or pos operator
      if (payload.role === 'regional' || payload.role === 'admin' || payload.role === 'operator') {
        const user = await this.prisma.user.findUnique({
          where: { id: BigInt(userId) },
          select: {
            regionId: true,
            role: true,
            assignedPickupPoints: { select: { id: true, regionId: true } },
          },
        });

        if (user?.regionId) {
          const regionRoom = `admin_region_${user.regionId}`;
          await client.join(regionRoom);
          this.logger.log(`Client ${client.id} joined regional room ${regionRoom}`);
        }
        if (payload.role === 'admin') {
          await client.join('role_admin');
          this.logger.log(`Admin client ${client.id} joined room role_admin`);
        }
        if (payload.role === 'operator') {
          await client.join('role_operator');
          for (const pos of user?.assignedPickupPoints || []) {
            if (pos.regionId) {
              await client.join(`admin_region_${pos.regionId}`);
            }
          }
          this.logger.log(`Operator client ${client.id} joined room role_operator`);
        }
      }
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

  // Method to emit SOS alert to regional admins, superadmins, and pos operators
  async emitSosAlertToRegion(regionId: string, sosAlert: any) {
    this.logger.log(`Emitting emergency:sos_alert to admin_region_${regionId}, role_admin, and role_operator`);
    this.server.to(`admin_region_${regionId}`).emit('emergency:sos_alert', sosAlert);
    this.server.to('role_admin').emit('emergency:sos_alert', sosAlert);
    this.server.to('role_operator').emit('emergency:sos_alert', sosAlert);
  }

  // Method to emit SOS resolved to regional admins, superadmins, pos operators, and customer
  async emitSosResolvedToRegion(regionId: string, customerId: string, sosAlert: any) {
    this.logger.log(`Emitting emergency:sos_resolved to admin_region_${regionId}, role_admin, role_operator, and user_${customerId}`);
    this.server.to(`admin_region_${regionId}`).emit('emergency:sos_resolved', sosAlert);
    this.server.to('role_admin').emit('emergency:sos_resolved', sosAlert);
    this.server.to('role_operator').emit('emergency:sos_resolved', sosAlert);
    this.server.to(`user_${customerId}`).emit('emergency:sos_resolved', sosAlert);
  }
}
