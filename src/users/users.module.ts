import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { MailerModule } from '@nestjs-modules/mailer';
import { EtablissementsModule } from 'src/etablissements/etablissements.module';

//connecter le module users a BD
@Module({
  imports: [PrismaModule, MailerModule, EtablissementsModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
