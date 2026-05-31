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
import { NotificationsService } from '../notifications/notifications.service';
import { SharePostDto } from './dto/share-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';

type NormalizedPublicationMediaItem = {
  type: PublicationMediaItemDto['type'];
  url: string;
  name?: string;
};

type PostWithFavoriteMeta<T> = T & {
  is_favorite: boolean;
  favorite_count: number;
};

type PostVisibility = 'PUBLIC' | 'PRIVATE' | 'MASKED';

const COMMENT_REPLY_TOKEN_REGEX = /\[\[reply:(.*?)\]\]/;

@Injectable()
export class SocialMediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

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
    hidden_users: {
      include: {
        hidden_user: {
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

  private normalizeVisibility(visibility?: string): PostVisibility {
    if (visibility === 'PRIVATE') {
      return 'PRIVATE';
    }
    if (visibility === 'MASKED') {
      return 'MASKED';
    }
    return 'PUBLIC';
  }

  private canUserViewPost(
    post: { user_id: string; visibility: string | null },
    currentUserId?: string,
    isFollowingAuthor = false,
  ) {
    const normalizedVisibility = this.normalizeVisibility(
      post.visibility ?? undefined,
    );
    if (normalizedVisibility === 'PUBLIC') {
      return true;
    }

    if (normalizedVisibility === 'MASKED') {
      return true;
    }

    return Boolean(
      currentUserId && (post.user_id === currentUserId || isFollowingAuthor),
    );
  }

  private normalizeHiddenUserIds(userIds?: string[]): string[] | undefined {
    if (!userIds) {
      return undefined;
    }

    const normalized = Array.from(
      new Set(userIds.map((id) => id.trim())),
    ).filter(Boolean);

    return normalized;
  }

  private async getHiddenUserIdsFor(userId: string): Promise<string[]> {
    const hiddenLinks = await this.prisma.user_hidden_users.findMany({
      where: { user_id: userId },
      select: { hidden_user_id: true },
    });

    return hiddenLinks.map((item) => item.hidden_user_id);
  }

  private async getFollowingUserIdsFor(userId: string): Promise<string[]> {
    const followingLinks = await this.prisma.user_follows.findMany({
      where: { follower_id: userId },
      select: { followed_id: true },
    });

    return followingLinks.map((item) => item.followed_id);
  }

  private async ensurePostVisibleToUser(postId: string, currentUserId: string) {
    const post = await this.prisma.posts.findUnique({
      where: { id: postId },
      select: {
        id: true,
        user_id: true,
        visibility: true,
        hidden_users: {
          where: {
            hidden_user_id: currentUserId,
          },
          select: {
            id: true,
          },
        },
      },
    });

    if (!post) {
      throw new NotFoundException('Publication introuvable');
    }

    const isFollowingAuthor =
      post.user_id !== currentUserId &&
      (await this.prisma.user_follows.count({
        where: {
          follower_id: currentUserId,
          followed_id: post.user_id,
        },
      })) > 0;

    if (!this.canUserViewPost(post, currentUserId, isFollowingAuthor)) {
      throw new ForbiddenException('Cette publication est privee');
    }

    if (
      this.normalizeVisibility(post.visibility ?? undefined) === 'MASKED' &&
      post.user_id !== currentUserId &&
      post.hidden_users.length > 0
    ) {
      throw new ForbiddenException('Cette publication est masquee');
    }

    const hiddenUserIds = await this.getHiddenUserIdsFor(currentUserId);
    if (hiddenUserIds.includes(post.user_id)) {
      throw new ForbiddenException('Cette publication est masquee');
    }

    return post;
  }

  private parseReplyToCommentId(content: string): string | null {
    const match = COMMENT_REPLY_TOKEN_REGEX.exec(content);
    if (!match || !match[1]) {
      return null;
    }

    const value = String(match[1]).trim();
    return value.length > 0 ? value : null;
  }

  private normalizeMentionUserIds(userIds?: string[]): string[] | undefined {
    if (!userIds) {
      return undefined;
    }

    const normalized = Array.from(
      new Set(userIds.map((id) => id.trim())),
    ).filter(Boolean);

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

  private async notifyPostMentions(
    authorId: string,
    postId: string,
    mentionUserIds: string[],
  ) {
    if (!mentionUserIds.length) {
      return;
    }

    const targetUserIds = mentionUserIds.filter((id) => id !== authorId);
    if (!targetUserIds.length) {
      return;
    }

    const author = await this.prisma.utilisateurs.findUnique({
      where: { id: authorId },
      select: {
        nom: true,
        prenom: true,
      },
    });

    const authorName =
      `${author?.nom ?? ''} ${author?.prenom ?? ''}`.trim() || 'Quelqu un';

    await Promise.all(
      targetUserIds.map((utilisateurId) =>
        this.notificationsService.createPostMentionNotification({
          utilisateurId,
          postId,
          auteurId: authorId,
          auteurNomComplet: authorName,
        }),
      ),
    );
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

    if (
      !hasContent &&
      !hasMedia &&
      !hasLocation &&
      !hasHashtags &&
      !hasMentions
    ) {
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

  private async buildFavoriteMeta(
    postIds: string[],
    currentUserId?: string,
  ): Promise<{
    favoriteCountsByPostId: Map<string, number>;
    favoritePostIdsByCurrentUser: Set<string>;
  }> {
    if (!postIds.length) {
      return {
        favoriteCountsByPostId: new Map(),
        favoritePostIdsByCurrentUser: new Set(),
      };
    }

    const favoriteCounts = await this.prisma.post_favorites.groupBy({
      by: ['post_id'],
      where: {
        post_id: { in: postIds },
      },
      _count: {
        post_id: true,
      },
    });

    const favoriteCountsByPostId = new Map<string, number>(
      favoriteCounts.map((item) => [item.post_id, item._count.post_id]),
    );

    let favoritePostIdsByCurrentUser = new Set<string>();

    if (currentUserId) {
      const currentUserFavorites = await this.prisma.post_favorites.findMany({
        where: {
          user_id: currentUserId,
          post_id: { in: postIds },
        },
        select: {
          post_id: true,
        },
      });

      favoritePostIdsByCurrentUser = new Set(
        currentUserFavorites.map((item) => item.post_id),
      );
    }

    return {
      favoriteCountsByPostId,
      favoritePostIdsByCurrentUser,
    };
  }

  private withFavoriteMeta<T extends { id: string }>(
    post: T,
    favoriteCountsByPostId: Map<string, number>,
    favoritePostIdsByCurrentUser: Set<string>,
  ): PostWithFavoriteMeta<T> {
    return {
      ...post,
      is_favorite: favoritePostIdsByCurrentUser.has(post.id),
      favorite_count: favoriteCountsByPostId.get(post.id) ?? 0,
    };
  }

  private async withFavoriteMetaList<T extends { id: string }>(
    posts: T[],
    currentUserId?: string,
  ): Promise<Array<PostWithFavoriteMeta<T>>> {
    const postIds = posts.map((post) => post.id);
    const { favoriteCountsByPostId, favoritePostIdsByCurrentUser } =
      await this.buildFavoriteMeta(postIds, currentUserId);

    return posts.map((post) =>
      this.withFavoriteMeta(
        post,
        favoriteCountsByPostId,
        favoritePostIdsByCurrentUser,
      ),
    );
  }

  async createPost(userId: string, dto: CreatePostDto) {
    const normalizedMedia = this.normalizeMedia(dto.media);
    const normalizedHashtags = this.normalizeHashtags(dto.hashtags) ?? [];
    const normalizedMentionUserIds =
      this.normalizeMentionUserIds(dto.mentioned_user_ids) ?? [];
    const normalizedHiddenUserIds =
      this.normalizeHiddenUserIds(dto.hidden_user_ids) ?? [];
    const normalizedLocation = dto.location?.trim() || undefined;
    const normalizedVisibility = this.normalizeVisibility(dto.visibility);

    this.ensurePublicationContent(
      dto.content,
      normalizedMedia,
      normalizedLocation,
      normalizedHashtags,
      normalizedMentionUserIds,
    );

    await this.ensureMentionUsersExist(normalizedMentionUserIds);
    await this.ensureMentionUsersExist(
      normalizedHiddenUserIds.filter((id) => id !== userId),
    );

    const created = await this.prisma.$transaction(async (tx) => {
      const post = await tx.posts.create({
        data: {
          user_id: userId,
          content: dto.content?.trim() || '',
          visibility: normalizedVisibility,
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

      if (normalizedHiddenUserIds.length) {
        await tx.post_hidden_users.createMany({
          data: normalizedHiddenUserIds
            .filter((hiddenUserId) => hiddenUserId !== userId)
            .map((hiddenUserId) => ({
              post_id: post.id,
              hidden_user_id: hiddenUserId,
            })),
        });
      }

      return post;
    });

    if (normalizedMentionUserIds.length) {
      await this.notifyPostMentions(
        userId,
        created.id,
        normalizedMentionUserIds,
      );
    }

    const createdPost = await this.getPostOrThrow(created.id);
    const [postWithFavorite] = await this.withFavoriteMetaList(
      [createdPost],
      userId,
    );
    return postWithFavorite;
  }

  async findPosts(limit?: string, offset?: string, currentUserId?: string) {
    const parsedLimit = Number.parseInt(limit ?? '20', 10);
    const parsedOffset = Number.parseInt(offset ?? '0', 10);

    const safeLimit = Number.isNaN(parsedLimit)
      ? 20
      : Math.min(parsedLimit, 100);
    const safeOffset = Number.isNaN(parsedOffset)
      ? 0
      : Math.max(parsedOffset, 0);

    const hiddenUserIds = currentUserId
      ? await this.getHiddenUserIdsFor(currentUserId)
      : [];
    const followingUserIds = currentUserId
      ? await this.getFollowingUserIdsFor(currentUserId)
      : [];

    const visibilityFilters = currentUserId
      ? [
          { visibility: 'PUBLIC' },
          { user_id: currentUserId },
          ...(followingUserIds.length
            ? [
                {
                  AND: [
                    { visibility: 'PRIVATE' },
                    { user_id: { in: followingUserIds } },
                  ],
                },
              ]
            : []),
          {
            AND: [
              { visibility: 'MASKED' },
              {
                hidden_users: {
                  none: {
                    hidden_user_id: currentUserId,
                  },
                },
              },
            ],
          },
        ]
      : [{ visibility: 'PUBLIC' }];

    const posts = await this.prisma.posts.findMany({
      where: {
        AND: [
          {
            OR: visibilityFilters,
          },
          hiddenUserIds.length ? { user_id: { notIn: hiddenUserIds } } : {},
        ],
      },
      orderBy: { created_at: 'desc' },
      take: safeLimit,
      skip: safeOffset,
      include: this.postInclude,
    });

    const postsWithReactions = await Promise.all(
      posts.map(async (post) => ({
        ...post,
        reactions: await this.getReactions(post.id, currentUserId),
      })),
    );

    return this.withFavoriteMetaList(postsWithReactions, currentUserId);
  }

  async findPostById(postId: string, currentUserId?: string) {
    if (currentUserId) {
      await this.ensurePostVisibleToUser(postId, currentUserId);
    }

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

    const enrichedPost = {
      ...post,
      reactions: await this.getReactions(post.id, currentUserId),
    };

    const [postWithFavorite] = await this.withFavoriteMetaList(
      [enrichedPost],
      currentUserId,
    );

    return postWithFavorite;
  }

  async findPostsByUser(
    targetUserId: string,
    currentUserId: string,
    limit?: string,
    offset?: string,
  ) {
    const parsedLimit = Number.parseInt(limit ?? '20', 10);
    const parsedOffset = Number.parseInt(offset ?? '0', 10);

    const safeLimit = Number.isNaN(parsedLimit)
      ? 20
      : Math.min(parsedLimit, 100);
    const safeOffset = Number.isNaN(parsedOffset)
      ? 0
      : Math.max(parsedOffset, 0);

    const userExists = await this.prisma.utilisateurs.findUnique({
      where: { id: targetUserId },
      select: { id: true },
    });

    if (!userExists) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    const hiddenUserIds = await this.getHiddenUserIdsFor(currentUserId);
    if (
      targetUserId !== currentUserId &&
      hiddenUserIds.includes(targetUserId)
    ) {
      throw new ForbiddenException('Cette personne est masquee');
    }

    const isFollowingAuthor =
      targetUserId !== currentUserId &&
      (await this.prisma.user_follows.count({
        where: {
          follower_id: currentUserId,
          followed_id: targetUserId,
        },
      })) > 0;

    const visibilityFilter =
      targetUserId === currentUserId
        ? {}
        : {
            OR: [
              { visibility: 'PUBLIC' },
              ...(isFollowingAuthor ? [{ visibility: 'PRIVATE' }] : []),
              {
                AND: [
                  { visibility: 'MASKED' },
                  {
                    hidden_users: {
                      none: {
                        hidden_user_id: currentUserId,
                      },
                    },
                  },
                ],
              },
            ],
          };

    const posts = await this.prisma.posts.findMany({
      where: {
        user_id: targetUserId,
        ...visibilityFilter,
      },
      orderBy: { created_at: 'desc' },
      take: safeLimit,
      skip: safeOffset,
      include: this.postInclude,
    });

    const postsWithReactions = await Promise.all(
      posts.map(async (post) => ({
        ...post,
        reactions: await this.getReactions(post.id, currentUserId),
      })),
    );

    return this.withFavoriteMetaList(postsWithReactions, currentUserId);
  }

  async updatePost(postId: string, userId: string, dto: UpdatePostDto) {
    const post = await this.prisma.posts.findUnique({
      where: { id: postId },
      include: {
        hashtags: { select: { hashtag: true } },
        mentions: { select: { mentioned_user_id: true } },
        hidden_users: { select: { hidden_user_id: true } },
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
    const nextMedia =
      dto.media !== undefined
        ? normalizedMedia
        : this.parseStoredMedia(post.media);
    const nextLocation =
      dto.location !== undefined
        ? dto.location?.trim() || ''
        : post.location || '';
    const nextVisibility =
      dto.visibility !== undefined
        ? this.normalizeVisibility(dto.visibility)
        : this.normalizeVisibility(post.visibility ?? undefined);

    const normalizedHashtags = this.normalizeHashtags(dto.hashtags);
    const normalizedMentionUserIds = this.normalizeMentionUserIds(
      dto.mentioned_user_ids,
    );
    const normalizedHiddenUserIds = this.normalizeHiddenUserIds(
      dto.hidden_user_ids,
    );

    const nextHashtags =
      normalizedHashtags !== undefined
        ? normalizedHashtags
        : post.hashtags.map((item) => item.hashtag);

    const nextMentionUserIds =
      normalizedMentionUserIds !== undefined
        ? normalizedMentionUserIds
        : post.mentions.map((item) => item.mentioned_user_id);

    const nextHiddenUserIds =
      normalizedHiddenUserIds !== undefined
        ? normalizedHiddenUserIds.filter(
            (hiddenUserId) => hiddenUserId !== userId,
          )
        : post.hidden_users.map((item) => item.hidden_user_id);

    this.ensurePublicationContent(
      nextContent,
      nextMedia,
      nextLocation,
      nextHashtags,
      nextMentionUserIds,
    );

    await this.ensureMentionUsersExist(nextMentionUserIds);
    await this.ensureMentionUsersExist(nextHiddenUserIds);

    await this.prisma.$transaction(async (tx) => {
      await tx.posts.update({
        where: { id: postId },
        data: {
          content: nextContent?.trim() || '',
          visibility: nextVisibility,
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

      if (normalizedHiddenUserIds !== undefined) {
        await tx.post_hidden_users.deleteMany({ where: { post_id: postId } });
        if (nextHiddenUserIds.length) {
          await tx.post_hidden_users.createMany({
            data: nextHiddenUserIds.map((hiddenUserId) => ({
              post_id: postId,
              hidden_user_id: hiddenUserId,
            })),
          });
        }
      }
    });

    if (normalizedMentionUserIds !== undefined) {
      const previousMentionIds = new Set(
        post.mentions.map((item) => item.mentioned_user_id),
      );
      const newlyMentionedUserIds = normalizedMentionUserIds.filter(
        (mentionedUserId) => !previousMentionIds.has(mentionedUserId),
      );

      if (newlyMentionedUserIds.length) {
        await this.notifyPostMentions(userId, postId, newlyMentionedUserIds);
      }
    }

    const updatedPost = await this.getPostOrThrow(postId);
    const [postWithFavorite] = await this.withFavoriteMetaList(
      [updatedPost],
      userId,
    );
    return postWithFavorite;
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

  async sharePost(postId: string, userId: string, dto: SharePostDto) {
    await this.ensurePostVisibleToUser(postId, userId);

    const sourcePost = await this.prisma.posts.findUnique({
      where: { id: postId },
      include: {
        user: {
          select: {
            id: true,
            nom: true,
            prenom: true,
          },
        },
        hashtags: {
          select: {
            hashtag: true,
          },
        },
        mentions: {
          select: {
            mentioned_user_id: true,
          },
        },
      },
    });

    if (!sourcePost) {
      throw new NotFoundException('Publication introuvable');
    }

    const sourceMedia = this.parseStoredMedia(sourcePost.media);
    const sourceHashtags = sourcePost.hashtags.map((item) => item.hashtag);
    const sourceMentionUserIds = sourcePost.mentions.map(
      (item) => item.mentioned_user_id,
    );

    const authorLabel =
      `${sourcePost.user.nom} ${sourcePost.user.prenom}`.trim();
    const sourceContent = (sourcePost.content ?? '')
      .replace(/\[\[shared:[^\]]*\]\]/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    const userMessage = dto.message?.trim() ?? '';
    const sharePayload = {
      author: authorLabel,
      content: sourceContent,
      location: sourcePost.location ?? null,
      created_at: sourcePost.created_at,
      originalPostId: postId,
    };
    const encodedPayload = Buffer.from(JSON.stringify(sharePayload)).toString(
      'base64',
    );
    const sharedToken = `[[shared:${encodedPayload}]]`;
    const sharedContent = userMessage
      ? `${userMessage}\n\n${sharedToken}`
      : sharedToken;

    const created = await this.prisma.$transaction(async (tx) => {
      const post = await tx.posts.create({
        data: {
          user_id: userId,
          content: sharedContent,
          visibility: 'PUBLIC',
          location: sourcePost.location,
          media: sourceMedia as Prisma.InputJsonValue | undefined,
        },
      });

      if (sourceHashtags.length) {
        await tx.post_hashtags.createMany({
          data: sourceHashtags.map((hashtag) => ({
            post_id: post.id,
            hashtag,
          })),
        });
      }

      if (sourceMentionUserIds.length) {
        await tx.post_mentions.createMany({
          data: sourceMentionUserIds.map((mentionedUserId) => ({
            post_id: post.id,
            mentioned_user_id: mentionedUserId,
          })),
        });
      }

      return post;
    });

    const sharedPost = await this.getPostOrThrow(created.id);
    const [postWithFavorite] = await this.withFavoriteMetaList(
      [sharedPost],
      userId,
    );
    return postWithFavorite;
  }

  async addPostToFavorites(postId: string, userId: string) {
    await this.ensurePostVisibleToUser(postId, userId);

    await this.prisma.post_favorites.upsert({
      where: {
        post_id_user_id: {
          post_id: postId,
          user_id: userId,
        },
      },
      update: {},
      create: {
        post_id: postId,
        user_id: userId,
      },
    });

    const post = await this.findPostById(postId, userId);
    return post;
  }

  async removePostFromFavorites(postId: string, userId: string) {
    await this.ensurePostVisibleToUser(postId, userId);

    await this.prisma.post_favorites.deleteMany({
      where: {
        post_id: postId,
        user_id: userId,
      },
    });

    const post = await this.findPostById(postId, userId);
    return post;
  }

  async findMyFavoritePosts(userId: string, limit?: string, offset?: string) {
    const parsedLimit = Number.parseInt(limit ?? '20', 10);
    const parsedOffset = Number.parseInt(offset ?? '0', 10);

    const safeLimit = Number.isNaN(parsedLimit)
      ? 20
      : Math.min(parsedLimit, 100);
    const safeOffset = Number.isNaN(parsedOffset)
      ? 0
      : Math.max(parsedOffset, 0);

    const hiddenUserIds = await this.getHiddenUserIdsFor(userId);
    const followingUserIds = await this.getFollowingUserIdsFor(userId);

    const visibilityFilters = [
      { visibility: 'PUBLIC' },
      { user_id: userId },
      ...(followingUserIds.length
        ? [
            {
              AND: [
                { visibility: 'PRIVATE' },
                { user_id: { in: followingUserIds } },
              ],
            },
          ]
        : []),
      {
        AND: [
          { visibility: 'MASKED' },
          {
            hidden_users: {
              none: {
                hidden_user_id: userId,
              },
            },
          },
        ],
      },
    ];

    const favoriteLinks = await this.prisma.post_favorites.findMany({
      where: {
        user_id: userId,
        post: {
          AND: [
            {
              OR: visibilityFilters,
            },
            hiddenUserIds.length ? { user_id: { notIn: hiddenUserIds } } : {},
          ],
        },
      },
      orderBy: { created_at: 'desc' },
      take: safeLimit,
      skip: safeOffset,
      include: {
        post: {
          include: this.postInclude,
        },
      },
    });

    const posts = favoriteLinks.map((item) => item.post);

    const postsWithReactions = await Promise.all(
      posts.map(async (post) => ({
        ...post,
        reactions: await this.getReactions(post.id, userId),
      })),
    );

    return this.withFavoriteMetaList(postsWithReactions, userId);
  }

  async getMyFavoritePostsCount(userId: string) {
    const count = await this.prisma.post_favorites.count({
      where: { user_id: userId },
    });

    return { count };
  }

  async createComment(postId: string, userId: string, dto: CreateCommentDto) {
    const content = dto.content.trim();
    if (!content) {
      throw new BadRequestException('Le commentaire ne peut pas etre vide');
    }

    const normalizedMentionUserIds =
      this.normalizeMentionUserIds(dto.mentioned_user_ids) ?? [];
    await this.ensureMentionUsersExist(normalizedMentionUserIds);

    const post = await this.prisma.posts.findUnique({
      where: { id: postId },
      select: { id: true, user_id: true, visibility: true },
    });

    if (!post) {
      throw new NotFoundException('Publication introuvable');
    }

    const isFollowingAuthor =
      post.user_id !== userId &&
      (await this.prisma.user_follows.count({
        where: {
          follower_id: userId,
          followed_id: post.user_id,
        },
      })) > 0;

    if (!this.canUserViewPost(post, userId, isFollowingAuthor)) {
      throw new ForbiddenException('Cette publication est privee');
    }

    const hiddenUserIds = await this.getHiddenUserIdsFor(userId);
    if (hiddenUserIds.includes(post.user_id)) {
      throw new ForbiddenException('Cette publication est masquee');
    }

    const createdComment = await this.prisma.comments.create({
      data: {
        post_id: postId,
        user_id: userId,
        content,
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

    const commenterNomComplet =
      `${createdComment.user.nom} ${createdComment.user.prenom}`.trim();

    const replyToCommentId = this.parseReplyToCommentId(content);
    let repliedUserId: string | null = null;

    if (replyToCommentId) {
      const parentComment = await this.prisma.comments.findUnique({
        where: { id: replyToCommentId },
        select: {
          id: true,
          post_id: true,
          user_id: true,
        },
      });

      if (parentComment && parentComment.post_id === postId) {
        repliedUserId = parentComment.user_id;

        if (repliedUserId !== userId) {
          await this.notificationsService.createPostCommentReplyNotification({
            utilisateurId: repliedUserId,
            postId,
            commentId: createdComment.id,
            parentCommentId: parentComment.id,
            replierId: userId,
            replierNomComplet: commenterNomComplet || 'Quelqu un',
          });
        }
      }
    }

    if (post.user_id !== userId && post.user_id !== repliedUserId) {
      await this.notificationsService.createPostCommentNotification({
        utilisateurId: post.user_id,
        postId,
        commentId: createdComment.id,
        commenterId: userId,
        commenterNomComplet: commenterNomComplet || 'Quelqu un',
      });
    }

    if (normalizedMentionUserIds.length) {
      const mentionTargets = normalizedMentionUserIds.filter(
        (mentionedUserId) =>
          mentionedUserId !== userId &&
          mentionedUserId !== post.user_id &&
          mentionedUserId !== repliedUserId,
      );

      if (mentionTargets.length) {
        await Promise.all(
          mentionTargets.map((utilisateurId) =>
            this.notificationsService.createPostCommentMentionNotification({
              utilisateurId,
              postId,
              commentId: createdComment.id,
              commenterId: userId,
              commenterNomComplet: commenterNomComplet || 'Quelqu un',
            }),
          ),
        );
      }
    }

    return createdComment;
  }

  async updateComment(
    postId: string,
    commentId: string,
    userId: string,
    dto: CreateCommentDto,
  ) {
    const content = dto.content.trim();
    if (!content) {
      throw new BadRequestException('Le commentaire ne peut pas etre vide');
    }

    const comment = await this.prisma.comments.findUnique({
      where: { id: commentId },
      select: {
        id: true,
        post_id: true,
        user_id: true,
      },
    });

    if (!comment || comment.post_id !== postId) {
      throw new NotFoundException('Commentaire introuvable');
    }

    if (comment.user_id !== userId) {
      throw new ForbiddenException(
        'Vous ne pouvez pas modifier ce commentaire',
      );
    }

    return this.prisma.comments.update({
      where: { id: commentId },
      data: {
        content,
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

  async deleteComment(postId: string, commentId: string, userId: string) {
    const comment = await this.prisma.comments.findUnique({
      where: { id: commentId },
      select: {
        id: true,
        post_id: true,
        user_id: true,
      },
    });

    if (!comment || comment.post_id !== postId) {
      throw new NotFoundException('Commentaire introuvable');
    }

    if (comment.user_id !== userId) {
      throw new ForbiddenException(
        'Vous ne pouvez pas supprimer ce commentaire',
      );
    }

    await this.prisma.comments.delete({
      where: { id: commentId },
    });

    return { success: true };
  }

  async findCommentsByPost(postId: string, currentUserId: string) {
    await this.ensurePostVisibleToUser(postId, currentUserId);

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

  async hideUser(userId: string, userIdToHide: string) {
    if (userId === userIdToHide) {
      throw new BadRequestException(
        'Vous ne pouvez pas vous masquer vous-meme',
      );
    }

    const targetUser = await this.prisma.utilisateurs.findUnique({
      where: { id: userIdToHide },
      select: { id: true },
    });

    if (!targetUser) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    await this.prisma.user_hidden_users.upsert({
      where: {
        user_id_hidden_user_id: {
          user_id: userId,
          hidden_user_id: userIdToHide,
        },
      },
      update: {},
      create: {
        user_id: userId,
        hidden_user_id: userIdToHide,
      },
    });

    return { success: true };
  }

  async unhideUser(userId: string, userIdToUnhide: string) {
    await this.prisma.user_hidden_users.deleteMany({
      where: {
        user_id: userId,
        hidden_user_id: userIdToUnhide,
      },
    });

    return { success: true };
  }

  async findHiddenUsers(userId: string) {
    return this.prisma.user_hidden_users.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
      include: {
        hidden_user: {
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

  async addReaction(postId: string, userId: string, reactionType: string) {
    const post = await this.prisma.posts.findUnique({
      where: { id: postId },
      select: {
        id: true,
        user_id: true,
        user: {
          select: {
            id: true,
            nom: true,
            prenom: true,
          },
        },
      },
    });

    if (!post) {
      throw new NotFoundException('Publication introuvable');
    }

    const previousReaction = await this.prisma.post_reactions.findUnique({
      where: {
        post_id_user_id: {
          post_id: postId,
          user_id: userId,
        },
      },
      select: {
        reaction_type: true,
      },
    });

    await this.prisma.post_reactions.upsert({
      where: {
        post_id_user_id: {
          post_id: postId,
          user_id: userId,
        },
      },
      update: {
        reaction_type: reactionType,
      },
      create: {
        post_id: postId,
        user_id: userId,
        reaction_type: reactionType,
      },
    });

    const isNewReactionEvent = previousReaction?.reaction_type !== reactionType;
    const isOwnPost = post.user_id === userId;

    if (isNewReactionEvent && !isOwnPost) {
      const reactor = await this.prisma.utilisateurs.findUnique({
        where: { id: userId },
        select: {
          nom: true,
          prenom: true,
        },
      });

      const reactionLabelMap: Record<string, string> = {
        like: 'Like',
        love: 'J adore',
        wow: 'Wow',
        bravo: 'Bravo',
        instructif: 'Instructif',
        soutien: 'Soutien',
        haha: 'Haha',
      };

      const reactorNomComplet =
        `${reactor?.nom ?? ''} ${reactor?.prenom ?? ''}`.trim();

      await this.notificationsService.createPostReactionNotification({
        utilisateurId: post.user_id,
        postId,
        reactorId: userId,
        reactorNomComplet: reactorNomComplet || 'Quelqu un',
        reactionType,
        reactionLabel: reactionLabelMap[reactionType] ?? reactionType,
      });
    }

    return this.getReactions(postId, userId);
  }

  async removeReaction(postId: string, userId: string) {
    await this.getPostOrThrow(postId);

    await this.prisma.post_reactions.deleteMany({
      where: {
        post_id: postId,
        user_id: userId,
      },
    });

    return this.getReactions(postId, userId);
  }

  async getReactions(postId: string, currentUserId?: string) {
    const reactions = await this.prisma.post_reactions.findMany({
      where: { post_id: postId },
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

    const aggregated = reactions.reduce(
      (acc, reaction) => {
        if (!acc[reaction.reaction_type]) {
          acc[reaction.reaction_type] = [];
        }
        acc[reaction.reaction_type].push(reaction.user);
        return acc;
      },
      {} as Record<string, any[]>,
    );

    const userReaction = currentUserId
      ? (reactions.find((reaction) => reaction.user_id === currentUserId)
          ?.reaction_type ?? null)
      : null;

    return {
      aggregated,
      total: reactions.length,
      userReaction,
    };
  }
}
