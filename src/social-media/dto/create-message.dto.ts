/**
 * DTO legacy pour envoyer un message depuis social-media.
 * Non utilisé dans l'implémentation actuelle — la gestion des messages
 * est assurée par CreateMessageDto dans le module `messagerie`.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateMessageDto {
  /** Contenu texte du message. */
  @ApiProperty()
  @IsString()
  @MinLength(1)
  content: string;

  /** URLs des médias joints au message. */
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  media?: string[];
}