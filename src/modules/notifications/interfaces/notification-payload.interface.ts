export interface NotificationPayload {
  title: string;
  body: string;
  data?: Record<string, any>;
  imageUrl?: string;
  senderName?: string;
}

export interface SendNotificationOptions {
  userId: string;
  type: string;
  payload: NotificationPayload;
  deviceId?: string;
}

export interface DeviceTokenDto {
  token: string;
  platform?: string;
}

export interface NotificationPreferenceDto {
  enablePushNotifications?: boolean;
  enableEmailNotifications?: boolean;
  orderNotifications?: boolean;
  tripNotifications?: boolean;
  chatNotifications?: boolean;
  paymentNotifications?: boolean;
  promotionNotifications?: boolean;
}
