/**
 * ============================================================
 * FICHIER : update-event.dto.ts
 * RÔLE    : Valide les données d'entrée pour modifier un événement existant.
 * ============================================================
 *
 * Utilisé par : PATCH /events/:id
 *
 * Tous les champs sont optionnels (@IsOptional).
 * Le service applique une stratégie "valeur actuelle si absent" :
 *   dto.nom ?? existing.nom  →  si non fourni, la valeur actuelle est conservée.
 *
 * VÉRIFICATIONS DANS LE SERVICE (update()) :
 *   1. assertCanManageEvent → RBAC (ADMIN / RESP_CENTRE sur son centre / RESP_CLUB sur son club)
 *   2. Après changement de local ou club : ré-assertion RBAC avec les nouvelles valeurs
 *   3. findConflicts(excludeEventId) → auto-exclusion de l'événement modifié
 *   4. Détection des champs modifiés → notification push aux participants CONFIRME/EN_ATTENTE
 *
 * CLUBS :
 *   Même logique que CreateEventDto :
 *   club_id = club principal, club_ids = clubs collaborateurs.
 *   Si les deux sont absents → conservation des clubs existants.
 */

import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { EventTimelineStepDto } from './event-timeline-step.dto';

export class UpdateEventDto {
  /** Nouveau nom de l'événement (optionnel) */
  @IsOptional()
  @IsString()
  nom?: string;

  /** Nouvelle description (optionnel) */
  @IsOptional()
  @IsString()
  description?: string;

  /** Nouvelle date de l'événement au format YYYY-MM-DD (optionnel) */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date_event doit respecter le format YYYY-MM-DD',
  })
  date_event?: string;

  /** Nouvel heure de début au format HH:mm ou HH:mm:ss (optionnel) */
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, {
    message: 'start_time doit respecter le format HH:mm ou HH:mm:ss',
  })
  start_time?: string;

  /** Nouvelle heure de fin (optionnel, doit être > start_time) */
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, {
    message: 'end_time doit respecter le format HH:mm ou HH:mm:ss',
  })
  end_time?: string;

  /** UUID du nouveau club principal (optionnel, "" ou null → undefined) */
  @IsOptional()
  @Transform(({ value }) =>
    value === '' || value === null ? undefined : value,
  )
  @IsUUID()
  club_id?: string;

  /** UUIDs des clubs collaborateurs mis à jour (optionnel) */
  @IsOptional()
  @IsArray()
  @Transform(({ value }) =>
    Array.isArray(value)
      ? value.filter((item) => item !== '' && item !== null)
      : value,
  )
  @IsUUID('all', { each: true })
  club_ids?: string[];

  /** UUID du nouveau local (optionnel) */
  @IsOptional()
  @IsUUID()
  locaux_id?: string;

  /** Nouvelle capacité maximale de participants CONFIRMÉS (optionnel, min 1) */
  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  /** Nouveau programme détaillé de l'événement (optionnel) */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EventTimelineStepDto)
  timeline?: EventTimelineStepDto[];
}
