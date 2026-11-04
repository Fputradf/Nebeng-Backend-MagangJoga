import { TripMapper } from '../../trips/mappers/trip.mapper';

export class OrderMapper {
  static toResponse(order: any) {
    if (!order) return null;

    return {
      id: order.id.toString(),
      tripId: order.tripId ? order.tripId.toString() : null,
      customerId: order.customerId ? order.customerId.toString() : null,
      type: order.type,
      seatsBooked: Number(order.seatsBooked),
      totalItemsCount: Number(order.totalItemsCount),
      totalWeightKg: Number(order.totalWeightKg),
      subtotal: order.subtotal ? Number(order.subtotal) : Number(order.totalPrice),
      discountAmount: order.discountAmount ? Number(order.discountAmount) : 0,
      voucherCode: order.voucherCode ?? null,
      totalPrice: Number(order.totalPrice),
      adminFeePercentage: order.adminFeePercentage
        ? Number(order.adminFeePercentage)
        : 10,
      qrCodeTicket: order.qrCodeTicket,
      otpClaim: order.otpClaim ?? null,
      readinessStatus: order.readinessStatus ?? null,
      status: order.status,
      escrowStatus: order.escrowStatus,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      trip: order.trip ? TripMapper.toResponse(order.trip) : undefined,
      customer: order.customer
        ? {
            id: order.customer.id.toString(),
            name: order.customer.name,
            phone: order.customer.phone,
            email: order.customer.email,
          }
        : undefined,
      passengers: order.passengers
        ? order.passengers.map((p: any) => ({
            id: p.id ? p.id.toString() : undefined,
            name: p.name,
            phone: p.phone,
            seatNumber: p.seatNumber ? Number(p.seatNumber) : undefined,
            isContact: Boolean(p.isContact),
          }))
        : [],
      itemOrders: order.itemOrders
        ? order.itemOrders.map((item: any) => ({
            id: item.id.toString(),
            orderId: item.orderId.toString(),
            itemName: item.itemName,
            itemCategory: item.itemCategory,
            quantity: Number(item.quantity),
            weightPerItemKg: Number(item.weightPerItemKg),
            totalItemWeightKg: Number(item.totalItemWeightKg),
            sizeEnum: item.sizeEnum,
            photoUrl: item.photoUrl ?? null,
            securitySealQr: item.securitySealQr ?? null,
            recipientName: item.recipientName,
            recipientPhone: item.recipientPhone,
          }))
        : [],
      checkpointsLogs: [
        ...(order.trip?.checkpointsLogs
          ? order.trip.checkpointsLogs.map((log: any) => ({
              id: log.id.toString(),
              scanType: log.scanType,
              posName: log.pos?.name || 'Pos Checkpoint',
              posAddress: log.pos?.address || '',
              operatorName: log.scannedByUser?.name || 'Petugas Pos',
              createdAt: log.createdAt,
              isTripLog: true,
            }))
          : []),
        ...(order.checkpointsLogs
          ? order.checkpointsLogs.map((log: any) => ({
              id: log.id.toString(),
              scanType: log.scanType,
              posName: log.pos?.name || 'Pos Checkpoint',
              posAddress: log.pos?.address || '',
              operatorName: log.scannedByUser?.name || 'Petugas Pos',
              createdAt: log.createdAt,
              isTripLog: false,
            }))
          : []),
      ].sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      ),
    };
  }

  static toResponseList(orders: any[]) {
    return orders.map((o) => this.toResponse(o));
  }
}
