/**
 * DTO pour modifier un message existant.
 * Tous les champs sont optionnels ; seuls ceux fournis remplacent les valeurs actuelles.
 * Réservé à l'auteur du message (ForbiddenException sinon).
 * Après modification, edited_at est mis à jour.
 * La règle assertPrivateMessagePayload est ré-évaluée avec les nouvelles valeurs.
 */
import { message_type } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateMessageDto {
  @IsOptional()
  @IsEnum(message_type)
  type?: message_type;

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  content?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @IsString({ each: true })
  media?: string[];
}
