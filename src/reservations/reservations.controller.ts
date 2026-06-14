/**
 * ============================================================
 * FICHIER : reservations.controller.ts
 * RÔLE    : Routes HTTP pour la gestion des réservations de locaux.
 * ============================================================
 *
 * BASE URL : /reservations
 * Tout le controller est sous AuthGuard('jwt') → JWT obligatoire.
 *
 * ROUTES EXPOSÉES :
 *   ── CRÉATION ───────────────────────────────────────────────────────────────
 *   POST /reservations
 *     → Créer une réservation simple (sans paiement immédiat).
 *     → Statut initial : EN_ATTENTE (attend validation admin/responsable).
 *
 *   POST /reservations/create-with-payment
 *     → Créer une réservation + initier une session de paiement en ligne.
 *     → Body en plus : { returnUrl: string } pour la redirection après paiement.
 *     → Retourne : { reservation, checkoutUrl, paymentId }
 *     → checkoutUrl est l'URL de la page de paiement (Konnect / autre gateway).
 *
 *   ── LECTURE ────────────────────────────────────────────────────────────────
 *   GET /reservations
 *     → Mes réservations (filtrées selon le rôle) :
 *         ADMIN              → toutes les réservations
 *         RESPONSABLE_CENTRE → réservations de son centre (hors clubs récurrents)
 *         Autres             → uniquement ses propres réservations
 *
 *   GET /reservations/occupied?id_local=<uuid>&date=YYYY-MM-DD
 *     → Créneaux déjà pris (VALIDEE) pour un local à une date donnée.
 *     → Utilisé dans Flutter pour colorier le calendrier des heures prises.
 *
 *   GET /reservations/planning/:localId
 *     → Planning complet d'un local (toutes réservations VALIDEE).
 *     → Inclut l'utilisateur + le local + le centre.
 *     → Trié par date ASC puis heure_debut ASC.
 *
 *   GET /reservations/stats/overview
 *     → Statistiques de réservation (adaptées au rôle) :
 *         - Nombre total de réservations
 *         - Local le plus utilisé
 *         - Taux d'occupation du mois en cours (%)
 *         - Revenus totaux (réservations VALIDEE)
 *
 *   GET /reservations/check?id_local=<uuid>&date=YYYY-MM-DD&start=HH:mm&end=HH:mm
 *     → Vérifier si un créneau est libre avant d'afficher le formulaire.
 *     → Retourne : { available: boolean }
 *
 *   ── MODIFICATION / ANNULATION ──────────────────────────────────────────────
 *   PATCH /reservations/:id/status
 *     → Changer le statut d'une réservation (VALIDEE, REFUSEE, ANNULEE).
 *     → VALIDEE/REFUSEE : réservé à ADMIN et RESPONSABLE_CENTRE.
 *     → ANNULEE        : l'auteur ou l'admin peut annuler.
 *     → Re-vérifie la disponibilité avant de valider (conflit possible entre 2 validations).
 *
 *   PATCH /reservations/:id
 *     → Modifier une réservation existante (dates, heures, objet).
 *     → Recalcule le prix automatiquement.
 *     → Repasse en EN_ATTENTE après modification (re-validation nécessaire).
 *
 *   PATCH /reservations/:id/cancel
 *     → Annuler une réservation (action rapide, sans body).
 *     → Équivalent à updateStatus avec statut = ANNULEE.
 *
 * NOTE sur PaymentsService :
 *   Ce controller injecte directement PaymentsService (en plus de ReservationsService)
 *   pour la route create-with-payment, qui orchestre les 2 services séquentiellement.
 */

import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common';
import { ReservationsService } from './reservations.service';
import { AuthGuard } from '@nestjs/passport';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { PaymentsService } from 'src/payments/payments.service';

@Controller('reservations')
@UseGuards(AuthGuard('jwt'))
export class ReservationsController {
  constructor(
    private readonly resService: ReservationsService,
    private readonly paymentsService: PaymentsService,
  ) {}

  /**
   * POST /reservations
   * Créer une réservation simple.
   * Le prix est calculé automatiquement depuis local.prix_heure × durée.
   * La réservation démarre en statut EN_ATTENTE.
   *
   * Droits spéciaux :
   *   - RESPONSABLE_CLUB → peut réserver, mais seulement les locaux
   *     du centre de ses clubs (vérifié par assertResponsableCanReserveLocal).
   */
  @Post()
  create(@Request() req, @Body() dto: CreateReservationDto) {
    return this.resService.create(req.user.userId, dto);
  }

  /**
   * POST /reservations/create-with-payment
   * Créer une réservation ET initier une session de paiement en ligne.
   *
   * Flux :
   *   1. Créer la réservation (resService.create) → même validations que POST /
   *   2. Calculer le montant total (prix_total de la réservation créée)
   *   3. Créer une session de paiement (paymentsService.createPaymentAndSession)
   *      → Retourne checkoutUrl (URL page paiement) + paymentId
   *
   * Body supplémentaire : { returnUrl: string } → URL de retour après paiement.
   * Retourne : { reservation, checkoutUrl, paymentId }
   */
  @Post('create-with-payment')
  async createWithPayment(
    @Request() req,
    @Body() dto: CreateReservationDto & { returnUrl: string },
  ) {
    const reservation = await this.resService.create(req.user.userId, dto);
    const amount = Number(reservation.prix_total) || 0;
    const result = await this.paymentsService.createPaymentAndSession(
      reservation.id,
      amount,
      dto.returnUrl,
    );
    const checkoutUrl = result.checkoutUrl ?? null;
    const paymentId   = result.payment?.id ?? null;
    return { reservation, checkoutUrl, paymentId };
  }

