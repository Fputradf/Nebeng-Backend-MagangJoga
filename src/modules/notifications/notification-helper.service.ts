import { Injectable, Logger } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationType } from '../../generated/prisma/enums';

@Injectable()
export class NotificationHelperService {
  private readonly logger = new Logger(NotificationHelperService.name);

  constructor(private readonly notificationsService: NotificationsService) {}

  async notifyOrderCreated(userId: string, orderId: string, tripDetails: any) {
    return this.notificationsService.sendNotification({
      userId,
      type: NotificationType.order_created,
      payload: {
        title: 'Pesanan Berhasil Dibuat',
        body: `Pesanan #${orderId} untuk perjalanan Anda telah dibuat. Silakan lakukan pembayaran.`,
        data: {
          orderId,
          type: 'order_created',
        },
      },
    });
  }

  async notifyOrderPaid(userId: string, orderId: string) {
    return this.notificationsService.sendNotification({
      userId,
      type: NotificationType.order_paid,
      payload: {
        title: 'Pembayaran Berhasil',
        body: `Pembayaran untuk pesanan #${orderId} telah berhasil. Tiket Anda telah diterbitkan.`,
        data: {
          orderId,
          type: 'order_paid',
        },
      },
    });
  }

  async notifyTripBookingRequest(mitraId: string, orderId: string, customerName: string) {
    return this.notificationsService.sendNotification({
      userId: mitraId,
      type: NotificationType.trip_booking_request,
      payload: {
        title: 'Booking Baru',
        body: `${customerName} telah melakukan booking untuk perjalanan Anda.`,
        data: {
          orderId,
          type: 'trip_booking_request',
        },
      },
    });
  }

  async notifyTripStarted(userId: string, tripId: string) {
    return this.notificationsService.sendNotification({
      userId,
      type: NotificationType.trip_started,
      payload: {
        title: 'Perjalanan Dimulai',
        body: 'Perjalanan Anda telah dimulai. Selamat menikmati perjalanan!',
        data: {
          tripId,
          type: 'trip_started',
        },
      },
    });
  }

  async notifyCheckpointScanned(userId: string, checkpointType: string, location: string) {
    const message =
      checkpointType === 'checkin_origin'
        ? 'Anda telah check-in di pos asal.'
        : 'Anda telah check-in di pos tujuan.';

    return this.notificationsService.sendNotification({
      userId,
      type: NotificationType.checkpoint_scanned,
      payload: {
        title: 'Check-in Berhasil',
        body: `${message} Lokasi: ${location}`,
        data: {
          checkpointType,
          type: 'checkpoint_scanned',
        },
      },
    });
  }

  async notifyChatMessage(userId: string, conversationId: string, senderName: string) {
    this.logger.log(`[Chat Notification] Sending to userId: ${userId}, conversationId: ${conversationId}, sender: ${senderName}`);
    return this.notificationsService.sendNotification({
      userId,
      type: NotificationType.chat_message,
      payload: {
        title: 'Pesan Baru',
        body: `${senderName} mengirim pesan baru.`,
        data: {
          conversationId,
          type: 'chat_message',
        },
        senderName,
      },
    });
  }

  async notifyPaymentSuccess(userId: string, amount: number) {
    return this.notificationsService.sendNotification({
      userId,
      type: NotificationType.payment_success,
      payload: {
        title: 'Pembayaran Berhasil',
        body: `Pembayaran sebesar Rp ${amount.toLocaleString()} telah berhasil.`,
        data: {
          amount,
          type: 'payment_success',
        },
      },
    });
  }

  async notifyEscrowReleased(mitraId: string, amount: number, orderId: string) {
    return this.notificationsService.sendNotification({
      userId: mitraId,
      type: NotificationType.escrow_released,
      payload: {
        title: 'Dana Escrow Diterima',
        body: `Dana sebesar Rp ${amount.toLocaleString()} dari pesanan #${orderId} telah diterima ke wallet Anda.`,
        data: {
          orderId,
          amount,
          type: 'escrow_released',
        },
      },
    });
  }

