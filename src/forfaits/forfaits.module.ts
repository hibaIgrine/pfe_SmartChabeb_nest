import { Module } from '@nestjs/common';
import { ForfaitsService } from './forfaits.service';
import { ForfaitsController } from './forfaits.controller';

@Module({
  controllers: [ForfaitsController],
  providers: [ForfaitsService],
})
export class ForfaitsModule {}
