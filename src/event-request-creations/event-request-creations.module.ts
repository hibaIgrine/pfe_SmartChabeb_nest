import { Module } from '@nestjs/common';
import { EventsModule } from 'src/events/events.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { ReservationsModule } from 'src/reservations/reservations.module';
import { EventRequestCreationsController } from './event-request-creations.controller';
import { EventRequestCreationsService } from './event-request-creations.service';

@Module({
  imports: [
    PrismaModule,
    NotificationsModule,
    ReservationsModule,
    EventsModule,
  ],
  controllers: [EventRequestCreationsController],
  providers: [EventRequestCreationsService],
})
export class EventRequestCreationsModule {}
