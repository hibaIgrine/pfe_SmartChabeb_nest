import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { PresencesController } from './presences.controller';
import { PresencesService } from './presences.service';

/**
 * Module dedie a la gestion des presences.
 * Il regroupe la route HTTP et la logique metier, avec Prisma comme acces aux donnees.
 */
@Module({
  imports: [PrismaModule],
  controllers: [PresencesController],
  providers: [PresencesService],
})
export class PresencesModule {}
