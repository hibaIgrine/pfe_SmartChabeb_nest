/**
 * ============================================================
 * FICHIER : create-event-request-creation.dto.ts
 * RÔLE    : Valide les données d'une demande de création d'événement.
 * ============================================================
 *
 * Utilisé par : POST /event-request-creations
 *
 * STRUCTURE IDENTIQUE à CreateEventDto du module events, avec quelques différences :
 *   - capacity : borne supérieure à 1 000 000 (@Max)
 *   - timeline : réutilise EventTimelineStepDto du module events
 *   - Pas de champ recurrenceType (la récurrence n'est pas supportée dans les demandes)
 *
 * FORMATS ATTENDUS :
 *   date_event  : YYYY-MM-DD
 *   start_time  : HH:mm ou HH:mm:ss (normalisé en service via normalizeTime)
 *   end_time    : HH:mm ou HH:mm:ss (doit être > start_time, vérifié dans le service)
 *
 * CLUBS ASSOCIÉS :
 *   club_id   : UUID du club principal (optionnel, "" ou null → undefined via @Transform)
 *   club_ids  : UUIDs des clubs collaborateurs (optionnel, valeurs vides filtrées)
 *   Si RESPONSABLE_CLUB : doit être coach OU staff actif de chaque club associé.
 *
 * TIMELINE :
 *   Réutilise EventTimelineStepDto (validé dans le service via normalizeTimeline d'EventsService).
 *   Stockée en JSON dans la table event_request_creations.
 *   Transférée telle quelle lors de l'approbation.
 */

import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { EventTimelineStepDto } from '../../events/dto/event-timeline-step.dto';

export class CreateEventRequestCreationDto {
  /** Nom de l'événement demandé */
  @IsString()
  @IsNotEmpty()
  nom!: string;

  /** Description optionnelle */
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

  /** Heure de fin (doit être > start_time, vérifié dans le service) */
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, {
    message: 'end_time doit respecter le format HH:mm ou HH:mm:ss',
  })
  end_time!: string;

  /** UUID du club principal (optionnel, "" ou null → undefined via @Transform) */
  @IsOptional()
  @Transform(({ value }) =>
    value === '' || value === null ? undefined : value,
  )
  @IsUUID()
  club_id?: string;

  /** UUIDs des clubs collaborateurs (optionnel, valeurs vides filtrées) */
  @IsOptional()
  @IsArray()
  @Transform(({ value }) =>
    Array.isArray(value)
      ? value.filter((item) => item !== '' && item !== null)
      : value,
  )
  @IsUUID('all', { each: true })
  club_ids?: string[];

  /** UUID du local où se déroulera l'événement */
  @IsUUID()
  locaux_id!: string;

  /** Capacité maximale de participants (optionnel, entier entre 1 et 1 000 000) */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000000)
  capacity?: number;

  /**
   * Programme détaillé de l'événement (optionnel).
   * Réutilise EventTimelineStepDto du module events.
   * Stocké en JSON dans event_request_creations et transféré lors de l'approbation.
   */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EventTimelineStepDto)
  timeline?: EventTimelineStepDto[];
}
