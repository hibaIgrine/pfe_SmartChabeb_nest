import { Module } from '@nestjs/common';
import { SallesService } from './salles.service';
import { SallesController } from './salles.controller';

@Module({
  controllers: [SallesController],
  providers: [SallesService],
})
export class SallesModule {}
