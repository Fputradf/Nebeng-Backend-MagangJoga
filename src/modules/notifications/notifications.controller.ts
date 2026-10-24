import {
  Controller,
  Post,
  Get,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationHelperService } from './notification-helper.service';
import { PushService } from './push.service';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { UpdatePreferenceDto } from './dto/update-preference.dto';
import { PushSubscribeDto, PushUnsubscribeDto } from './dto/push-subscribe.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly notificationHelper: NotificationHelperService,
    private readonly pushService: PushService,
  ) {}

  @Post('register-device')
  @HttpCode(HttpStatus.OK)
  async registerDevice(@Request() req, @Body() registerDeviceDto: RegisterDeviceDto) {
    const userId = req.user?.id || req.user?.sub;
    return await this.notificationsService.registerDevice(
      userId,
      registerDeviceDto.token,
      registerDeviceDto.platform || 'android',
      registerDeviceDto.userAgent,
    );
  }

  @Post('unregister-device')
  @HttpCode(HttpStatus.OK)
  async unregisterDevice(@Request() req, @Body('token') token: string) {
    const userId = req.user?.id || req.user?.sub;
    return await this.notificationsService.unregisterDevice(userId, token);
  }

  @Put('preferences')
  async updatePreferences(@Request() req, @Body() updatePreferenceDto: UpdatePreferenceDto) {
    const userId = req.user?.id || req.user?.sub;
    return await this.notificationsService.updatePreferences(userId, updatePreferenceDto);
  }

  @Get('preferences')
  async getPreferences(@Request() req) {
    const userId = req.user?.id || req.user?.sub;
    return await this.notificationsService.getPreferences(userId);
  }

  @Get('history')
  async getNotificationHistory(
    @Request() req,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const userId = req.user?.id || req.user?.sub;
    return await this.notificationsService.getNotificationHistory(
      userId,
      limit ? parseInt(limit) : 50,
      offset ? parseInt(offset) : 0,
    );
  }

  @Post('test')
  async testNotification(@Request() req) {
    const userId = req.user?.id || req.user?.sub;
    await this.notificationsService.sendNotification({
      userId,
      type: 'order_created' as any,
      payload: {
        title: 'Test Notification',
        body: 'This is a test notification from Nebeng backend',
        data: {
          type: 'test',
          timestamp: new Date().toISOString(),
        },
      },
    });
    return { success: true, message: 'Test notification sent' };
  }

  @Post('test/order-created')
  async testOrderCreated(@Request() req) {
    const userId = req.user?.id || req.user?.sub;
    await this.notificationHelper.notifyOrderCreated(userId, 'TEST-123', {
      origin: 'Jakarta',
      destination: 'Bandung',
      departureDate: new Date().toISOString(),
    });
    return { success: true, message: 'Order created notification sent' };
  }

  @Post('test/chat-message')
  async testChatMessage(@Request() req) {
    const userId = req.user?.id || req.user?.sub;
    await this.notificationHelper.notifyChatMessage(userId, 'conv-123', 'Test User');
    return { success: true, message: 'Chat message notification sent' };
  }

  @Post('test/payment-success')
  async testPaymentSuccess(@Request() req) {
    const userId = req.user?.id || req.user?.sub;
    await this.notificationHelper.notifyPaymentSuccess(userId, 50000);
    return { success: true, message: 'Payment success notification sent' };
  }

  // User Notification Endpoints - static routes first
  @Get('unread-count')
  async getUnreadCount(@Request() req) {
    const userId = req.user?.id || req.user?.sub;
    return await this.notificationsService.getUnreadCountByType(userId);
  }

  @Patch('read-all')
  async markAllAsRead(@Request() req) {
    const userId = req.user?.id || req.user?.sub;
    await this.notificationsService.markAllAsRead(userId);
    return { success: true };
  }

  // Routes with parameters
  @Patch('read-by-conversation/:conversationId')
  async markConversationAsRead(
    @Request() req,
    @Param('conversationId') conversationId: string,
  ) {
    const userId = req.user?.id || req.user?.sub;
    await this.notificationsService.markConversationAsRead(userId, conversationId);
    return { success: true };
  }

  @Patch(':id/read')
  async markAsRead(@Request() req, @Param('id') id: string) {
    const userId = req.user?.id || req.user?.sub;
    await this.notificationsService.markAsRead(userId, id);
    return { success: true };
  }

  // Catch-all route last
  @Get()
  async getUserNotifications(
    @Request() req,
    @Query('type') type?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const userId = req.user?.id || req.user?.sub;
    const pageNum = page ? parseInt(page) : 1;
    const limitNum = limit ? parseInt(limit) : 20;
    const offset = (pageNum - 1) * limitNum;

    return await this.notificationsService.getUserNotifications(
      userId,
      type,
      limitNum,
      offset,
    );
  }

  // Web Push endpoints
  @Get('push/public-key')
  async getPublicKey() {
    const publicKey = this.pushService.getPublicKey();
    return { publicKey };
  }

  @Post('push/subscribe')
  @HttpCode(HttpStatus.OK)
  async subscribeToPush(@Request() req, @Body() dto: PushSubscribeDto) {
    const userId = req.user?.id || req.user?.sub;
    await this.pushService.subscribe(userId, dto, dto.userAgent);
    return { success: true };
  }

  @Delete('push/subscribe')
  @HttpCode(HttpStatus.OK)
  async unsubscribeFromPush(@Request() req, @Body() dto: PushUnsubscribeDto) {
    const userId = req.user?.id || req.user?.sub;
    await this.pushService.unsubscribe(userId, dto.endpoint);
    return { success: true };
  }
}
