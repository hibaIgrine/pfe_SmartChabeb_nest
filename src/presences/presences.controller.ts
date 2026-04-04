import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PresencesService } from './presences.service';
import { MarkPresenceDto } from './dto/mark-presence.dto';

@Controller('presences')
@UseGuards(AuthGuard('jwt'))
export class PresencesController {
  constructor(private readonly presencesService: PresencesService) {}

  @Get('my-clubs')
  async getMyClubs(@Request() req: any) {
    return await this.presencesService.getManageableClubs(req.user.userId);
  }

  @Post('mark')
  async markPresence(@Request() req: any, @Body() dto: MarkPresenceDto) {
    return await this.presencesService.markPresence(req.user.userId, dto);
  }

  @Get(':clubId/members')
  async getMembers(
    @Request() req: any,
    @Param('clubId') clubId: string,
    @Query('date') date?: string,
  ) {
    return await this.presencesService.getMembersForDate(
      req.user.userId,
      clubId,
      date,
    );
  }

  @Get(':clubId/history')
  async getHistory(
    @Request() req: any,
    @Param('clubId') clubId: string,
    @Query('memberId') memberId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : 100;
    return await this.presencesService.getHistory(
      req.user.userId,
      clubId,
      memberId,
      startDate,
      endDate,
      parsedLimit,
    );
  }

  @Get(':clubId/stats')
  async getStats(
    @Request() req: any,
    @Param('clubId') clubId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return await this.presencesService.getStats(
      req.user.userId,
      clubId,
      startDate,
      endDate,
    );
  }

  @Get(':clubId/export')
  async exportDaily(
    @Request() req: any,
    @Param('clubId') clubId: string,
    @Query('date') date: string | undefined,
  ) {
    return await this.presencesService.exportDailyPresence(
      req.user.userId,
      clubId,
      date,
    );
  }
}
