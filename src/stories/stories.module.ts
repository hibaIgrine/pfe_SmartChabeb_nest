/**
 * ============================================================
 * FICHIER : stories.module.ts
 * RÔLE    : Module des stories éphémères (format "Snapchat/Instagram Stories").
 * ============================================================
 *
 * CONCEPT :
 *   Une story est une publication courte (texte + image ou vidéo) qui expire
 *   automatiquement 24 heures après sa création. Passé ce délai, elle reste
 *   en base mais n'est plus visible dans le fil ou le profil (filtrée par expires_at > now).
 *   L'archive personnelle (GET /stories/me/archive) les expose toutes, même expirées.
 *
 * TABLES PRISMA :
 *   stories      — id, user_id, content, media (JSON [{ type, url, textY? }]),
 *                  expires_at (created_at + 24h), created_at
 *   story_views  — story_id, viewer_id, viewed_at (clé unique story_id+viewer_id)
 *
 * COMPOSANTS :
 *   StoriesService    — logique métier (create, feed, archive, vue, suppression, cron cleanup)
 *   StoriesController — routes HTTP REST (base /stories)
 *
 * DÉPENDANCES :
 *   PrismaModule → accès BDD
 *
 * ROUTES EXPOSÉES :
 *   POST   /stories/create         [JWT] → Créer une story (expire dans 24h)
 *   GET    /stories/feed           [JWT] → Stories actives de tous (1 par auteur, soi exclu)
 *   GET    /stories/user/:userId   [JWT] → Stories actives d'un utilisateur spécifique
 *   GET    /stories/me/archive     [JWT] → Toutes mes stories (actives + expirées)
 *   POST   /stories/:storyId/view  [JWT] → Marquer une story comme vue (idempotent)
 *   DELETE /stories/:storyId       [JWT] → Supprimer (auteur ou ADMIN)
 *
 * EXPORTS :
 *   StoriesService → disponible pour d'autres modules (ex: cron job de nettoyage).
 */

import { Module } from '@nestjs/common';
import { StoriesService } from './stories.service';
import { StoriesController } from './stories.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [StoriesService],
  controllers: [StoriesController],
  exports: [StoriesService],
})
export class StoriesModule {}
