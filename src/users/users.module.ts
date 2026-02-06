import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
//connecter le module users a BD
@Module({
  imports:[PrismaModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
