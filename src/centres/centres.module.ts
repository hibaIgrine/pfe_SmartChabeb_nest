import { Module } from '@nestjs/common';
import { CentresService } from './centres.service';
import { CentresController } from './centres.controller';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CentresController],
  providers: [CentresService],
  exports: [CentresService],
})
export class CentresModule {}
