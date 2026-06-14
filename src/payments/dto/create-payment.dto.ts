/**
 * ============================================================
 * FICHIER : create-payment.dto.ts
 * RÔLE    : Valide les données de création manuelle d'un paiement.
 * ============================================================
 *
 * Utilisé par : POST /payments/create
 *
 * NOTES :
 *   - reservationId doit exister dans la table reservations_locaux.
 *   - amount est en TND (dinar tunisien) ; la conversion USD est faite dans StripeService.
 *   - returnUrl doit être une URL valide (@IsUrl) ; Stripe y redirige après paiement
 *     en ajoutant ?session_id=... (succès) ou ?cancelled=true (annulation).
 *
 * Pour un flow simplifié sans spécifier le montant, utiliser POST /payments/pay-reservation
 * qui récupère directement le prix_total de la réservation.
 */

import { IsNotEmpty, IsNumber, IsString, IsUrl } from 'class-validator';

export class CreatePaymentDto {
  /** UUID de la réservation à payer (doit exister dans reservations_locaux) */
  @IsNotEmpty()
  @IsString()
  reservationId: string;

  /** Montant en TND (dinar tunisien) — converti automatiquement en USD pour Stripe */
  @IsNotEmpty()
  @IsNumber()
  amount: number;

  /** URL de retour après paiement. Stripe y ajoute ?session_id=... ou ?cancelled=true */
  @IsNotEmpty()
  @IsUrl()
  returnUrl: string;
}
