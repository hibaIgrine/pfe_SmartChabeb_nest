import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from 'src/auth/roles.decorator';
import { RolesGuard } from 'src/auth/roles.guard';
import { CreateEventRequestCreationDto } from './dto/create-event-request-creation.dto';
import { EventRequestCreationsService } from './event-request-creations.service';

@Controller('event-request-creations')
@UseGuards(AuthGuard('jwt'))
export class EventRequestCreationsController {
  constructor(
    private readonly eventRequestCreationsService: EventRequestCreationsService,
  ) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'RESPONSABLE_CENTRE', 'RESPONSABLE_CLUB')
  create(@Request() req: any, @Body() dto: CreateEventRequestCreationDto) {
    return this.eventRequestCreationsService.create(req.user.userId, dto);
  }

  @Get('me')
  findMyRequests(@Request() req: any) {
    return this.eventRequestCreationsService.findMyRequests(req.user.userId);
  }

  @Get('pending')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'RESPONSABLE_CENTRE')
  findPendingForCentre(@Request() req: any) {
    return this.eventRequestCreationsService.findPendingForCentre(
      req.user.userId,
    );
  }

  @Patch(':id/approve')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'RESPONSABLE_CENTRE')
  approve(@Request() req: any, @Param('id') id: string) {
    return this.eventRequestCreationsService.approve(req.user.userId, id);
  }

  @Patch(':id/refuse')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'RESPONSABLE_CENTRE')
  refuse(@Request() req: any, @Param('id') id: string) {
    return this.eventRequestCreationsService.refuse(req.user.userId, id);
  }
}
