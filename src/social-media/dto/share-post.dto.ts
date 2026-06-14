/**
 * DTO pour partager un post existant.
 * Le service sharePost() crée un nouveau post PUBLIC en intégrant :
 *   - Le message personnel de l'utilisateur (si fourni) affiché en tête.
 *   - Un token [[shared:<base64>]] encodant le contenu/auteur/date du post source.
 *   - Le média du post source (copié).
 *   - Les hashtags et mentions du post source (recopiés).
 * Le token est décodé côté frontend pour afficher la preview du post partagé.
 */
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SharePostDto {
  @ApiPropertyOptional({
    description:
      'Message personnel affiché au-dessus de la publication partagée',
    maxLength: 1000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string;
}
