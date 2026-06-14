/**
 * ============================================================
 * FICHIER : create-user.dto.ts
 * RÔLE    : Valide les données reçues lors de l'inscription (POST /users).
 * ============================================================
 *
 * Ce DTO définit les champs attendus lors de la création d'un compte adhérent.
 * La validation est automatique grâce au ValidationPipe global (main.ts).
 *
 * CHAMPS OBLIGATOIRES : nom, prenom, email, mot_de_passe
 * CHAMPS OPTIONNELS   : genre, date_naissance, id_centre
 *
 * @ApiProperty / @ApiPropertyOptional → affiche ces champs dans la doc Swagger (/api)
 * @MinLength(3) → minimum 3 caractères (prévient les noms vides ou trop courts)
 * @MinLength(8) → mot de passe minimum 8 caractères (sécurité basique)
 * @IsEmail()    → valide le format email (exemple@domaine.com)
 * @IsUUID()     → valide que id_centre est un UUID PostgreSQL valide
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsString,
  MinLength,
  IsOptional,
  IsUUID,
} from 'class-validator';

export class CreateUserDto {
  /** Nom de famille — minimum 3 caractères */
  @ApiProperty()
  @IsString()
  @MinLength(3)
  nom: string;

  /** Prénom — minimum 3 caractères */
  @ApiProperty()
  @IsString()
  @MinLength(3)
  prenom: string;

  /** Email unique — sert d'identifiant de connexion */
  @ApiProperty()
  @IsEmail({}, { message: 'Format email invalide' })
  email: string;

  /** Mot de passe en clair — sera haché avec bcrypt dans UsersService.create() */
  @ApiProperty()
  @MinLength(8, { message: 'Le mot de passe doit faire au moins 8 caractères' })
  mot_de_passe: string;

  /** Genre : 'HOMME' ou 'FEMME' (optionnel, peut être complété plus tard) */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  genre?: string;

  /** Date de naissance au format 'YYYY-MM-DD' — convertie en DateTime par le service */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  date_naissance?: string;

  /** UUID du centre choisi lors de l'onboarding (optionnel, peut être ajouté après) */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  id_centre?: string;
}
