import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { ClubRolesController } from './club-roles.controller';
import { ClubRolesService } from './club-roles.service';

@Module({
  imports: [PrismaModule],
  controllers: [ClubRolesController],
  providers: [ClubRolesService],
  exports: [ClubRolesService],
})
export class ClubRolesModule {}
