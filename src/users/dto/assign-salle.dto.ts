/**
 * ============================================================
 * FICHIER : assign-salle.dto.ts
 * RÔLE    : Valide les données pour assigner un utilisateur à un centre par email.
 * ============================================================
 *
 * Note de nommage : ce fichier s'appelait "assign-salle" (salle = ancienne terminologie)
 * mais il est maintenant utilisé pour assigner un CENTRE (Dar Chabab), pas une salle.
 * Le champ id_salle devrait être renommé id_centre mais reste id_salle pour
 * ne pas casser les appels Flutter existants.
 *
 * Utilisé lors de l'onboarding : l'utilisateur choisit son centre
 * et on lie son compte à ce centre via son email (avant d'avoir un JWT).
 *
 * @IsEmail() → valide le format email
 * @IsUUID()  → valide que l'identifiant du centre est bien un UUID PostgreSQL
 */

import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsUUID } from 'class-validator';

export class AssignSalleByEmailDto {
  /** Email de l'utilisateur à modifier (identifiant avant JWT) */
  @ApiProperty({
    example: 'hiba@test.com',
    description: "L'email de l'utilisateur à modifier",
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  /**
   * UUID du centre choisi (nommé id_salle pour compatibilité avec le frontend Flutter existant).
   * Correspond à l'id de la table `centres` en BDD.
   */
  @ApiProperty({
    example: 'a1b2c3d4-e5f6-g7h8-i9j0-k1l2m3n4o5p6',
    description: "L'UUID du centre choisi",
  })
  @IsUUID()
  @IsNotEmpty()
  id_salle: string;
}
