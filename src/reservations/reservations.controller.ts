import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common';
import { ReservationsService } from './reservations.service';
import { AuthGuard } from '@nestjs/passport';
import { CreateReservationDto } from './dto/create-reservation.dto';

@Controller('reservations')
@UseGuards(AuthGuard('jwt'))
export class ReservationsController {
  constructor(private readonly resService: ReservationsService) {}

  @Post()
  create(@Request() req, @Body() dto: CreateReservationDto) {
    return this.resService.create(req.user.userId, dto);
  }

  @Get()
  findAll(@Request() req) {
    return this.resService.findAll(req.user.userId, req.user.role);
  }
  @Get('occupied')
  async getOccupied(
    @Query('id_local') localId: string,
    @Query('date') date: string,
  ) {
    return await this.resService.getOccupiedSlots(localId, date);
  }
  @Get('check')
  async check(@Query() q: any) {
    const isFree = await this.resService.checkAvailability(
      q.id_local,
      q.date,
      q.start,
      q.end,
    );
    return { available: isFree };
  }

  @Patch(':id/status')
  updateStatus(
    @Request() req,
    @Param('id') id: string,
    @Body('statut') statut: string,
  ) {
    return this.resService.updateStatus(
      id,
      statut,
      req.user.userId,
      req.user.role,
    );
  }

  @Patch(':id')
  update(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: CreateReservationDto,
  ) {
    return this.resService.update(req.user.userId, id, dto);
  }

  @Patch(':id/cancel')
  cancel(@Request() req, @Param('id') id: string) {
    return this.resService.cancel(req.user.userId, id);
  }
}
