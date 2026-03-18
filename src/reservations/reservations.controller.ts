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

@Controller('reservations')
@UseGuards(AuthGuard('jwt'))
export class ReservationsController {
  constructor(private readonly resService: ReservationsService) {}

  @Post()
  create(@Request() req, @Body() dto: any) {
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
  updateStatus(@Param('id') id: string, @Body('statut') statut: string) {
    return this.resService.updateStatus(id, statut);
  }
}
