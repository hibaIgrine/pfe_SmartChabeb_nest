/**
 * ============================================================
 * FICHIER : change-status.dto.ts
 * RÔLE    : Valide les données pour activer/désactiver un compte.
 * ============================================================
 *
 * Un seul champ : compte_actif (boolean).
 *   true  → réactiver le compte (l'utilisateur peut se reconnecter)
 *   false → désactiver le compte (sans date de fin ni motif, contrairement au ban)
 *
 * Différence avec le ban :
 *   - Ban   : compte_actif = false + date_fin_ban + motif_ban (temporaire, message affiché)
 *   - Status: compte_actif = false sans date (désactivation manuelle, permanente sauf réactivation)
 */

import { IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangeStatusDto {
  /** true = compte actif, false = compte désactivé */
  @ApiProperty({ example: true, description: 'Statut du compte (actif ou non)' })
  @IsBoolean()
  compte_actif: boolean;
}
