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

import { PaymentsService } from 'src/payments/payments.service';

@Controller('reservations')
@UseGuards(AuthGuard('jwt'))
export class ReservationsController {
  constructor(
    private readonly resService: ReservationsService,
    private readonly paymentsService: PaymentsService,
  ) {}

  @Post()
  create(@Request() req, @Body() dto: CreateReservationDto) {
    return this.resService.create(req.user.userId, dto);
  }

  @Post('create-with-payment')
  async createWithPayment(
    @Request() req,
    @Body() dto: CreateReservationDto & { returnUrl: string },
  ) {
    const reservation = await this.resService.create(req.user.userId, dto);
    const amount = Number(reservation.prix_total) || 0;
    const result = await this.paymentsService.createPaymentAndSession(
      reservation.id,
      amount,
      dto.returnUrl,
    );
    const checkoutUrl = result.checkoutUrl ?? null;
    const paymentId = result.payment?.id ?? null;
    return { reservation, checkoutUrl, paymentId };
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

  @Get('planning/:localId')
  async getPlanning(@Param('localId') localId: string) {
    return await this.resService.getLocalPlanning(localId);
  }

  @Get('stats/overview')
  async getStatsOverview(@Request() req) {
    return await this.resService.getReservationStatsOverview(
      req.user.userId,
      req.user.role,
    );
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
