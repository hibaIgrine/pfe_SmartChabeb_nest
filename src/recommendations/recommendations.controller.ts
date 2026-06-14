/**
 * ============================================================
 * FICHIER : recommendations.controller.ts
 * RÔLE    : Routes HTTP pour la génération et la gestion des recommandations ML.
 * ============================================================
 *
 * BASE URL : /recommendations
 * Tout le controller est protégé par @UseGuards(AuthGuard('jwt')).
 *
 * ROUTES :
 *
 *   POST /recommendations/session/:sessionId    body?: { top_k?: number }
 *     → Route principale de prédiction ML.
 *     → Charge la session via sessionsService.findOne(sessionId).
 *     → Valide top_k : doit être un entier dans [1, 10], défaut 3.
 *         BadRequestException si hors bornes.
 *         Math.floor() pour garantir un entier (protection contre 3.7).
 *     → Appelle recoService.predict(session, topK) :
 *         1. Construit le vecteur 30D depuis la session
 *         2. POST http://localhost:5000/predict (Flask ML)
 *         3. Persiste dans recommendation_history
 *         4. Retourne { id, sessionId, recommandations[{activite, probabilite}],
 *                       modele_utilise, activite_choisie: null, created_at }
 *
 *   GET /recommendations/session/:sessionId
 *     → Historique de toutes les recommandations générées pour une session.
 *     → Triées par created_at DESC.
 *     → Permet au coach de voir ses précédentes prédictions pour cette session.
 *
 *   PATCH /recommendations/:id/choose            body: { activite: string }
 *     → Valide le choix final du coach parmi les recommandations suggérées.
 *     → Met à jour activite_choisie dans recommendation_history.
 *     → Cette information est le "label terrain" pour le futur réentraînement
 *       du modèle (feedback loop d'amélioration continue).
 *     → :id (ParseIntPipe) = ID de la recommandation (pas de la session).
 */

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
