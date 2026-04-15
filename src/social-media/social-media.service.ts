import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateCommentDto } from '../social-media/dto/create-comment.dto';
import {
  CreatePostDto,
  PublicationMediaItemDto,
  publicationMediaTypes,
} from '../social-media/dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';

type NormalizedPublicationMediaItem = {
  type: PublicationMediaItemDto['type'];
  url: string;
  name?: string;
};

@Injectable()
export class SocialMediaService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly postInclude = {
    user: {
      select: {
        id: true,
        nom: true,
        prenom: true,
        photo_profil_url: true,
      },
    },
    hashtags: {
      orderBy: { hashtag: 'asc' as const },
      select: {
        hashtag: true,
      },
    },
    mentions: {
      include: {
        mentioned_user: {
          select: {
            id: true,
            nom: true,
            prenom: true,
            photo_profil_url: true,
          },
        },
      },
    },
    _count: {
      select: {
        comments: true,
      },
    },
  };

  private normalizeMedia(
    media?: PublicationMediaItemDto[],
  ): NormalizedPublicationMediaItem[] | undefined {
    if (!media || media.length === 0) {
      return undefined;
    }

    const normalizedMedia: NormalizedPublicationMediaItem[] = media
      .filter((item) => item && typeof item.url === 'string' && item.url.trim())
      .map((item) => ({
        type: item.type,
        url: item.url.trim(),
        name: item.name?.trim() || undefined,
      }))
      .filter((item) => publicationMediaTypes.includes(item.type));

    return normalizedMedia.length > 0 ? normalizedMedia : undefined;
  }

  private parseStoredMedia(media: Prisma.JsonValue | null) {
    if (!Array.isArray(media)) {
      return undefined;
    }

    const parsed: NormalizedPublicationMediaItem[] = [];

    for (const rawItem of media) {
      if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) {
        continue;
      }

      const item = rawItem as Record<string, unknown>;
      const type = String(item.type ?? '') as PublicationMediaItemDto['type'];
      const url = String(item.url ?? '').trim();
      const nameRaw = item.name;
      const name =
        typeof nameRaw === 'string' && nameRaw.trim().length > 0
          ? nameRaw.trim()
          : undefined;

      if (!publicationMediaTypes.includes(type) || !url) {
        continue;
      }

      parsed.push({ type, url, name });
    }

    return parsed.length ? parsed : undefined;
  }

  private normalizeHashtags(hashtags?: string[]): string[] | undefined {
    if (!hashtags) {
      return undefined;
    }

    const normalized = Array.from(
      new Set(
        hashtags
          .map((tag) => tag.trim().toLowerCase().replace(/^#+/, ''))
          .map((tag) => tag.replace(/\s+/g, '_'))
          .filter(Boolean),
      ),
    );

    return normalized;
  }

  private normalizeMentionUserIds(userIds?: string[]): string[] | undefined {
    if (!userIds) {
      return undefined;
    }

    const normalized = Array.from(new Set(userIds.map((id) => id.trim()))).filter(
      Boolean,
    );

    return normalized;
  }

  private async ensureMentionUsersExist(userIds: string[]) {
    if (!userIds.length) {
      return;
    }

    const count = await this.prisma.utilisateurs.count({
      where: { id: { in: userIds } },
    });

    if (count !== userIds.length) {
      throw new BadRequestException(
        'Un ou plusieurs utilisateurs mentionnes sont introuvables',
      );
    }
  }

  private ensurePublicationContent(
    content?: string,
    media?: PublicationMediaItemDto[],
    location?: string,
    hashtags?: string[],
    mentionUserIds?: string[],
  ) {
    const hasContent = Boolean(content && content.trim().length > 0);
    const hasMedia = Boolean(media && media.length > 0);
    const hasLocation = Boolean(location && location.trim().length > 0);
    const hasHashtags = Boolean(hashtags && hashtags.length > 0);
    const hasMentions = Boolean(mentionUserIds && mentionUserIds.length > 0);

    if (!hasContent && !hasMedia && !hasLocation && !hasHashtags && !hasMentions) {
      throw new BadRequestException(
        'Une publication doit contenir du texte, un média, une localisation, un hashtag ou une mention',
      );
    }
  }

  private async getPostOrThrow(postId: string) {
    const post = await this.prisma.posts.findUnique({
      where: { id: postId },
      include: this.postInclude,
    });

    if (!post) {
      throw new NotFoundException('Publication introuvable');
    }

    return post;
  }

  async createPost(userId: string, dto: CreatePostDto) {
    const normalizedMedia = this.normalizeMedia(dto.media);
    const normalizedHashtags = this.normalizeHashtags(dto.hashtags) ?? [];
    const normalizedMentionUserIds =
      this.normalizeMentionUserIds(dto.mentioned_user_ids) ?? [];
    const normalizedLocation = dto.location?.trim() || undefined;

    this.ensurePublicationContent(
      dto.content,
      normalizedMedia,
      normalizedLocation,
      normalizedHashtags,
      normalizedMentionUserIds,
    );

    await this.ensureMentionUsersExist(normalizedMentionUserIds);

    const created = await this.prisma.$transaction(async (tx) => {
      const post = await tx.posts.create({
        data: {
          user_id: userId,
          content: dto.content?.trim() || '',
          location: normalizedLocation,
          media: normalizedMedia as Prisma.InputJsonValue | undefined,
        },
      });

      if (normalizedHashtags.length) {
        await tx.post_hashtags.createMany({
          data: normalizedHashtags.map((hashtag) => ({
            post_id: post.id,
            hashtag,
          })),
        });
      }

      if (normalizedMentionUserIds.length) {
        await tx.post_mentions.createMany({
          data: normalizedMentionUserIds.map((mentionedUserId) => ({
            post_id: post.id,
            mentioned_user_id: mentionedUserId,
          })),
        });
      }

      return post;
    });

    return this.getPostOrThrow(created.id);
  }

  async findPosts(limit?: string, offset?: string) {
    const parsedLimit = Number.parseInt(limit ?? '20', 10);
    const parsedOffset = Number.parseInt(offset ?? '0', 10);

    const safeLimit = Number.isNaN(parsedLimit)
      ? 20
      : Math.min(parsedLimit, 100);
    const safeOffset = Number.isNaN(parsedOffset)
      ? 0
      : Math.max(parsedOffset, 0);

    return this.prisma.posts.findMany({
      orderBy: { created_at: 'desc' },
      take: safeLimit,
      skip: safeOffset,
      include: this.postInclude,
    });
  }

  async findPostById(postId: string) {
    const post = await this.prisma.posts.findUnique({
      where: { id: postId },
      include: {
        ...this.postInclude,
        comments: {
          orderBy: { created_at: 'asc' },
          include: {
            user: {
              select: {
                id: true,
                nom: true,
                prenom: true,
                photo_profil_url: true,
              },
            },
          },
        },
      },
    });

    if (!post) {
      throw new NotFoundException('Publication introuvable');
    }

    return post;
  }

  async updatePost(postId: string, userId: string, dto: UpdatePostDto) {
    const post = await this.prisma.posts.findUnique({
      where: { id: postId },
      include: {
        hashtags: { select: { hashtag: true } },
        mentions: { select: { mentioned_user_id: true } },
      },
    });

    if (!post) {
      throw new NotFoundException('Publication introuvable');
    }

    if (post.user_id !== userId) {
      throw new ForbiddenException(
        'Vous ne pouvez pas modifier cette publication',
      );
    }

    const normalizedMedia = this.normalizeMedia(dto.media);
    const nextContent = dto.content !== undefined ? dto.content : post.content;
    const nextMedia = dto.media !== undefined
      ? normalizedMedia
      : this.parseStoredMedia(post.media);
    const nextLocation =
      dto.location !== undefined ? dto.location?.trim() || '' : post.location || '';

    const normalizedHashtags = this.normalizeHashtags(dto.hashtags);
    const normalizedMentionUserIds = this.normalizeMentionUserIds(
      dto.mentioned_user_ids,
    );

    const nextHashtags =
      normalizedHashtags !== undefined
        ? normalizedHashtags
        : post.hashtags.map((item) => item.hashtag);

    const nextMentionUserIds =
      normalizedMentionUserIds !== undefined
        ? normalizedMentionUserIds
        : post.mentions.map((item) => item.mentioned_user_id);

    this.ensurePublicationContent(
      nextContent,
      nextMedia,
      nextLocation,
      nextHashtags,
      nextMentionUserIds,
    );

    await this.ensureMentionUsersExist(nextMentionUserIds);

    await this.prisma.$transaction(async (tx) => {
      await tx.posts.update({
        where: { id: postId },
        data: {
          content: nextContent?.trim() || '',
          location: nextLocation || null,
          media: nextMedia as Prisma.InputJsonValue | undefined,
        },
      });

      if (normalizedHashtags !== undefined) {
        await tx.post_hashtags.deleteMany({ where: { post_id: postId } });
        if (normalizedHashtags.length) {
          await tx.post_hashtags.createMany({
            data: normalizedHashtags.map((hashtag) => ({
              post_id: postId,
              hashtag,
            })),
          });
        }
      }

      if (normalizedMentionUserIds !== undefined) {
        await tx.post_mentions.deleteMany({ where: { post_id: postId } });
        if (normalizedMentionUserIds.length) {
          await tx.post_mentions.createMany({
            data: normalizedMentionUserIds.map((mentionedUserId) => ({
              post_id: postId,
              mentioned_user_id: mentionedUserId,
            })),
          });
        }
      }
    });

    return this.getPostOrThrow(postId);
  }

  async deletePost(postId: string, userId: string) {
    const post = await this.prisma.posts.findUnique({
      where: { id: postId },
      select: { id: true, user_id: true },
    });

    if (!post) {
      throw new NotFoundException('Publication introuvable');
    }

    if (post.user_id !== userId) {
      throw new ForbiddenException(
        'Vous ne pouvez pas supprimer cette publication',
      );
    }

    return this.prisma.posts.delete({
      where: { id: postId },
    });
  }

  async createComment(postId: string, userId: string, dto: CreateCommentDto) {
    const post = await this.prisma.posts.findUnique({
      where: { id: postId },
      select: { id: true },
    });

    if (!post) {
      throw new NotFoundException('Publication introuvable');
    }

    return this.prisma.comments.create({
      data: {
        post_id: postId,
        user_id: userId,
        content: dto.content,
      },
      include: {
        user: {
          select: {
            id: true,
            nom: true,
            prenom: true,
            photo_profil_url: true,
          },
        },
      },
    });
  }

  async findCommentsByPost(postId: string) {
    return this.prisma.comments.findMany({
      where: { post_id: postId },
      orderBy: { created_at: 'asc' },
      include: {
        user: {
          select: {
            id: true,
            nom: true,
            prenom: true,
            photo_profil_url: true,
          },
        },
      },
    });
  }
}
