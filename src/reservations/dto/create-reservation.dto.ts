/**
 * ============================================================
 * FICHIER : create-reservation.dto.ts
 * RÔLE    : Valide les données d'entrée pour créer ou modifier une réservation.
 * ============================================================
 *
 * Utilisé par :
 *   POST  /reservations             → créer une réservation
 *   POST  /reservations/create-with-payment → créer + initier un paiement
 *   PATCH /reservations/:id         → modifier une réservation existante
 *
 * VALIDATION DES FORMATS :
 *   date_reservation : YYYY-MM-DD    (ex: "2025-06-15")
 *   heure_debut      : HH:mm ou HH:mm:ss (ex: "09:00" ou "09:00:00")
 *   heure_fin        : HH:mm ou HH:mm:ss (ex: "11:30")
 *
 * Le service vérifie en plus que heure_fin > heure_debut (ensureTimeRange).
 * Le prix est calculé automatiquement : local.prix_heure × durée en heures.
 */

import { IsNotEmpty, IsString, IsUUID, Matches } from 'class-validator';

export class CreateReservationDto {
  /** UUID du local à réserver */
  @IsUUID()
  id_local: string;

  /** Date de la réservation au format YYYY-MM-DD */
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date_reservation doit respecter le format YYYY-MM-DD',
  })
  date_reservation: string;

  /** Heure de début au format HH:mm ou HH:mm:ss */
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, {
    message: 'heure_debut doit respecter le format HH:mm ou HH:mm:ss',
  })
  heure_debut: string;

  /** Heure de fin au format HH:mm ou HH:mm:ss (doit être > heure_debut) */
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, {
    message: 'heure_fin doit respecter le format HH:mm ou HH:mm:ss',
  })
  heure_fin: string;

  /** Motif / objet de la réservation (ex: "Entraînement football U15") */
  @IsString()
  @IsNotEmpty()
  objet: string;
}
