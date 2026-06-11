import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStoryDto } from './dto/create-story.dto';
import { Prisma } from '@prisma/client';

type StoryMediaItem = {
  type: 'image' | 'video';
  url: string;
  textY?: number;
};

@Injectable()
export class StoriesService {
  constructor(private prisma: PrismaService) {}

  private normalizeMedia(media: unknown): StoryMediaItem[] | undefined {
    if (!media) {
      return undefined;
    }

    if (Array.isArray(media)) {
      return media.filter((item): item is StoryMediaItem => {
        return (
          Boolean(item) &&
          typeof item === 'object' &&
          item !== null &&
          typeof (item as StoryMediaItem).url === 'string' &&
          typeof (item as StoryMediaItem).type === 'string' &&
          ((item as StoryMediaItem).textY === undefined ||
            typeof (item as StoryMediaItem).textY === 'number')
        );
      });
    }

    if (typeof media === 'string') {
      try {
        const parsed = JSON.parse(media);
        return this.normalizeMedia(parsed);
      } catch {
        return undefined;
      }
    }

    if (typeof media === 'object') {
      const item = media as Partial<StoryMediaItem>;
      if (typeof item.url === 'string' && typeof item.type === 'string') {
        return [item as StoryMediaItem];
      }
    }

    return undefined;
  }

  private normalizeStory<T extends { media?: unknown }>(story: T) {
    return {
      ...story,
      media: this.normalizeMedia(story.media),
    };
  }

  /**
   * Créer une nouvelle story (expire dans 24h)
   */
  async createStory(userId: string, dto: CreateStoryDto) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // +24h
    const storyMedia = dto.media?.map((item) => ({
      type: item.type,
      url: item.url,
      textY: item.textY,
    }));

    const story = await this.prisma.stories.create({
      data: {
        user_id: userId,
        content: dto.content || null,
        media: (storyMedia as Prisma.InputJsonValue | undefined) ?? undefined,
        expires_at: expiresAt,
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
        views: true,
      },
    });

    return this.normalizeStory(story);
  }

  /**
   * Récupérer les stories actives (non expirées) par utilisateur
   */
  async getActiveStoriesByUser(userId: string, currentUserId: string) {
    const now = new Date();

    const stories = await this.prisma.stories.findMany({
      where: {
        user_id: userId,
        expires_at: {
          gt: now,
        },
      },
      orderBy: {
        created_at: 'desc',
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
        views: {
          select: {
            viewer_id: true,
            viewed_at: true,
            viewer: {
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

    // Ajouter info si l'utilisateur a vu les stories
    return stories.map((story) =>
      this.normalizeStory({
        ...story,
        hasViewed: story.views.some((v) => v.viewer_id === currentUserId),
        viewCount: story.views.length,
      }),
    );
  }

  /**
   * Récupérer les stories actives de tous les utilisateurs (pour le fil)
   */
  async getActiveStoriesForFeed(currentUserId: string) {
    const now = new Date();

    // Récupérer les stories uniques par utilisateur (plus récente)
    const stories = await this.prisma.stories.findMany({
      where: {
        expires_at: {
          gt: now,
        },
        NOT: {
          user_id: currentUserId, // Exclure ses propres stories
        },
      },
      orderBy: {
        created_at: 'desc',
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
        views: {
          select: {
            viewer_id: true,
            viewed_at: true,
            viewer: {
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

    // Grouper par utilisateur et prendre la plus récente
    const grouped = new Map();
    stories.forEach((story) => {
      if (!grouped.has(story.user_id)) {
        grouped.set(story.user_id, story);
      }
    });

    return Array.from(grouped.values()).map((story) =>
      this.normalizeStory({
        ...story,
        hasViewed: story.views.some((v) => v.viewer_id === currentUserId),
        viewCount: story.views.length,
      }),
    );
  }

  /**
   * Récupérer toutes les stories de l'utilisateur connecté (archive)
   */
  async getMyStoriesArchive(userId: string) {
    const now = new Date();

    const stories = await this.prisma.stories.findMany({
      where: {
        user_id: userId,
      },
      orderBy: {
        created_at: 'desc',
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
        views: {
          select: {
            viewer_id: true,
            viewed_at: true,
            viewer: {
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

    return stories.map((story) =>
      this.normalizeStory({
        ...story,
        hasViewed: false,
        viewCount: story.views.length,
        isExpired: story.expires_at <= now,
      }),
    );
  }

  /**
   * Marquer une story comme vue
   */
  async markStoryAsViewed(storyId: string, viewerId: string) {
    try {
      return await this.prisma.story_views.create({
        data: {
          story_id: storyId,
          viewer_id: viewerId,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return this.prisma.story_views.findUnique({
          where: {
            story_id_viewer_id: {
              story_id: storyId,
              viewer_id: viewerId,
            },
          },
        });
      }

      throw error;
    }
  }

  /**
   * Supprimer une story
   */
  async deleteStory(storyId: string, userId: string, isAdmin = false) {
    return this.prisma.stories.deleteMany({
      where: isAdmin
        ? { id: storyId }
        : { id: storyId, user_id: userId },
    });
  }

  /**
   * Supprimer les stories expirées (job/cron)
   */
  async deleteExpiredStories() {
    const now = new Date();
    return this.prisma.stories.deleteMany({
      where: {
        expires_at: {
          lt: now,
        },
      },
    });
  }
}
