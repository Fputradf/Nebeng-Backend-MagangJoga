import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger, UseGuards } from '@nestjs/common';
import { WsJwtAuthGuard } from '../auth/guards/ws-jwt.guard';
import { ChatRepository } from './repository/chat.repository';

@Injectable()
@UseGuards(WsJwtAuthGuard)
@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: 'chats',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(ChatGateway.name);

  constructor(private readonly chatRepository: ChatRepository) {}

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join_conversation')
  async handleJoinRoom(
    @ConnectedSocket() client: any,
    @MessageBody() data: { conversationId: string },
  ) {
    if (!data?.conversationId) {
      return {
        status: 'error',
        message: 'Parameter conversationId wajib diisi.',
      };
    }

    const currentUserId = String(client.user?.id || client.user?.sub);
    const conversation = await this.chatRepository.findConversationById(
      data.conversationId,
    );

    if (!conversation) {
      return { status: 'error', message: 'Percakapan tidak ditemukan.' };
    }

    if (
      conversation.customerId.toString() !== currentUserId &&
      conversation.mitraId.toString() !== currentUserId
    ) {
      return { status: 'error', message: 'Anda bukan anggota percakapan ini.' };
    }

    const roomName = `conversation_${data.conversationId}`;
    client.join(roomName);
    this.logger.log(
      `Client ${client.id} (User: ${currentUserId}) joined room: ${roomName}`,
    );
    return { event: 'joined_room', room: roomName };
  }

  @SubscribeMessage('leave_conversation')
  handleLeaveRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    if (!data?.conversationId) return;
    const roomName = `conversation_${data.conversationId}`;
    client.leave(roomName);
    this.logger.log(`Client ${client.id} left room: ${roomName}`);
  }

  emitNewMessage(conversationId: string, messagePayload: any) {
    if (this.server) {
      const roomName = `conversation_${conversationId}`;
      this.server.to(roomName).emit('new_message', messagePayload);
    }
  }

  isUserInConversationRoom(userId: string, conversationId: string): boolean {
    try {
      if (!this.server) return false;
      const roomName = `conversation_${conversationId}`;

      // For namespace: try adapter directly first, then fallback to sockets.adapter
      const adapter = (this.server as any).adapter || (this.server.sockets as any)?.adapter;
      if (!adapter) return false;

      const room = adapter.rooms.get(roomName);
      if (!room) return false;

      // Iterate through socket IDs in the room
      for (const socketId of room) {
        // Get socket from the appropriate map
        const socket = (this.server.sockets as any).get(socketId);
        if (socket) {
          const socketUserId = String(socket?.user?.id || socket?.user?.sub);
          if (socketUserId === userId) return true;
        }
      }
      return false;
    } catch (error) {
      this.logger.error(`[ChatGateway] Error checking user in room: ${error.message}`);
      return false; // Return false on error so push will still be sent
    }
  }
}
