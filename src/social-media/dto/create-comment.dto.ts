/**
 * DTO pour créer ou modifier un commentaire.
 *
 * TOKEN DE RÉPONSE :
 *   Si content contient [[reply:<commentId>]], le commentaire est traité comme une réponse
 *   au commentaire parent identifié par commentId. Le service :
 *     - Vérifie que le commentaire parent appartient au même post.
 *     - Envoie une notification POST_COMMENT_REPLY à l'auteur du commentaire parent.
 *     - Évite de doubler la notification si le repliedUser = l'auteur du post.
 *
 * MENTIONS :
 *   mentioned_user_ids : UUIDs des utilisateurs mentionnés dans le commentaire.
 *   Notifications POST_COMMENT_MENTION envoyées (sauf auteur, auteur du post, repliedUser).
 */
import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export class CreateCommentDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  content: string;

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  mentioned_user_ids?: string[];
}
