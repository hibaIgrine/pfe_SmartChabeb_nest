import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { RecommendationsService } from './recommendations.service';
import { RecommendationsController } from './recommendations.controller';
import { SessionsModule } from '../sessions/sessions.module';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [HttpModule, SessionsModule, PrismaModule],
  controllers: [RecommendationsController],
  providers: [RecommendationsService],
})
export class RecommendationsModule {}
