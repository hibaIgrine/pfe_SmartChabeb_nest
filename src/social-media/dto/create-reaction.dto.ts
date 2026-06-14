/**
 * DTO pour ajouter ou remplacer une réaction sur un post.
 * Un utilisateur ne peut avoir qu'une seule réaction par post (upsert post_reactions).
 * Si la réaction change (ex: like → love), une notification POST_REACTION est renvoyée
 * à l'auteur du post (sauf si c'est son propre post).
 * Types disponibles : like, love, wow, bravo, instructif, soutien, haha.
 */
import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';

export const reactionTypes = [
  'like',
  'love',
  'wow',
  'bravo',
  'instructif',
  'soutien',
  'haha',
] as const;

export type ReactionType = (typeof reactionTypes)[number];

export class CreateReactionDto {
  @ApiProperty({ enum: reactionTypes })
  @IsString()
  @IsIn(reactionTypes)
  reaction_type: ReactionType;
}
