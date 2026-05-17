import {
  Body,
  Controller,
  Delete,
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
import { UpdateClubTaskDto } from './dto/update-club-task.dto';
import { UpdateClubTaskStatusDto } from './dto/update-club-task-status.dto';

@Controller('clubs/:clubId/tasks')
@UseGuards(AuthGuard('jwt'))
export class ClubTasksController {
  constructor(private readonly clubTasksService: ClubTasksService) {}

  @Get()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('RESPONSABLE_CLUB', 'RESPONSABLE_CENTRE', 'ADMIN')
  async findAll(@Param('clubId') clubId: string, @Request() req: any) {
    return await this.clubTasksService.findAll(req.user.userId, clubId);
  }

  @Post()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('RESPONSABLE_CLUB', 'RESPONSABLE_CENTRE', 'ADMIN')
  async create(
    @Param('clubId') clubId: string,
    @Request() req: any,
    @Body() dto: CreateClubTaskDto,
  ) {
    return await this.clubTasksService.create(req.user.userId, clubId, dto);
  }

  @Post(':taskId/affecter')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('RESPONSABLE_CLUB', 'RESPONSABLE_CENTRE', 'ADMIN')
  async affecterTask(
    @Param('clubId') clubId: string,
    @Param('taskId') taskId: string,
    @Request() req: any,
    @Body() affectationData: { utilisateurs: string[] },
  ) {
    return await this.clubTasksService.affecterTask(
      req.user.userId,
      clubId,
      taskId,
      affectationData,
    );
  }

  @Patch(':taskId/reaffecter')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('RESPONSABLE_CLUB', 'RESPONSABLE_CENTRE', 'ADMIN')
  async reaffecterTask(
    @Param('clubId') clubId: string,
    @Param('taskId') taskId: string,
    @Request() req: any,
    @Body() affectationData: { utilisateurs: string[] },
  ) {
    return await this.clubTasksService.reaffecterTask(
      req.user.userId,
      clubId,
      taskId,
      affectationData,
    );
  }

  @Get('staff')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('RESPONSABLE_CLUB', 'RESPONSABLE_CENTRE', 'ADMIN')
  async getClubStaff(@Param('clubId') clubId: string, @Request() req: any) {
    return await this.clubTasksService.getClubStaff(req.user.userId, clubId);
  }

  @Get('assigned')
  async findAssigned(@Param('clubId') clubId: string, @Request() req: any) {
    return await this.clubTasksService.findAssignedTasks(
      req.user.userId,
      clubId,
    );
  }

  @Patch(':taskId/status')
  async updateStatus(
    @Param('clubId') clubId: string,
    @Param('taskId') taskId: string,
    @Request() req: any,
    @Body() dto: UpdateClubTaskStatusDto,
  ) {
    return await this.clubTasksService.updateStatus(
      req.user.userId,
      req.user.role,
      clubId,
      taskId,
      dto,
    );
  }

  @Patch(':taskId')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('RESPONSABLE_CLUB', 'RESPONSABLE_CENTRE', 'ADMIN')
  async update(
    @Param('clubId') clubId: string,
    @Param('taskId') taskId: string,
    @Request() req: any,
    @Body() dto: UpdateClubTaskDto,
  ) {
    return await this.clubTasksService.update(
      req.user.userId,
      clubId,
      taskId,
      dto,
    );
  }

  @Delete(':taskId')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('RESPONSABLE_CLUB', 'RESPONSABLE_CENTRE', 'ADMIN')
  async remove(
    @Param('clubId') clubId: string,
    @Param('taskId') taskId: string,
    @Request() req: any,
  ) {
    return await this.clubTasksService.remove(req.user.userId, clubId, taskId);
  }
}
