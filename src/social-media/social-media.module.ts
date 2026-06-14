/**
 * ============================================================
 * FICHIER : social-media.module.ts
 * RÔLE    : Module réseau social — publications, commentaires, réactions, favoris, utilisateurs masqués.
 * ============================================================
 *
 * CONCEPT :
 *   Ce module fournit les fonctionnalités réseau social de la plateforme :
 *   création/modification/suppression de publications (posts), commentaires,
 *   réactions (like/love/wow/bravo/instructif/soutien/haha), favoris et
 *   masquage d'utilisateurs.
 *
 * TABLES PRISMA IMPLIQUÉES :
 *   posts              — content, visibility (PUBLIC|PRIVATE|MASKED), location, media (JSON)
 *   post_hashtags      — post_id, hashtag (normalisé : lowercase, espaces→_, sans #)
 *   post_mentions      — post_id, mentioned_user_id
 *   post_hidden_users  — post_id, hidden_user_id (MASKED : caché pour certains utilisateurs)
 *   post_reactions     — post_id, user_id, reaction_type (upsert : 1 réaction par user par post)
 *   post_favorites     — post_id, user_id (upsert idempotent)
 *   comments           — post_id, user_id, content (token [[reply:commentId]] pour réponses)
 *   user_hidden_users  — user_id, hidden_user_id (masquer un utilisateur entier)
 *   user_follows       — follower_id, followed_id (influe sur la visibilité PRIVATE)
 *
 * SYSTÈME DE VISIBILITÉ :
 *   PUBLIC  → visible par tous
 *   PRIVATE → visible uniquement par l'auteur et ses followers
 *   MASKED  → visible par tous SAUF les utilisateurs listés dans post_hidden_users
 *
 * DÉPENDANCES :
 *   PrismaModule         → accès BDD
 *   NotificationsModule  → notifications mentions, commentaires, réactions, réponses
 *
 * ROUTES EXPOSÉES (SocialMediaController) :
 *   POST   /social-media/posts
 *   GET    /social-media/posts
 *   GET    /social-media/posts/:id
 *   GET    /social-media/users/:id/posts
 *   PATCH  /social-media/posts/:id
 *   DELETE /social-media/posts/:id
 *   POST   /social-media/posts/:id/share
 *   POST   /social-media/posts/:id/comments
 *   GET    /social-media/posts/:id/comments
 *   PATCH  /social-media/posts/:postId/comments/:commentId
 *   DELETE /social-media/posts/:postId/comments/:commentId
 *   POST   /social-media/posts/:id/reactions
 *   DELETE /social-media/posts/:id/reactions
 *   GET    /social-media/posts/:id/reactions
 *   POST   /social-media/posts/:id/favorites
 *   DELETE /social-media/posts/:id/favorites
 *   GET    /social-media/favorites/posts
 *   GET    /social-media/favorites/count
 *   POST   /social-media/users/:id/hide
 *   DELETE /social-media/users/:id/hide
 *   GET    /social-media/users/hidden
 */

import { Module } from '@nestjs/common';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { SocialMediaController } from './social-media.controller';
import { SocialMediaService } from './social-media.service';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [SocialMediaController],
  providers: [SocialMediaService],
  exports: [SocialMediaService],
})
export class SocialMediaModule {}
