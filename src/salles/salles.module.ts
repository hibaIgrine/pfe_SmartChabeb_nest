import { Module } from '@nestjs/common';
import { SallesService } from './salles.service';
import { SallesController } from './salles.controller';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports:[PrismaModule],
  controllers: [SallesController],
  providers: [SallesService],
})
export class SallesModule {}
