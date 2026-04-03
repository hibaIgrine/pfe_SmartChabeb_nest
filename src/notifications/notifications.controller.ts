import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(AuthGuard('jwt'))
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get('me')
  async getMyNotifications(
    @Request() req: any,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = Number.parseInt(limit ?? '20', 10);
    const safeLimit = Number.isNaN(parsedLimit) ? 20 : parsedLimit;
    return this.notificationsService.getMyNotifications(
      req.user.userId,
      safeLimit,
    );
  }

  @Get('me/unread-count')
  async getMyUnreadCount(@Request() req: any) {
    return this.notificationsService.getMyUnreadCount(req.user.userId);
  }

  @Patch(':id/read')
  async markAsRead(@Request() req: any, @Param('id') notificationId: string) {
    return this.notificationsService.markAsRead(
      req.user.userId,
      notificationId,
    );
  }

  @Patch('me/read-all')
  async markAllAsRead(@Request() req: any) {
    return this.notificationsService.markAllAsRead(req.user.userId);
  }
}
