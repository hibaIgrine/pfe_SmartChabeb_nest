/**
 * ============================================================
 * FICHIER : change-role.dto.ts
 * RÔLE    : Valide les données pour changer le rôle d'un utilisateur.
 * ============================================================
 *
 * Pourquoi pas @IsEnum() ?
 *   On évite @IsEnum() intentionnellement : si un nouveau rôle est ajouté
 *   en BDD (table `roles`), il serait bloqué par l'enum avant d'atteindre le service.
 *   La validation fine (rôles autorisés selon le demandeur) est faite dans
 *   UsersService.changeRole() avec une logique RBAC plus flexible.
 *
 * Le service normalise le rôle (toUpperCase + replace espaces par _)
 * avant de le stocker en BDD.
 */

import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangeRoleDto {
  /**
   * Rôle cible — exemples : 'ADMIN', 'COACH', 'ADHERENT', 'RESPONSABLE_CENTRE', 'RESPONSABLE_CLUB'
   * Pas de @IsEnum → validation souple pour supporter les futurs rôles sans modifier ce DTO
   */
  @ApiProperty({ example: 'COACH' })
  @IsString()
  @IsNotEmpty()
  role: string;
}
