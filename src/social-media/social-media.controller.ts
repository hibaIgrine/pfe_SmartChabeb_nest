/**
 * ============================================================
 * FICHIER : social-media.controller.ts
 * RÔLE    : Routes HTTP REST du réseau social.
 * ============================================================
 *
 * BASE URL : /social-media
 * Tout le controller est protégé par @UseGuards(AuthGuard('jwt')) → JWT obligatoire.
 *
 * ROUTES EXPOSÉES :
 *
 *   POST   /social-media/posts                              body: CreatePostDto
 *     → Crée une publication. Au moins un champ requis (content/media/location/hashtag/mention).
 *
 *   GET    /social-media/posts                              ?limit=20&offset=0
 *     → Fil d'actualité paginé, filtré selon visibilité + utilisateurs masqués.
 *       Chaque post est enrichi de réactions et méta-favoris (is_favorite, favorite_count).
 *
 *   GET    /social-media/posts/:id
 *     → Détail d'un post avec commentaires. Vérifie la visibilité (ensurePostVisibleToUser).
 *
 *   GET    /social-media/users/:id/posts                    ?limit=20&offset=0
 *     → Publications d'un utilisateur spécifique, filtré selon relation follower + masquage.
 *
 *   PATCH  /social-media/posts/:id                         body: UpdatePostDto
 *     → Modifie un post (auteur uniquement). Champs absents → valeurs inchangées.
 *
 *   DELETE /social-media/posts/:id
 *     → Supprime un post (auteur ou ADMIN, selon req.user.role).
 *
 *   POST   /social-media/posts/:id/share                    body: SharePostDto
 *     → Partage un post. Crée un nouveau post avec token [[shared:<b64>]] + message optionnel.
 *
 *   POST   /social-media/posts/:id/comments                 body: CreateCommentDto
 *     → Ajoute un commentaire. Supporte [[reply:commentId]] pour réponses imbriquées.
 *       Déclenche notifications auteur du post + auteur du commentaire parent + mentions.
 *
 *   GET    /social-media/posts/:id/comments
 *     → Liste les commentaires d'un post (triés par date asc).
 *
 *   PATCH  /social-media/posts/:postId/comments/:commentId  body: CreateCommentDto
 *     → Modifie un commentaire (auteur uniquement).
 *
 *   DELETE /social-media/posts/:postId/comments/:commentId
 *     → Supprime un commentaire (auteur ou ADMIN selon req.user.role).
 *
 *   POST   /social-media/posts/:id/reactions                body: CreateReactionDto
 *     → Ajoute/remplace une réaction (upsert). Notifie l'auteur si nouvelle réaction.
 *       Types : like, love, wow, bravo, instructif, soutien, haha.
 *
 *   DELETE /social-media/posts/:id/reactions
 *     → Retire la réaction de l'utilisateur courant.
 *
 *   GET    /social-media/posts/:id/reactions
 *     → { aggregated: { [type]: User[] }, total, userReaction }.
 *
 *   POST   /social-media/posts/:id/favorites
 *     → Ajoute un post aux favoris (upsert idempotent).
 *
 *   DELETE /social-media/posts/:id/favorites
 *     → Retire un post des favoris.
 *
 *   GET    /social-media/favorites/posts                     ?limit=20&offset=0
 *     → Fil de favoris paginé, filtré selon visibilité + utilisateurs masqués.
 *
 *   GET    /social-media/favorites/count
 *     → Nombre total de posts mis en favoris par l'utilisateur courant.
 *
 *   POST   /social-media/users/:id/hide
 *     → Masque un utilisateur (ses posts disparaissent du fil). Soi-même interdit.
 *
 *   DELETE /social-media/users/:id/hide
 *     → Démasque un utilisateur.
 *
 *   GET    /social-media/users/hidden
 *     → Liste tous les utilisateurs masqués par l'utilisateur courant.
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CreateCommentDto } from '../social-media/dto/create-comment.dto';
import { CreatePostDto } from '../social-media/dto/create-post.dto';
import { CreateReactionDto } from './dto/create-reaction.dto';
import { SharePostDto } from './dto/share-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { SocialMediaService } from './social-media.service';

@Controller('social-media')
@UseGuards(AuthGuard('jwt'))
export class SocialMediaController {
  constructor(private readonly socialMediaService: SocialMediaService) {}

  @Post('posts')
  createPost(@Request() req: any, @Body() body: CreatePostDto) {
    return this.socialMediaService.createPost(req.user.userId, body);
  }

  @Get('posts')
  findPosts(
    @Request() req: any,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.socialMediaService.findPosts(limit, offset, req.user.userId);
  }

  @Get('posts/:id')
  findPostById(@Param('id') id: string, @Request() req: any) {
    return this.socialMediaService.findPostById(id, req.user.userId);
  }

  @Get('users/:id/posts')
  findPostsByUser(
    @Param('id') userId: string,
    @Request() req: any,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.socialMediaService.findPostsByUser(
      userId,
      req.user.userId,
      limit,
      offset,
    );
  }

  @Patch('posts/:id')
  updatePost(
    @Param('id') id: string,
    @Request() req: any,
    @Body() body: UpdatePostDto,
  ) {
    return this.socialMediaService.updatePost(id, req.user.userId, body);
  }

  @Delete('posts/:id')
  deletePost(@Param('id') id: string, @Request() req: any) {
    return this.socialMediaService.deletePost(id, req.user.userId, req.user.role === 'ADMIN');
  }

  @Post('posts/:id/share')
  sharePost(
    @Param('id') postId: string,
    @Request() req: any,
    @Body() body: SharePostDto,
  ) {
    return this.socialMediaService.sharePost(postId, req.user.userId, body);
  }

  @Post('posts/:id/comments')
  createComment(
    @Param('id') postId: string,
    @Request() req: any,
    @Body() body: CreateCommentDto,
  ) {
    return this.socialMediaService.createComment(postId, req.user.userId, body);
  }

  @Get('posts/:id/comments')
  findComments(@Param('id') postId: string, @Request() req: any) {
    return this.socialMediaService.findCommentsByPost(postId, req.user.userId);
  }

  @Patch('posts/:postId/comments/:commentId')
  updateComment(
    @Param('postId') postId: string,
    @Param('commentId') commentId: string,
    @Request() req: any,
    @Body() body: CreateCommentDto,
  ) {
    return this.socialMediaService.updateComment(
      postId,
      commentId,
      req.user.userId,
      body,
    );
  }

  @Delete('posts/:postId/comments/:commentId')
  deleteComment(
    @Param('postId') postId: string,
    @Param('commentId') commentId: string,
    @Request() req: any,
  ) {
    return this.socialMediaService.deleteComment(
      postId,
      commentId,
      req.user.userId,
      req.user.role === 'ADMIN',
    );
  }

  @Post('posts/:id/reactions')
  addReaction(
    @Param('id') postId: string,
    @Request() req: any,
    @Body() body: CreateReactionDto,
  ) {
    return this.socialMediaService.addReaction(
      postId,
      req.user.userId,
      body.reaction_type,
    );
  }

  @Delete('posts/:id/reactions')
  removeReaction(@Param('id') postId: string, @Request() req: any) {
    return this.socialMediaService.removeReaction(postId, req.user.userId);
  }

  @Get('posts/:id/reactions')
  getReactions(@Param('id') postId: string, @Request() req: any) {
    return this.socialMediaService.getReactions(postId, req.user.userId);
  }

  @Post('posts/:id/favorites')
  addToFavorites(@Param('id') postId: string, @Request() req: any) {
    return this.socialMediaService.addPostToFavorites(postId, req.user.userId);
  }

  @Delete('posts/:id/favorites')
  removeFromFavorites(@Param('id') postId: string, @Request() req: any) {
    return this.socialMediaService.removePostFromFavorites(
      postId,
      req.user.userId,
    );
  }

  @Get('favorites/posts')
  findMyFavoritePosts(
    @Request() req: any,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.socialMediaService.findMyFavoritePosts(
      req.user.userId,
      limit,
      offset,
    );
  }

  @Get('favorites/count')
  getMyFavoritePostsCount(@Request() req: any) {
    return this.socialMediaService.getMyFavoritePostsCount(req.user.userId);
  }

  @Post('users/:id/hide')
  hideUser(@Param('id') userIdToHide: string, @Request() req: any) {
    return this.socialMediaService.hideUser(req.user.userId, userIdToHide);
  }

  @Delete('users/:id/hide')
  unhideUser(@Param('id') userIdToUnhide: string, @Request() req: any) {
    return this.socialMediaService.unhideUser(req.user.userId, userIdToUnhide);
  }

  @Get('users/hidden')
  findHiddenUsers(@Request() req: any) {
    return this.socialMediaService.findHiddenUsers(req.user.userId);
  }
}
