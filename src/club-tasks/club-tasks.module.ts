import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { ClubTasksController } from './club-tasks.controller';
import { ClubTasksService } from './club-tasks.service';

@Module({
  imports: [PrismaModule],
  controllers: [ClubTasksController],
  providers: [ClubTasksService],
})
export class ClubTasksModule {}
