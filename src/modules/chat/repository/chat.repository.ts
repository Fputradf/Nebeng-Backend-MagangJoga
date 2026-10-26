import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class ChatRepository {
  constructor(private readonly prisma: PrismaService) {}

  private safeParseBigInt(id: string): bigint | null {
    try {
      return BigInt(id);
    } catch {
      return null;
    }
  }

  async findConversationByTripAndCustomer(
    tripIdStr: string,
    customerIdStr: string,
  ) {
    const parsedTripId = this.safeParseBigInt(tripIdStr);
    const parsedCustomerId = this.safeParseBigInt(customerIdStr);

    if (!parsedTripId || !parsedCustomerId) return null;

    return this.prisma.conversation.findFirst({
      where: {
        tripId: parsedTripId,
        customerId: parsedCustomerId,
      },
      include: {
        trip: {
          include: {
            originPoint: true,
            destinationPoint: true,
          },
        },
        customer: true,
        mitra: true,
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
  }

  async createConversation(data: {
    tripIdStr: string;
    customerIdStr: string;
    mitraIdStr: string;
  }) {
    const parsedTripId = this.safeParseBigInt(data.tripIdStr);
    const parsedCustomerId = this.safeParseBigInt(data.customerIdStr);
    const parsedMitraId = this.safeParseBigInt(data.mitraIdStr);

    if (!parsedTripId || !parsedCustomerId || !parsedMitraId) {
      throw new BadRequestException(
        'Format ID Trip, Customer, atau Mitra tidak valid',
      );
    }

    return this.prisma.conversation.create({
      data: {
        tripId: parsedTripId,
        customerId: parsedCustomerId,
        mitraId: parsedMitraId,
        isLocked: false,
      },
      include: {
        trip: {
          include: {
            originPoint: true,
            destinationPoint: true,
          },
        },
        customer: true,
        mitra: true,
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
  }

  async getUserConversations(userIdStr: string) {
    const parsedUserId = this.safeParseBigInt(userIdStr);
    if (!parsedUserId) return [];

    return this.prisma.conversation.findMany({
      where: {
        OR: [{ customerId: parsedUserId }, { mitraId: parsedUserId }],
      },
      include: {
        trip: {
          include: {
            originPoint: true,
            destinationPoint: true,
          },
        },
        customer: true,
        mitra: true,
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findConversationById(idStr: string) {
    const parsedId = this.safeParseBigInt(idStr);
    if (!parsedId) return null;

    return this.prisma.conversation.findUnique({
      where: { id: parsedId },
      include: {
        trip: {
          include: {
            originPoint: true,
            destinationPoint: true,
          },
        },
        customer: true,
        mitra: true,
      },
    });
  }

  async createMessage(data: {
    conversationIdStr: string;
    senderIdStr: string;
    messageText: string;
  }) {
    const parsedConversationId = this.safeParseBigInt(data.conversationIdStr);
    const parsedSenderId = this.safeParseBigInt(data.senderIdStr);

    if (!parsedConversationId || !parsedSenderId) {
      throw new BadRequestException(
        'Format ID Conversation atau Sender tidak valid',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const message = await tx.message.create({
        data: {
          conversationId: parsedConversationId,
          senderId: parsedSenderId,
          messageText: data.messageText,
        },
        include: {
          sender: true,
        },
      });

      await tx.conversation.update({
        where: { id: parsedConversationId },
        data: { updatedAt: new Date() },
      });

      return message;
    });
  }

  async getMessagesByConversation(conversationIdStr: string) {
    const parsedConversationId = this.safeParseBigInt(conversationIdStr);
    if (!parsedConversationId) return [];

    return this.prisma.message.findMany({
      where: { conversationId: parsedConversationId },
      include: { sender: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async markMessagesAsRead(conversationIdStr: string, userIdStr: string) {
    const parsedConversationId = this.safeParseBigInt(conversationIdStr);
    const parsedUserId = this.safeParseBigInt(userIdStr);

    if (!parsedConversationId || !parsedUserId) return;

    return this.prisma.message.updateMany({
      where: {
        conversationId: parsedConversationId,
        senderId: { not: parsedUserId },
        readAt: null,
      },
      data: {
        readAt: new Date(),
      },
    });
  }

  async countUnreadMessages(
    conversationIdStr: string,
    userIdStr: string,
  ): Promise<number> {
    const parsedConversationId = this.safeParseBigInt(conversationIdStr);
    const parsedUserId = this.safeParseBigInt(userIdStr);

    if (!parsedConversationId || !parsedUserId) return 0;

    return this.prisma.message.count({
      where: {
        conversationId: parsedConversationId,
        senderId: { not: parsedUserId },
        readAt: null,
      },
    });
  }

  async lockConversation(conversationIdStr: string) {
    const parsedConversationId = this.safeParseBigInt(conversationIdStr);
    if (!parsedConversationId) return;

    return this.prisma.conversation.update({
      where: { id: parsedConversationId },
      data: { isLocked: true },
    });
  }
}
