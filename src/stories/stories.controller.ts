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
    return this.storiesService.deleteStory(storyId, userId);
  }
}
