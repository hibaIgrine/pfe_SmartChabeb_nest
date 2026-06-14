/**
 * DTO pour créer une publication.
 *
 * RÈGLE DE CONTENU (ensurePublicationContent) :
 *   Au moins un champ parmi content, media, location, hashtags ou mentioned_user_ids
 *   doit être fourni. Une publication entièrement vide est refusée (BadRequestException).
 *
 * VISIBILITÉ :
 *   PUBLIC  (défaut) → visible par tous.
 *   PRIVATE → visible uniquement par l'auteur et ses followers (user_follows).
 *   MASKED  → visible par tous SAUF les utilisateurs listés dans hidden_user_ids
 *             (stockés dans post_hidden_users).
 *
 * HASHTAGS :
 *   Normalisés : toLowerCase, suppression des #, espaces→_, dédupliqués.
 *   Ex: ["#React JS", "nestjs"] → ["react_js", "nestjs"].
 *
 * MÉDIA :
 *   Tableau de PublicationMediaItemDto { type: image|video|document, url, name? }.
 *   Limité à 10 éléments.
 *
 * PARTAGE (sharePost) :
 *   Un post partagé a un contenu avec token [[shared:<base64>]] généré automatiquement
 *   par sharePost(). Ce DTO n'est pas utilisé pour le partage.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayUnique,
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export const publicationMediaTypes = ['image', 'video', 'document'] as const;
export const publicationVisibilityOptions = [
  'PUBLIC',
  'PRIVATE',
  'MASKED',
] as const;

export type PublicationMediaType = (typeof publicationMediaTypes)[number];
export type PublicationVisibility =
  (typeof publicationVisibilityOptions)[number];

export class PublicationMediaItemDto {
  @ApiProperty({ enum: publicationMediaTypes })
  @IsString()
  @IsIn(publicationMediaTypes)
  type: PublicationMediaType;

  @ApiProperty()
  @IsString()
  url: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;
}

export class CreatePostDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  content?: string;

  @ApiPropertyOptional({ type: [PublicationMediaItemDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  media?: PublicationMediaItemDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({ enum: publicationVisibilityOptions })
  @IsOptional()
  @IsString()
  @IsIn(publicationVisibilityOptions)
  visibility?: PublicationVisibility;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsString({ each: true })
  hashtags?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  mentioned_user_ids?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  hidden_user_ids?: string[];
}
