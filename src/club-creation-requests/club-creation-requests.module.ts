import { Module } from '@nestjs/common';
import { ClubCreationRequestsController } from './club-creation-requests.controller';
import { ClubCreationRequestsService } from './club-creation-requests.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { ReservationsModule } from 'src/reservations/reservations.module';

@Module({
  imports: [PrismaModule, ReservationsModule],
  controllers: [ClubCreationRequestsController],
  providers: [ClubCreationRequestsService],
})
export class ClubCreationRequestsModule {}
