import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from 'src/auth/roles.decorator';
import { RolesGuard } from 'src/auth/roles.guard';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { EventsService } from './events.service';

@Controller('events')
@UseGuards(AuthGuard('jwt'))
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'RESPONSABLE_CENTRE', 'RESPONSABLE_CLUB')
  create(@Request() req: any, @Body() dto: CreateEventDto) {
    return this.eventsService.create(req.user.userId, dto);
  }

  @Get()
  findAll(
    @Request() req: any,
    @Query('includeInactive') includeInactive?: string,
  ) {
    const include = String(includeInactive).toLowerCase() === 'true';
    return this.eventsService.findAll(req.user.userId, include);
  }

  @Get('me/participations')
  findMyParticipations(
    @Request() req: any,
    @Query('includeInactive') includeInactive?: string,
  ) {
    const include = String(includeInactive).toLowerCase() === 'true';
    return this.eventsService.findMyParticipations(req.user.userId, include);
  }

  @Get('availability/check')
  checkAvailability(
    @Query('id_local') localId: string,
    @Query('date') date: string,
    @Query('start') start: string,
    @Query('end') end: string,
    @Query('excludeEventId') excludeEventId?: string,
  ) {
    return this.eventsService.checkLocalAvailability(
      localId,
      date,
      start,
      end,
      excludeEventId,
    );
  }

  @Get(':id')
  findOne(@Request() req: any, @Param('id') id: string) {
    return this.eventsService.findOne(req.user.userId, id);
  }

  @Post(':id/participants/register')
  registerToEvent(@Request() req: any, @Param('id') id: string) {
    return this.eventsService.registerToEvent(id, req.user.userId);
  }

  @Patch(':id/participants/me/cancel')
  cancelMyRegistration(@Request() req: any, @Param('id') id: string) {
    return this.eventsService.cancelMyRegistration(id, req.user.userId);
  }

  @Get(':id/participants')
  listParticipants(@Request() req: any, @Param('id') id: string) {
    return this.eventsService.listParticipants(id, req.user.userId);
  }

  @Patch(':id/participants/:participantId/status')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'RESPONSABLE_CENTRE', 'RESPONSABLE_CLUB')
  updateParticipantStatus(
    @Request() req: any,
    @Param('id') id: string,
    @Param('participantId') participantId: string,
    @Body('status') status: string,
  ) {
    return this.eventsService.updateParticipantStatus(
      id,
      participantId,
      status,
      req.user.userId,
    );
  }

  @Patch(':id/participants/:participantId/checkin')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'RESPONSABLE_CENTRE', 'RESPONSABLE_CLUB')
  setParticipantCheckin(
    @Request() req: any,
    @Param('id') id: string,
    @Param('participantId') participantId: string,
    @Body('checkin') checkin: boolean,
  ) {
    return this.eventsService.setParticipantCheckin(
      id,
      participantId,
      checkin,
      req.user.userId,
    );
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'RESPONSABLE_CENTRE', 'RESPONSABLE_CLUB')
  update(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateEventDto,
  ) {
    return this.eventsService.update(req.user.userId, id, dto);
  }

  @Patch(':id/activate')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'RESPONSABLE_CENTRE', 'RESPONSABLE_CLUB')
  activate(@Request() req: any, @Param('id') id: string) {
    return this.eventsService.setActive(req.user.userId, id, true);
  }

  @Patch(':id/deactivate')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'RESPONSABLE_CENTRE', 'RESPONSABLE_CLUB')
  deactivate(@Request() req: any, @Param('id') id: string) {
    return this.eventsService.setActive(req.user.userId, id, false);
  }
}
