import {
  BadRequestException,
  Controller,
  Post,
  Get,
  Patch,
  Param,
  Body,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RecommendationsService } from './recommendations.service';
import { SessionsService } from '../sessions/sessions.service';

@Controller('recommendations')
@UseGuards(AuthGuard('jwt'))
export class RecommendationsController {
  constructor(
    private readonly recoService: RecommendationsService,
    private readonly sessionsService: SessionsService,
  ) {}

  @Post('session/:sessionId')
  async predict(
    @Param('sessionId', ParseIntPipe) sessionId: number,
    @Body('top_k') topK?: number,
  ) {
    const session = await this.sessionsService.findOne(sessionId);
    const normalizedTopK =
      typeof topK === 'number' && topK > 0 ? Math.floor(topK) : 3;

    if (normalizedTopK < 1 || normalizedTopK > 10) {
      throw new BadRequestException('top_k doit etre entre 1 et 10');
    }

    return this.recoService.predict(session, normalizedTopK);
  }

  @Get('session/:sessionId')
  findBySession(@Param('sessionId', ParseIntPipe) sessionId: number) {
    return this.recoService.findBySession(sessionId);
  }

  @Patch(':id/choose')
  choose(
    @Param('id', ParseIntPipe) id: number,
    @Body('activite') activite: string,
  ) {
    return this.recoService.updateChoice(id, activite);
  }
}
