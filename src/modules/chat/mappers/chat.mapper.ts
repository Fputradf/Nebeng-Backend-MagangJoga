export class ChatMapper {
  static toMessageResponse(message: any) {
    if (!message) return null;

    return {
      id: message.id.toString(),
      conversationId: message.conversationId.toString(),
      senderId: message.senderId.toString(),
      messageText: message.messageText,
      readAt: message.readAt ? message.readAt.toISOString() : null,
      createdAt: message.createdAt ? message.createdAt.toISOString() : null,
      sender: message.sender
        ? {
            id: message.sender.id.toString(),
            name: message.sender.name,
            avatar: message.sender.avatar || null,
            role: message.sender.role,
          }
        : undefined,
    };
  }

  static toConversationResponse(conversation: any) {
    if (!conversation) return null;

    const messages = conversation.messages || [];
    const lastMessage =
      messages.length > 0 ? this.toMessageResponse(messages[0]) : null;

    return {
      id: conversation.id.toString(),
      tripId: conversation.tripId.toString(),
      customerId: conversation.customerId.toString(),
      mitraId: conversation.mitraId.toString(),
      isLocked: conversation.isLocked,
      createdAt: conversation.createdAt
        ? conversation.createdAt.toISOString()
        : null,
      updatedAt: conversation.updatedAt
        ? conversation.updatedAt.toISOString()
        : null,
      trip: conversation.trip
        ? {
            id: conversation.trip.id.toString(),
            status: conversation.trip.status,
            departureDate: conversation.trip.departureDate,
            depatureTime: conversation.trip.depatureTime,
            originPoint: conversation.trip.originPoint
              ? {
                  id: conversation.trip.originPoint.id.toString(),
                  name: conversation.trip.originPoint.name,
                }
              : undefined,
            destinationPoint: conversation.trip.destinationPoint
              ? {
                  id: conversation.trip.destinationPoint.id.toString(),
                  name: conversation.trip.destinationPoint.name,
                }
              : undefined,
          }
        : undefined,
      customer: conversation.customer
        ? {
            id: conversation.customer.id.toString(),
            name: conversation.customer.name,
            phone: conversation.customer.phone || null,
            avatar: conversation.customer.avatar || null,
          }
        : undefined,
      mitra: conversation.mitra
        ? {
            id: conversation.mitra.id.toString(),
            name: conversation.mitra.name,
            phone: conversation.mitra.phone || null,
            avatar: conversation.mitra.avatar || null,
          }
        : undefined,
      lastMessage: lastMessage,
      unreadCount: conversation.unreadCount ?? 0,
    };
  }
}
