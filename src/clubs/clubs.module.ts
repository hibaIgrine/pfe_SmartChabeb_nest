import { Module } from '@nestjs/common';
import { ClubsService } from './clubs.service';
import { ClubsController } from './clubs.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { ReservationsModule } from 'src/reservations/reservations.module';

@Module({
  imports: [PrismaModule, NotificationsModule, ReservationsModule],
  controllers: [ClubsController],
  providers: [ClubsService],
})
export class ClubsModule {}
