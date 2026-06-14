/**
 * ============================================================
 * FICHIER : messagerie.utils.ts
 * RÔLE    : Fonctions pures utilitaires partagées dans le module messagerie.
 * ============================================================
 *
 *   buildPrivateConversationKey(id1, id2) → string
 *     Génère une clé déterministe pour une conversation privée.
 *     Les IDs sont triés lexicographiquement et joints par ":" → (A,B) === (B,A).
 *     Sert à conversations.upsert({ where: { private_key } }) pour l'idempotence.
 *
 *   normalizeMessageContent(content?) → string | null
 *     Trim le texte ; retourne null si vide ou non-string.
 *
 *   normalizeMediaUrls(media?) → string[] | null
 *     Déduplique et trim les URLs média ; retourne null si tableau vide.
 *
 *   normalizeUserIds(userIds?) → string[]
 *     Déduplique et trim les UUIDs ; retourne [] si absent.
 *
 *   normalizeConversationTitle(title?) → string | null
 *     Trim le titre de groupe ; retourne null si vide ou non-string.
 *
 *   assertPrivateMessagePayload(type, content, media) → void | throws
 *     Valide qu'un message TEXT a du contenu, ou qu'un message IMAGE/VIDEO/DOCUMENT
 *     possède au moins un fichier média. Lance BadRequestException sinon.
 *
 *   assertGroupMessagePayload(type, content, media) → void | throws
 *     Alias de assertPrivateMessagePayload (même règle pour les groupes).
 *
 *   assertValidGroupTitle(title) → void | throws
 *     Lance BadRequestException si le titre du groupe est null/vide.
 */

import { BadRequestException } from '@nestjs/common';

export function buildPrivateConversationKey(
  firstUserId: string,
  secondUserId: string,
) {
  return [firstUserId, secondUserId].sort().join(':');
}

export function normalizeMessageContent(content?: string) {
  if (typeof content !== 'string') {
    return null;
  }

  const normalizedContent = content.trim();
  return normalizedContent.length > 0 ? normalizedContent : null;
}

export function normalizeMediaUrls(media?: string[]) {
  if (!media || media.length === 0) {
    return null;
  }

  const normalizedMedia = Array.from(
    new Set(media.map((item) => item.trim()).filter(Boolean)),
  );

  return normalizedMedia.length > 0 ? normalizedMedia : null;
}

export function normalizeUserIds(userIds?: string[]) {
  if (!userIds || userIds.length === 0) {
    return [];
  }

  return Array.from(
    new Set(userIds.map((item) => item.trim()).filter(Boolean)),
  );
}

export function normalizeConversationTitle(title?: string) {
  if (typeof title !== 'string') {
    return null;
  }

  const normalizedTitle = title.trim();
  return normalizedTitle.length > 0 ? normalizedTitle : null;
}

export function assertPrivateMessagePayload(
  type: string,
  content: string | null,
  media: string[] | null,
) {
  if (type === 'TEXT' && !content) {
    throw new BadRequestException(
      'Le contenu texte est obligatoire pour un message texte',
    );
  }

  if (type !== 'TEXT' && (!media || media.length === 0)) {
    throw new BadRequestException(
      'Un message image, video ou document doit contenir au moins un fichier',
    );
  }
}

export function assertGroupMessagePayload(
  type: string,
  content: string | null,
  media: string[] | null,
) {
  return assertPrivateMessagePayload(type, content, media);
}

export function assertValidGroupTitle(title: string | null) {
  if (!title) {
    throw new BadRequestException('Le nom du groupe est obligatoire');
  }
}
