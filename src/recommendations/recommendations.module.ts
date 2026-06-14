/**
 * ============================================================
 * FICHIER : recommendations.module.ts
 * RÔLE    : Module de génération et gestion des recommandations ML.
 * ============================================================
 *
 * CONCEPT :
 *   Ce module orchestre l'appel au micro-service ML Flask et la persistance
 *   des recommandations générées. Il relie la session (contexte séance) à
 *   la prédiction (activités suggérées par le modèle).
 *
 * DÉPENDANCES CLÉS :
 *   HttpModule    (@nestjs/axios) — client HTTP pour POST /predict vers Flask
 *   SessionsModule               — exporte SessionsService pour que le controller
 *                                   puisse charger la session avant d'appeler Flask
 *   PrismaModule                 — persistance dans recommendation_history
 *
 * VARIABLE D'ENVIRONNEMENT :
 *   FLASK_URL (défaut: 'http://localhost:5000') — URL du service ML Python
 *
 * TABLES PRISMA :
 *   recommendation_history — id, session_id, recommandations (JSON),
 *                            modele_utilise, activite_choisie, created_at
 *
 * ROUTES EXPOSÉES (RecommendationsController) :
 *   POST  /recommendations/session/:sessionId    [JWT] → Générer des recommandations (appel Flask)
 *   GET   /recommendations/session/:sessionId    [JWT] → Historique des recommandations d'une session
 *   PATCH /recommendations/:id/choose            [JWT] → Valider le choix final du coach
 *
 * FLUX COMPLET :
 *   POST /sessions → crée la session (30 features)
 *   POST /recommendations/session/:id → charge la session → appel Flask /predict
 *                                     → persiste dans recommendation_history
 *   PATCH /recommendations/:id/choose → le coach valide son choix → activite_choisie
 */

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