  /**
   * GET /reservations
   * Liste les réservations selon le rôle :
   *   ADMIN              → toutes (sans filtre)
   *   RESPONSABLE_CENTRE → locaux de son centre, hors créneaux club récurrents
   *   Autres rôles       → uniquement ses propres réservations
   *
   * Inclut pour chaque réservation : utilisateur, local (avec centre), paiements.
   * Triées par date de création DESC.
   */
  @Get()
  findAll(@Request() req) {
    return this.resService.findAll(req.user.userId, req.user.role);
  }

  /**
   * GET /reservations/occupied?id_local=<uuid>&date=YYYY-MM-DD
   * Retourne les créneaux VALIDÉS d'un local à une date donnée.
   * Chaque slot contient : heure_debut, heure_fin, objet.
   * Utilisé par Flutter pour afficher les plages horaires déjà prises.
   */
  @Get('occupied')
  async getOccupied(
    @Query('id_local') localId: string,
    @Query('date') date: string,
  ) {
    return await this.resService.getOccupiedSlots(localId, date);
  }

  /**
   * GET /reservations/planning/:localId
   * Planning complet d'un local — toutes les réservations VALIDÉES.
   * Trié par date ASC puis heure_debut ASC (ordre chronologique).
   * Inclut l'utilisateur (nom, prénom, email) et le local (avec son centre).
   */
  @Get('planning/:localId')
  async getPlanning(@Param('localId') localId: string) {
    return await this.resService.getLocalPlanning(localId);
  }

  /**
   * GET /reservations/stats/overview
   * Statistiques adaptées au rôle de l'utilisateur connecté :
   *   reservationCount → nombre total (hors ANNULEE)
   *   mostUsedRoom     → local avec le plus de réservations VALIDEE
   *   occupancyRate    → taux d'occupation du mois en cours (en %)
   *   revenueTotal     → somme des prix_total des réservations VALIDEE
   *   monthContext     → contexte du calcul (mois, année, nombre de locaux)
   */
  @Get('stats/overview')
  async getStatsOverview(@Request() req) {
    return await this.resService.getReservationStatsOverview(
      req.user.userId,
      req.user.role,
    );
  }

  /**
   * GET /reservations/check?id_local=<uuid>&date=YYYY-MM-DD&start=HH:mm&end=HH:mm
   * Vérifier si un créneau est libre pour un local donné.
   * Utilise l'algorithme anti-conflit (3 cas de chevauchement).
   * Retourne : { available: true | false }
   * Utilisé dans Flutter avant d'afficher le formulaire de réservation.
   */
  @Get('check')
  async check(@Query() q: any) {
    const isFree = await this.resService.checkAvailability(
      q.id_local, q.date, q.start, q.end,
      undefined,
      q.excludeObjet || undefined,
    );
    return { available: isFree };
  }

  /**
   * PATCH /reservations/:id/status
   * Changer le statut d'une réservation.
   * Body : { statut: 'EN_ATTENTE' | 'VALIDEE' | 'REFUSEE' | 'ANNULEE' }
   *
   * Droits :
   *   VALIDEE / REFUSEE → ADMIN ou RESPONSABLE_CENTRE uniquement
   *   ANNULEE           → l'auteur de la réservation ou l'admin
   *
   * Avant de VALIDER : re-vérifie la disponibilité (un autre créneau a pu être validé entre-temps).
   * Après VALIDEE / REFUSEE → notification push à l'auteur de la réservation.
   */
  @Patch(':id/status')
  updateStatus(
    @Request() req,
    @Param('id') id: string,
    @Body('statut') statut: string,
  ) {
    return this.resService.updateStatus(id, statut, req.user.userId, req.user.role);
  }

  /**
   * PATCH /reservations/:id
   * Modifier une réservation existante (changer date, heures, local ou objet).
   * Seul l'auteur ou un ADMIN peut modifier.
   * La réservation repasse en EN_ATTENTE après modification (re-validation requise).
   * Le prix est recalculé automatiquement depuis la nouvelle durée.
   */
  @Patch(':id')
  update(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: CreateReservationDto,
  ) {
    return this.resService.update(req.user.userId, id, dto);
  }

  /**
   * PATCH /reservations/:id/cancel
   * Annuler rapidement une réservation (sans body).
   * Équivalent à PATCH /status avec { statut: 'ANNULEE' }.
   * Seul l'auteur ou l'admin peut annuler.
   */
  @Patch(':id/cancel')
  cancel(@Request() req, @Param('id') id: string) {
    return this.resService.cancel(req.user.userId, id);
  }
}
