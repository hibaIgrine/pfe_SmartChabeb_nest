import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateCommentDto } from '../social-media/dto/create-comment.dto';
import { CreatePostDto } from '../social-media/dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';

@Injectable()
export class SocialMediaService {
  constructor(private readonly prisma: PrismaService) {}

  async createPost(userId: string, dto: CreatePostDto) {
    return this.prisma.posts.create({
      data: {
        user_id: userId,
        content: dto.content,
        media: dto.media?.length ? dto.media : undefined,
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
        _count: {
          select: {
            comments: true,
          },
        },
      },
    });
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
      include: {
        user: {
          select: {
            id: true,
            nom: true,
            prenom: true,
            photo_profil_url: true,
          },
        },
        _count: {
          select: {
            comments: true,
          },
        },
      },
    });
  }

  async findPostById(postId: string) {
    const post = await this.prisma.posts.findUnique({
      where: { id: postId },
      include: {
        user: {
          select: {
            id: true,
            nom: true,
            prenom: true,
            photo_profil_url: true,
          },
        },
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
        _count: {
          select: {
            comments: true,
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
      select: { id: true, user_id: true },
    });

    if (!post) {
      throw new NotFoundException('Publication introuvable');
    }

    if (post.user_id !== userId) {
      throw new ForbiddenException(
        'Vous ne pouvez pas modifier cette publication',
      );
    }

    return this.prisma.posts.update({
      where: { id: postId },
      data: {
        content: dto.content,
        media: dto.media?.length ? dto.media : undefined,
      },
    });
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
