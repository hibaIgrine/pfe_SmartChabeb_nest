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
  findPosts(@Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.socialMediaService.findPosts(limit, offset);
  }

  @Get('posts/:id')
  findPostById(@Param('id') id: string) {
    return this.socialMediaService.findPostById(id);
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
    return this.socialMediaService.deletePost(id, req.user.userId);
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
  findComments(@Param('id') postId: string) {
    return this.socialMediaService.findCommentsByPost(postId);
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
}
