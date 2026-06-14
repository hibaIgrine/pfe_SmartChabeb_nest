/**
 * ============================================================
 * FICHIER : create-role.dto.ts
 * RÔLE    : Valide les données pour créer un nouveau rôle en base de données.
 * ============================================================
 *
 * Utilisé par : POST /roles
 *
 * COMPORTEMENT DANS LE SERVICE :
 *   - nom est transformé en MAJUSCULES et trimmé (nom.toUpperCase().trim()).
 *   - Si un rôle avec ce nom existe déjà → ConflictException (erreur Prisma P2002,
 *     contrainte unique sur la colonne `nom`).
 *
 * EXEMPLES DE VALEURS :
 *   nom         : 'ADMIN', 'COACH', 'ADHERENT', 'RESPONSABLE_CLUB', ...
 *   description : 'Administrateur système', 'Animateur de club sportif', ...
 *
 * NOTE : @ApiProperty() expose ce champ dans la documentation Swagger (GET /api).
 */

import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateRoleDto {
  /** Nom unique du rôle — converti automatiquement en MAJUSCULES dans le service */
  @ApiProperty({ example: 'COACH' })
  @IsString()
  @IsNotEmpty()
  nom: string;

  /** Description optionnelle du rôle */
  @ApiProperty({ example: 'Animateur de club sportif', required: false })
  @IsString()
  @IsOptional()
  description?: string;
}
