import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { MailerModule } from '@nestjs-modules/mailer';

//connecter le module users a BD
@Module({
  imports: [PrismaModule, MailerModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
