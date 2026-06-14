/**
 * ============================================================
 * FICHIER : create-local.dto.ts
 * RÔLE    : Décrit et valide les données nécessaires pour créer un local.
 * ============================================================
 *
 * DTO = Data Transfer Object : un objet TypeScript qui définit la forme
 * exacte des données attendues dans le body d'une requête HTTP.
 *
 * Les décorateurs class-validator valident automatiquement chaque champ
 * grâce au ValidationPipe global configuré dans main.ts.
 * Si une règle est violée → NestJS retourne une erreur 400 Bad Request.
 *
 * CHAMPS OBLIGATOIRES : nom, type, id_centre
 * CHAMPS OPTIONNELS   : capacite, localisation, prix_heure, description, image_url
 *
 * DÉCORATEURS UTILISÉS :
 *   @IsString()   → le champ doit être une chaîne de caractères
 *   @IsNotEmpty() → le champ ne peut pas être vide ("")
 *   @IsNumber()   → le champ doit être un nombre (entier ou décimal)
 *   @IsOptional() → le champ peut être absent du body (undefined)
 *   @IsUUID()     → le champ doit être un UUID valide (format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
 */

import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsUUID,
} from 'class-validator';

export class CreateLocalDto {
  /** Nom du local, ex: "Salle de sport", "Théâtre principal" */
  @IsString()
  @IsNotEmpty()
  nom: string;

  /** Type de local, ex: 'THEATRE', 'SPORT', 'REUNION', 'POLYVALENT' */
  @IsString()
  @IsNotEmpty()
  type: string;

  /** Capacité maximale en nombre de personnes (optionnel) */
  @IsNumber()
  @IsOptional()
  capacite: number;

  /** Localisation physique dans le bâtiment, ex: "Bâtiment A, 1er étage" */
  @IsString()
  @IsOptional()
  localisation: string;

  /** Tarif à l'heure en dinars pour les réservations (optionnel, 0 si gratuit) */
  @IsNumber()
  @IsOptional()
  prix_heure: number;

  /** Description libre du local (équipements disponibles, règles d'usage...) */
  @IsString()
  @IsOptional()
  description: string;

  /** URL de la photo du local (stockée sur un service externe : Cloudinary, S3...) */
  @IsString()
  @IsOptional()
  image_url: string;

  /**
   * UUID du centre auquel appartient ce local (clé étrangère vers la table `centres`).
   * OBLIGATOIRE : un local ne peut pas exister sans centre parent.
   * Pour un RESPONSABLE_CENTRE, ce champ est ignoré — on utilise son propre centre.
   */
  @IsUUID()
  @IsNotEmpty()
  id_centre: string;
}
