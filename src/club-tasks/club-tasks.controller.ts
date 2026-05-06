import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
  Patch,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from 'src/auth/roles.decorator';
import { RolesGuard } from 'src/auth/roles.guard';
import { ClubTasksService } from './club-tasks.service';
import { CreateClubTaskDto } from './dto/create-club-task.dto';

@Controller('clubs/:clubId/tasks')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('RESPONSABLE_CLUB', 'RESPONSABLE_CENTRE', 'ADMIN')
export class ClubTasksController {
  constructor(private readonly clubTasksService: ClubTasksService) {}

  @Get()
  async findAll(@Param('clubId') clubId: string, @Request() req: any) {
    return await this.clubTasksService.findAll(req.user.userId, clubId);
  }

  @Post()
  async create(
    @Param('clubId') clubId: string,
    @Request() req: any,
    @Body() dto: CreateClubTaskDto,
  ) {
    return await this.clubTasksService.create(req.user.userId, clubId, dto);
  }

  @Post(':taskId/affecter')
  async affecterTask(
    @Param('clubId') clubId: string,
    @Param('taskId') taskId: string,
    @Request() req: any,
    @Body() affectationData: { utilisateurs: string[] },
  ) {
    return await this.clubTasksService.affecterTask(req.user.userId, clubId, taskId, affectationData);
  }

  @Patch(':taskId/reaffecter')
  async reaffecterTask(
    @Param('clubId') clubId: string,
    @Param('taskId') taskId: string,
    @Request() req: any,
    @Body() affectationData: { utilisateurs: string[] },
  ) {
    return await this.clubTasksService.reaffecterTask(req.user.userId, clubId, taskId, affectationData);
  }

  @Get('staff')
  async getClubStaff(@Param('clubId') clubId: string, @Request() req: any) {
    return await this.clubTasksService.getClubStaff(req.user.userId, clubId);
  }
}
