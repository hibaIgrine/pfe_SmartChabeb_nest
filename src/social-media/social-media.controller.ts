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
}
