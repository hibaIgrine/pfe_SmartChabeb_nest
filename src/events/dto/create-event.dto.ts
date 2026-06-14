/**
 * ============================================================
 * FICHIER : create-event.dto.ts
 * RÔLE    : Valide les données d'entrée pour créer un événement.
 * ============================================================
 *
 * Utilisé par : POST /events
 *
 * FORMATS ATTENDUS :
 *   date_event  : YYYY-MM-DD              (ex: "2025-09-15")
 *   start_time  : HH:mm ou HH:mm:ss      (ex: "09:00" ou "09:00:00")
 *   end_time    : HH:mm ou HH:mm:ss      (doit être > start_time, vérifié dans le service)
 *
 * CLUBS ASSOCIÉS :
 *   club_id   : UUID du club principal (optionnel)
 *   club_ids  : tableau d'UUIDs des clubs collaborateurs (optionnel)
 *   Règle : si RESPONSABLE_CLUB, au moins un club doit être associé.
 *   Le premier club de la liste combinée devient le club principal.
 *   Les valeurs vides ("" ou null) sont filtrées automatiquement (@Transform).
 *
 * TIMELINE (optionnelle) :
 *   Programme détaillé du déroulement de l'événement.
 *   Chaque étape est validée par EventTimelineStepDto.
 *   Conditions : étapes dans les bornes horaires de l'événement, sans chevauchement.
 *   Triées automatiquement par heure de début dans le service.
 *
 * CAPACITÉ :
 *   Nombre maximum de participants CONFIRMÉS.
 *   Si capacity est définie, updateParticipantStatus → CONFIRME vérifie qu'elle n'est pas atteinte.
 *   La liste d'attente est gérée automatiquement (promoteWaitlistIfPossible).
 */

import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { EventTimelineStepDto } from './event-timeline-step.dto';

export class CreateEventDto {
  /** Nom de l'événement (ex: "Tournoi de football U15") */
  @IsString()
  @IsNotEmpty()
  nom!: string;

  /** Description optionnelle de l'événement */
  @IsString()
  @IsOptional()
  description?: string;

  /** Date de l'événement au format YYYY-MM-DD */
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date_event doit respecter le format YYYY-MM-DD',
  })
  date_event!: string;

  /** Heure de début au format HH:mm ou HH:mm:ss */
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, {
    message: 'start_time doit respecter le format HH:mm ou HH:mm:ss',
  })
  start_time!: string;

  /** Heure de fin (doit être strictement > start_time, vérifié dans le service) */
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, {
    message: 'end_time doit respecter le format HH:mm ou HH:mm:ss',
  })
  end_time!: string;

  /**
   * UUID du club principal organisant l'événement (optionnel).
   * Les valeurs "" ou null sont converties en undefined (@Transform).
   */
  @IsOptional()
  @Transform(({ value }) =>
    value === '' || value === null ? undefined : value,
  )
  @IsUUID()
  club_id?: string;

  /**
   * UUIDs des clubs collaborateurs (optionnel).
   * Les valeurs vides ("" ou null) sont filtrées du tableau (@Transform).
   */
  @IsOptional()
  @IsArray()
  @Transform(({ value }) =>
    Array.isArray(value)
      ? value.filter((item) => item !== '' && item !== null)
      : value,
  )
  @IsUUID('all', { each: true })
  club_ids?: string[];

  /** UUID du local où se déroule l'événement */
  @IsUUID()
  locaux_id!: string;

  /** Capacité maximale de participants CONFIRMÉS (optionnel, min 1) */
  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  /**
   * Programme détaillé de l'événement (optionnel).
   * Tableau d'étapes validées par EventTimelineStepDto.
   * Le service vérifie la cohérence des horaires et l'absence de chevauchement.
   */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EventTimelineStepDto)
  timeline?: EventTimelineStepDto[];
}
