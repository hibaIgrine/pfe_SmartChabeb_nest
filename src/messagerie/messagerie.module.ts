import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { MessagerieController } from './messagerie.controller';
import { MessagerieService } from './messagerie.service';

@Module({
  imports: [PrismaModule],
  controllers: [MessagerieController],
  providers: [MessagerieService],
  exports: [MessagerieService],
})
export class MessagerieModule {}
