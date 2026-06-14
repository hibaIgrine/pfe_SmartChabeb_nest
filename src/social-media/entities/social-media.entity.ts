/**
 * ============================================================
 * FICHIER : social-media.entity.ts
 * RÔLE    : Entité placeholder générée par le CLI NestJS.
 * ============================================================
 *
 * Les données du module réseau social sont représentées par les types
 * Prisma générés depuis le schéma BDD. Tables concernées :
 *
 *   posts              — id, user_id, content, visibility, location, media (JSON), created_at
 *   post_hashtags      — id, post_id, hashtag
 *   post_mentions      — id, post_id, mentioned_user_id
 *   post_hidden_users  — id, post_id, hidden_user_id
 *   post_reactions     — id, post_id, user_id, reaction_type
 *   post_favorites     — id, post_id, user_id, created_at
 *   comments           — id, post_id, user_id, content, created_at
 *   user_hidden_users  — id, user_id, hidden_user_id, created_at
 *   user_follows       — id, follower_id, followed_id, created_at
 */
export class SocialMedia {}
