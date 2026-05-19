import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { ClubTasksController } from './club-tasks.controller';
import { ClubTasksService } from './club-tasks.service';
import { StaffTasksController } from './staff-tasks.controller';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [ClubTasksController, StaffTasksController],
  providers: [ClubTasksService],
})
export class ClubTasksModule {}
