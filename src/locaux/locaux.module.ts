import { Module } from '@nestjs/common';
import { LocauxService } from './locaux.service';
import { LocauxController } from './locaux.controller';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [LocauxController],
  providers: [LocauxService],
})
export class LocauxModule {}
