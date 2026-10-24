import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ChatRepository } from './repository/chat.repository';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { ChatMapper } from './mappers/chat.mapper';
import { ChatGateway } from './chat.gateway';
import { TripStatus } from '../../generated/prisma/enums';
import { NotificationHelperService } from '../notifications/notification-helper.service';
import { PushService } from '../notifications/push.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private readonly useWebPush: boolean;

  constructor(
    private readonly chatRepository: ChatRepository,
    private readonly prisma: PrismaService,
    private readonly chatGateway: ChatGateway,
    private readonly notificationHelper: NotificationHelperService,
    private readonly pushService: PushService,
    private readonly configService: ConfigService,
  ) {
    this.useWebPush = this.configService.get<string>('USE_WEB_PUSH', 'false') === 'true';
    this.logger.log(`Web Push enabled: ${this.useWebPush}`);
  }

  private safeParseBigInt(id: string): bigint | null {
    try {
      return BigInt(id);
    } catch {
      return null;
    }
  }

  async getOrCreateConversation(
    currentUserId: string,
    dto: CreateConversationDto,
  ) {
    const parsedTripId = this.safeParseBigInt(dto.tripId);
    if (!parsedTripId) {
      throw new BadRequestException('Format ID Trip tidak valid.');
    }

    const trip = await this.prisma.trip.findUnique({
      where: { id: parsedTripId },
    });

    if (!trip) {
      throw new NotFoundException('Trip tidak ditemukan');
    }

    const isMitra = trip.mitraId.toString() === currentUserId;
    const targetCustomerId = isMitra ? dto.customerId : currentUserId;

    if (!targetCustomerId) {
      throw new BadRequestException(
        'Mitra wajib menyertakan ID Customer untuk membuka obrolan.',
      );
    }

    if (!isMitra && dto.customerId && dto.customerId !== currentUserId) {
      throw new ForbiddenException(
        'Anda tidak diperbolehkan membuat percakapan atas nama pengguna lain.',
      );
    }

    let conversation =
      await this.chatRepository.findConversationByTripAndCustomer(
        dto.tripId,
        targetCustomerId,
      );

    if (!conversation) {
      conversation = await this.chatRepository.createConversation({
        tripIdStr: dto.tripId,
        customerIdStr: targetCustomerId,
        mitraIdStr: trip.mitraId.toString(),
      });
    }

    if (!conversation) {
      throw new NotFoundException('Gagal membuat atau menemukan percakapan');
    }

    const unreadCount = await this.chatRepository.countUnreadMessages(
      conversation.id.toString(),
      currentUserId,
    );

    return ChatMapper.toConversationResponse({
      ...conversation,
      unreadCount,
    });
  }

  async getUserConversation(currentUserId: string) {
    const conversations =
      await this.chatRepository.getUserConversations(currentUserId);

    const mappedConversations = await Promise.all(
      conversations.map(async (conv) => {
        const unreadCount = await this.chatRepository.countUnreadMessages(
          conv.id.toString(),
          currentUserId,
        );
        return ChatMapper.toConversationResponse({
          ...conv,
          unreadCount,
        });
      }),
    );

    return mappedConversations;
  }

  async sendMessage(
    currentUserId: string,
    conversationId: string,
    dto: SendMessageDto,
  ) {
    const conversation =
      await this.chatRepository.findConversationById(conversationId);

    if (!conversation) {
      throw new NotFoundException('Percakapan tidak ditemukan');
    }

    if (
      conversation.customerId.toString() !== currentUserId &&
      conversation.mitraId.toString() !== currentUserId
    ) {
      throw new ForbiddenException(
        'Akses ditolak. Anda bukan anggota percakapan ini.',
      );
    }

    if (
      conversation.isLocked ||
      conversation.trip.status === TripStatus.completed ||
      conversation.trip.status === TripStatus.cancelled
    ) {
      if (!conversation.isLocked) {
        await this.chatRepository.lockConversation(conversationId);
      }
      throw new BadRequestException(
        'Percakapan telah dikunci karena trip telah selesai atau dibatalkan',
      );
    }

    // Rate Limiting: 15 detik jeda per pesan dari pengguna yang sama dalam percakapan ini
    const lastUserMessage = await this.prisma.message.findFirst({
      where: {
        conversationId: BigInt(conversationId),
        senderId: BigInt(currentUserId),
      },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });

    if (lastUserMessage) {
      const elapsedSeconds = (Date.now() - new Date(lastUserMessage.createdAt).getTime()) / 1000;
      const cooldownSeconds = 15;
      if (elapsedSeconds < cooldownSeconds) {
        const remainingSeconds = Math.ceil(cooldownSeconds - elapsedSeconds);
        throw new BadRequestException(
          `Mohon tunggu ${remainingSeconds} detik sebelum mengirim pesan berikutnya untuk menghindari spam.`,
        );
      }
    }

    const message = await this.chatRepository.createMessage({
      conversationIdStr: conversationId,
      senderIdStr: currentUserId,
      messageText: dto.messageText,
    });

    const responsePayload = ChatMapper.toMessageResponse(message);

    this.chatGateway.emitNewMessage(conversationId, responsePayload);

    const recipientId =
      conversation.customerId.toString() === currentUserId
        ? conversation.mitraId.toString()
        : conversation.customerId.toString();

    const senderName = conversation.customerId.toString() === currentUserId
      ? conversation.customer.name
      : conversation.mitra.name;

    // Send in-app socket notification
    try {
      await this.notificationHelper.notifyChatMessage(
        recipientId,
        conversationId,
        senderName,
      );
    } catch (notifErr: any) {
      // Don't let notification errors fail the message sending
      console.error('[Chat] Failed to send chat notification:', notifErr?.message || notifErr);
    }

    // Send web push if recipient is not online in the conversation room
    try {
      if (!this.useWebPush) {
        this.logger.log(`[Chat] Web Push disabled via USE_WEB_PUSH flag, skipping web push`);
        return responsePayload;
      }

      const isRecipientOnline = this.chatGateway.isUserInConversationRoom(
        recipientId,
        conversationId,
      );

      this.logger.log(`[Chat] Recipient ${recipientId} in conversation room: ${isRecipientOnline}`);

      if (!isRecipientOnline) {
        const messagePreview = dto.messageText.length > 100
          ? dto.messageText.substring(0, 100) + '...'
          : dto.messageText;

        this.logger.log(`[Chat] Sending web push to user ${recipientId}`);
        await this.pushService.sendToUser(BigInt(recipientId), {
          title: senderName,
          body: messagePreview,
          url: `/chat/${conversationId}`,
          tag: `chat-${conversationId}`,
        });
      } else {
        this.logger.log(`[Chat] Skipping web push - recipient is online in conversation room`);
      }
    } catch (pushErr: any) {
      // Don't let push notification errors fail the message sending
      console.error('[Chat] Failed to send push notification:', pushErr?.message || pushErr);
    }

    return responsePayload;
  }

  async getMessages(currentUserId: string, conversationId: string) {
    const conversation =
      await this.chatRepository.findConversationById(conversationId);

    if (!conversation) {
      throw new NotFoundException('Percakapan tidak ditemukan.');
    }

    if (
      conversation.customerId.toString() !== currentUserId &&
      conversation.mitraId.toString() !== currentUserId
    ) {
      throw new ForbiddenException(
        'Akses ditolak. Anda bukan anggota percakapan ini',
      );
    }

    await this.chatRepository.markMessagesAsRead(conversationId, currentUserId);
    const messages =
      await this.chatRepository.getMessagesByConversation(conversationId);
    return messages.map((msg) => ChatMapper.toMessageResponse(msg));
  }
}
