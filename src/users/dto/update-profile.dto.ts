/**
 * ============================================================
 * FICHIER : update-profile.dto.ts
 * RÔLE    : Valide les données de la mise à jour légère du profil.
 * ============================================================
 *
 * Utilisé dans l'étape 3 de l'onboarding Flutter (PATCH /users/update-profile).
 * Seuls 3 champs : email (pour identifier l'utilisateur), genre, date_naissance.
 *
 * Note : dans le controller, on utilise `any` à la place de ce DTO
 * (la validation se fait donc sans ce DTO actuellement).
 * Ce DTO documente l'intention et peut être réintroduit pour renforcer la validation.
 *
 * @IsEnum(['HOMME', 'FEMME']) → valeur strictement contrôlée (pas de valeur libre)
 * @IsISO8601() → valide le format date (YYYY-MM-DD ou YYYY-MM-DDTHH:mm:ssZ)
 *               le service convertit ensuite en DateTime ISO complet pour PostgreSQL
 */

import { IsEmail, IsEnum, IsISO8601 } from 'class-validator';

export class UpdateProfileDto {
  /** Email de l'utilisateur (identifiant, car pas encore de JWT à cette étape) */
  @IsEmail()
  email: string;

  /** Genre : uniquement 'HOMME' ou 'FEMME' (valeur fixe, pas de texte libre) */
  @IsEnum(['HOMME', 'FEMME'], { message: 'Le genre doit être HOMME ou FEMME' })
  genre: string;

  /** Date de naissance au format ISO 8601 (ex: '2000-05-15') */
  @IsISO8601({}, { message: 'Format de date invalide (YYYY-MM-DD)' })
  date_naissance: string;
}
