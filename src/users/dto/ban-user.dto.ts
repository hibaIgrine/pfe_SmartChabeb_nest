/**
 * ============================================================
 * FICHIER : ban-user.dto.ts
 * RÔLE    : Valide les données pour bannir un utilisateur (PATCH /users/:id/ban).
 * ============================================================
 *
 * Un ban dans SmartChabeb est TEMPORAIRE : on fournit une durée en jours
 * et le service calcule automatiquement la date_fin_ban.
 *
 * @Min(1) → le ban doit durer au moins 1 jour (0 jour n'a pas de sens)
 * La date de fin est calculée côté service : new Date() + days jours.
 * L'auto-unban est géré dans JwtStrategy quand le ban expire.
 */

import { IsString, IsNumber, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BanUserDto {
  /** Durée du ban en jours (minimum 1) */
  @ApiProperty({ example: 7, description: 'Nombre de jours de suspension' })
  @IsNumber()
  @Min(1, { message: "La durée doit être d'au moins 1 jour" })
  days: number;

  /** Raison du ban — stockée dans motif_ban, affichée à l'utilisateur lors de sa tentative de connexion */
  @ApiProperty({
    example: 'Non-respect du règlement intérieur',
    description: 'Motif de la suspension',
  })
  @IsString()
  reason: string;
}
