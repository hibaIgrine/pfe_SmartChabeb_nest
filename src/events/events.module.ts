import { Module } from '@nestjs/common';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { ReservationsModule } from 'src/reservations/reservations.module';

@Module({
  imports: [PrismaModule, NotificationsModule, ReservationsModule],
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
