import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { UsersModule } from 'src/users/users.module';
import { MessagerieController } from './messagerie.controller';
import { MessagerieGateway } from './messagerie.gateway';
import { MessagerieMuteService } from './messagerie-mute.service';
import { MessagerieService } from './messagerie.service';

@Module({
  imports: [PrismaModule, UsersModule],
  controllers: [MessagerieController],
  providers: [MessagerieService, MessagerieMuteService, MessagerieGateway],
  exports: [MessagerieService],
})
export class MessagerieModule {}
