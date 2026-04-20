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
