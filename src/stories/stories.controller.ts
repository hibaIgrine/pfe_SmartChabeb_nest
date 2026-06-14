/**
 * ============================================================
 * FICHIER : stories.controller.ts
 * RÔLE    : Routes HTTP REST des stories éphémères.
 * ============================================================
 *
 * BASE URL : /stories
 * Toutes les routes sont protégées individuellement par @UseGuards(AuthGuard('jwt')).
 *
 * ROUTES EXPOSÉES :
 *
 *   POST /stories/create                      [JWT requis]
 *     body: CreateStoryDto { content?, media?: [{ type, url, textY? }] }
 *     → Crée une story qui expirera 24h après sa création.
 *     → Retourne la story avec user + views normalisés.
 *
 *   GET  /stories/feed                        [JWT requis]
 *     → Retourne 1 story active par auteur (la plus récente), excluant soi-même.
 *     → Chaque story est enrichie de { hasViewed, viewCount }.
 *     → Utilisé pour afficher les bulles de stories dans le fil d'actualité.
 *
 *   GET  /stories/user/:userId                [JWT requis]
 *     → Retourne toutes les stories actives d'un utilisateur donné.
 *     → Enrichi de { hasViewed } selon l'utilisateur courant.
 *
 *   GET  /stories/me/archive                  [JWT requis]
 *     → Toutes les stories de l'utilisateur courant (actives + expirées).
 *     → Enrichi de { isExpired, viewCount }.
 *
 *   POST /stories/:storyId/view               [JWT requis]
 *     → Marque une story comme vue par l'utilisateur courant.
 *     → Idempotent : une deuxième vue sur la même story retourne l'enregistrement existant.
 *
 *   DELETE /stories/:storyId                  [JWT requis]
 *     → Supprime une story (auteur uniquement ou ADMIN selon req.user.role).
 *     → Utilise deleteMany pour ne pas lancer d'exception si la story est introuvable.
 */

import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  UseGuards,
  Request,
  Body,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { StoriesService } from './stories.service';
import { CreateStoryDto } from './dto/create-story.dto';

@Controller('stories')
export class StoriesController {
  constructor(private storiesService: StoriesService) {}

  @Post('create')
  @UseGuards(AuthGuard('jwt'))
  async createStory(@Request() req, @Body() dto: CreateStoryDto) {
    const userId = req.user.userId;
    return this.storiesService.createStory(userId, dto);
  }

  @Get('feed')
  @UseGuards(AuthGuard('jwt'))
  async getStoriesForFeed(@Request() req) {
    const userId = req.user.userId;
    return this.storiesService.getActiveStoriesForFeed(userId);
  }

  @Get('user/:userId')
  @UseGuards(AuthGuard('jwt'))
  async getStoriesByUser(@Param('userId') userId: string, @Request() req) {
    const currentUserId = req.user.userId;
    return this.storiesService.getActiveStoriesByUser(userId, currentUserId);
  }

  @Get('me/archive')
  @UseGuards(AuthGuard('jwt'))
  async getMyStoriesArchive(@Request() req) {
    const userId = req.user.userId;
    return this.storiesService.getMyStoriesArchive(userId);
  }

  @Post(':storyId/view')
  @UseGuards(AuthGuard('jwt'))
  async markAsViewed(@Param('storyId') storyId: string, @Request() req) {
    const viewerId = req.user.userId;
    return this.storiesService.markStoryAsViewed(storyId, viewerId);
  }

  @Delete(':storyId')
  @UseGuards(AuthGuard('jwt'))
  async deleteStory(@Param('storyId') storyId: string, @Request() req) {
    const userId = req.user.userId;
    return this.storiesService.deleteStory(storyId, userId, req.user.role === 'ADMIN');
  }
}
