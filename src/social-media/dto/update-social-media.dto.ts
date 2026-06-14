/**
 * DTO placeholder généré par le CLI NestJS.
 * Non utilisé dans l'implémentation actuelle.
 * Le DTO réel de modification de post est UpdatePostDto (PartialType de CreatePostDto).
 */
import { PartialType } from '@nestjs/swagger';
import { CreateSocialMediaDto } from './create-social-media.dto';

export class UpdateSocialMediaDto extends PartialType(CreateSocialMediaDto) {}
