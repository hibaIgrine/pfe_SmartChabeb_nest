/**
 * ============================================================
 * FICHIER : sessions.module.ts
 * RÔLE    : Module de gestion des sessions ML (contexte de séance pour prédiction).
 * ============================================================
 *
 * CONCEPT :
 *   Une « session ML » est la capture complète d'une séance de club au moment
 *   où le coach demande une recommandation d'activité pour la prochaine séance.
 *   Elle constitue l'entrée du modèle : 30 variables contextuelles
 *   (profil groupe, historique activités, métriques, évaluation coach...).
 *
 * TABLES PRISMA :
 *   recommendation_sessions   — la session ML (30 colonnes features + id_club + id_responsable)
 *   clubs                     — jointure pour nom + categorie → domaine ML
 *   recommendation_history    — lu pour enrichir activite_choisie dans toSessionView()
 *
 * ROUTES EXPOSÉES (SessionsController) :
 *   POST   /sessions              [JWT] → Créer une session (saisie du coach)
 *   GET    /sessions              [JWT] → Lister toutes les sessions (enrichies avec activite_choisie)
 *   GET    /sessions/:id          [JWT] → Détail d'une session
 *   PATCH  /sessions/:id          [JWT] → Modifier une session (tous champs optionnels)
 *   DELETE /sessions/:id          [JWT] → Supprimer une session
 *
 * EXPORT :
 *   SessionsService → importé par RecommendationsModule (le controller predictions
 *   charge la session via sessionsService.findOne avant d'appeler Flask).
 */

import { Module } from '@nestjs/common';
import { SessionsService } from './sessions.service';
import { SessionsController } from './sessions.controller';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [SessionsController],
  providers: [SessionsService],
  exports: [SessionsService],
})
export class SessionsModule {}
