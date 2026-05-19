import { Controller, Get, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ClubTasksService } from './club-tasks.service';

@Controller('staff/tasks')
@UseGuards(AuthGuard('jwt'))
export class StaffTasksController {
  constructor(private readonly clubTasksService: ClubTasksService) {}

  @Get('assigned')
  async findAssignedAcrossClubs(@Request() req: any) {
    return await this.clubTasksService.findAssignedTasksAcrossClubs(
      req.user.userId,
    );
  }
}
