import { PartialType } from '@nestjs/swagger';
import { CreatePostDto } from '../../social-media/dto/create-post.dto';

export class UpdatePostDto extends PartialType(CreatePostDto) {}