  async notifyRewardEarned(userId: string, points: number, description: string) {
    return this.notificationsService.sendNotification({
      userId,
      type: NotificationType.reward_earned,
      payload: {
        title: 'Poin Reward Diterima',
        body: `Anda mendapatkan ${points} poin! ${description}`,
        data: {
          points,
          type: 'reward_earned',
        },
      },
    });
  }

  async notifyVerificationApproved(userId: string, verificationType: string) {
    return this.notificationsService.sendNotification({
      userId,
      type: NotificationType.verification_approved,
      payload: {
        title: 'Verifikasi Disetujui',
        body: `Verifikasi ${verificationType} Anda telah disetujui.`,
        data: {
          verificationType,
          type: 'verification_approved',
        },
      },
    });
  }

  async notifyVerificationRejected(userId: string, verificationType: string, reason: string) {
    return this.notificationsService.sendNotification({
      userId,
      type: NotificationType.verification_rejected,
      payload: {
        title: 'Verifikasi Ditolak',
        body: `Verifikasi ${verificationType} Anda ditolak. Alasan: ${reason}`,
        data: {
          verificationType,
          type: 'verification_rejected',
        },
      },
    });
  }

  async notifyNoShowMarked(userId: string, orderId: string, posName?: string) {
    return this.notificationsService.sendNotification({
      userId,
      type: NotificationType.order_cancelled,
      payload: {
        title: 'Tiket Dinyatakan No-Show',
        body: `Tiket #${orderId} telah ditandai no-show di pos ${posName || ''}. Tiket hangus.`,
        data: {
          orderId,
          type: 'order_cancelled',
        },
      },
    });
  }

  async notifyMitraNoShow(userId: string, tripId: string) {
    return this.notificationsService.sendNotification({
      userId,
      type: NotificationType.order_cancelled,
      payload: {
        title: 'Mitra Dinyatakan No-Show',
        body: `Perjalanan #${tripId} telah dibatalkan karena Mitra dinyatakan no-show.`,
        data: {
          tripId,
          type: 'order_cancelled',
        },
      },
    });
  }
  async notifyTripCancelledByMitra(
    userId: string,
    tripId: string,
    refundAmount: number,
    compensationPoints: number,
    originPosName: string,
    destPosName: string,
    departureDate: string,
  ) {
    const pointsInfo =
      compensationPoints > 0
        ? ` serta kompensasi +${compensationPoints} poin reward.`
        : '.';
    const formattedAmount = refundAmount.toLocaleString('id-ID');

    return this.notificationsService.sendNotification({
      userId,
      type: NotificationType.order_cancelled,
      payload: {
        title: 'Trip #' + tripId + ' Dibatalkan Mitra',
        body: 'Trip #' + tripId + ' dibatalkan oleh mitra. Dana Rp ' + formattedAmount + ' sudah dikembalikan ke wallet Anda' + pointsInfo,
        data: {
          tripId,
          refundAmount,
          compensationPoints,
          originPosName,
          destPosName,
          departureDate,
          action: 'SEARCH_REPLACEMENT',
          type: 'trip_cancelled_by_mitra',
        },
      },
    });
  }

  async notifyMitraCancellationSanction(
    mitraId: string,
    tripId: string,
    deductedScore: number,
    remainingScore: number,
    isSuspended: boolean,
    suspendedUntil?: Date | null,
  ) {
    const suspendText = isSuspended
      ? ` Akun Anda ditangguhkan sementara hingga ${suspendedUntil ? suspendedUntil.toLocaleDateString('id-ID') : 'pemberitahuan selanjutnya'}.`
      : '';

    return this.notificationsService.sendNotification({
      userId: mitraId,
      type: NotificationType.generic,
      payload: {
        title: 'Pembatalan Trip #' + tripId + ' Berhasil',
        body: 'Trip #' + tripId + ' telah dibatalkan. Sanksi diterapkan: -' + deductedScore + ' skor reputasi (Sisa skor: ' + remainingScore + ').' + suspendText + ' Anda dapat mengajukan banding jika memiliki bukti kendala darurat.',
        data: {
          tripId,
          deductedScore,
          remainingScore,
          isSuspended,
          type: 'mitra_sanction_applied',
        },
      },
    });
  }
}