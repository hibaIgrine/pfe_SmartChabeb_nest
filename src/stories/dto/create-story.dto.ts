/**
 * DTO pour créer une story éphémère.
 *
 * RÈGLE DE CONTENU :
 *   Au moins content ou media doit être fourni (non validé côté DTO, géré implicitement
 *   car les deux champs sont optionnels — une story vide sera créée si les deux sont absents).
 *
 * StoryMediaDto — élément multimédia d'une story :
 *   type  : 'image' | 'video'
 *   url   : URL du fichier uploadé (via le module uploads)
 *   textY : position verticale (en %) du texte superposé sur le média (optionnel)
 *
 * La story expire automatiquement 24h après création (expires_at = now + 86 400 000 ms).
 * Le champ media est stocké en JSON dans la colonne Prisma de type Json.
 */
import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

class StoryMediaDto {
  @IsString()
  @IsIn(['image', 'video'])
  type!: 'image' | 'video';

  @IsString()
  url!: string;

  @IsOptional()
  @IsNumber()
  textY?: number;
}

export class CreateStoryDto {
  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StoryMediaDto)
  media?: StoryMediaDto[];
}
