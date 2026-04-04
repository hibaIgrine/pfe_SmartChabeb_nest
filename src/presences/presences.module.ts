import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { PresencesController } from './presences.controller';
import { PresencesService } from './presences.service';

@Module({
  imports: [PrismaModule],
  controllers: [PresencesController],
  providers: [PresencesService],
})
export class PresencesModule {}
