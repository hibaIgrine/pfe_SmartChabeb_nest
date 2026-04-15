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
