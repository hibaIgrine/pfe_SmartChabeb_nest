/**
 * ============================================================
 * FICHIER : events.controller.ts
 * RÔLE    : Routes HTTP pour la gestion des événements.
 * ============================================================
 *
 * BASE URL : /events
 * Tout le controller est protégé par AuthGuard('jwt') → JWT obligatoire.
 * Certaines routes ont un RolesGuard supplémentaire (@Roles).
 *
 * ROUTES EXPOSÉES :
 *
 * ── CRÉATION ET LECTURE ─────────────────────────────────────────────────────
 *
 *   POST /events                                [ADMIN, RESP_CENTRE, RESP_CLUB]
 *     → Créer un événement dans un local à une date et heure données.
 *     → RESPONSABLE_CLUB → is_active = false (demande, attend validation centre)
 *     → ADMIN / RESPONSABLE_CENTRE → is_active = true (actif immédiatement)
 *     → Vérifie conflits events + réservations sur le local choisi.
 *     → Crée automatiquement une réservation VALIDEE pour bloquer le créneau.
 *     → Supporte un club principal (club_id) + clubs collaborateurs (club_ids).
 *     → Timeline optionnelle : programme détaillé avec étapes horaires.
 *
 *   GET /events?includeInactive=true
 *     → Liste les événements selon la visibilité du rôle :
 *         ADMIN           → tous les événements (actifs + inactifs si flag)
 *         RESP_CENTRE     → événements de son centre uniquement
 *         RESP_CLUB       → événements de ses clubs (primaire + collaborateurs)
 *         Autres          → événements actifs uniquement
 *
 *   GET /events/me/participations?includeInactive=true
 *     → Mes événements : inscrit (non ANNULE) OU membre ACCEPTE du club lié.
 *     → Chaque résultat inclut my_participation_status + my_participation_checkin.
 *
 *   GET /events/availability/check?id_local=&date=&start=&end=&excludeEventId=
 *     → Vérifier si un créneau est libre (avant affichage du formulaire).
 *     → Double vérification : conflits events + conflits réservations locaux.
 *     → excludeEventId : auto-exclusion lors d'une modification d'événement.
 *     → Retourne : { available: boolean, conflicts: [...], durationMinutes: number }
 *
 *   GET /events/stats/dashboard?includeInactive=&centreId=&gouvernorat=
 *     → Tableau de bord analytique filtrable par centre ou gouvernorat.
 *     → Retourne : nombreEvenements, nombreParticipants, tauxParticipation,
 *       tauxRemplissage, evenementsPopulaires (top 5), participationParClub (top 8),
 *       participationParUtilisateur (top 10), frequenceEvenements (par mois).
 *
 *   GET /events/:id
 *     → Détail complet d'un événement avec participants, créateur, feedback.
 *     → RESP_CENTRE : accès limité à son centre.
 *     → RESP_CLUB : accès limité à ses clubs (ou membre du club ou participant).
 *     → Autres : seulement si is_active (sauf participant non annulé).
 *
 * ── FEEDBACK ────────────────────────────────────────────────────────────────
 *
 *   GET /events/:id/feedback
 *     → Résumé des feedbacks : ratingAverage, ratingCount, 10 derniers feedbacks,
 *       myFeedback (son propre), canRate (éligible à noter ou non).
 *     → canRate = true si CONFIRME/ANNULE ET événement déjà commencé.
 *
 *   POST /events/:id/feedback
 *     → Soumettre ou modifier son feedback (upsert).
 *     → Body : { note: 1-5, commentaire?: string (max 500c) }
 *     → Conditions : avoir participé ET événement déjà commencé.
 *     → Retourne : feedback + nouvelle moyenne + nouveau count.
 *
 * ── INSCRIPTION / CHECK-IN PARTICIPANTS ─────────────────────────────────────
 *
 *   POST /events/:id/participants/register
 *     → S'inscrire à un événement (statut initial : EN_ATTENTE).
 *     → Si déjà CONFIRME ou EN_ATTENTE → erreur (doublon).
 *     → Si ANNULE ou REFUSE précédemment → réinscription possible (update).
 *
 *   PATCH /events/:id/participants/me/cancel
 *     → Annuler sa propre inscription (status → ANNULE, checkin → false).
 *     → Déclenche promoteWaitlistIfPossible : promeut les EN_ATTENTE
 *       si la capacité le permet.
 *
 *   PATCH /events/:id/participants/me/checkin
 *     → Auto check-in : se marquer présent pendant le déroulement de l'événement.
 *     → Conditions : statut CONFIRME + événement en cours + pas encore checkin.
 *     → Premier check-in → +10 points (SQL atomique, idempotent via points_awarded).
 *     → Notification push "points gagnés" envoyée après attribution.
 *
 *   GET /events/:id/participants
 *     → Liste des participants groupés par statut :
 *       { confirmed, waitingList, refused, cancelled, all }
 *     → RESP_CENTRE : son centre. RESP_CLUB : ses clubs.
 *
 *   PATCH /events/:id/participants/:participantId/status  [ADMIN, RESP_CENTRE, RESP_CLUB]
 *     → Changer le statut d'un participant (EN_ATTENTE / CONFIRME / REFUSE / ANNULE).
 *     → CONFIRME : vérifie que la capacité n'est pas dépassée (excludeId pattern).
 *     → REFUSE / ANNULE → déclenche promoteWaitlistIfPossible.
 *     → CONFIRME / REFUSE → notification push au participant.
 *
 *   PATCH /events/:id/participants/:participantId/checkin [ADMIN, RESP_CENTRE, RESP_CLUB]
 *     → Marquer présent (true) ou absent (false) un participant.
 *     → Check-in uniquement pendant l'événement (start_time ≤ now ≤ end_time).
 *     → Premier check-in → +10 points (SQL atomique) → notification push.
 *
 * ── GESTION DE L'ÉVÉNEMENT ──────────────────────────────────────────────────
 *
 *   PATCH /events/:id                           [ADMIN, RESP_CENTRE, RESP_CLUB]
 *     → Modifier l'événement (nom, description, dates, heures, local, clubs, capacité).
 *     → Vérifie conflits après modification (excludeEventId).
 *     → Détecte les changements et notifie les participants CONFIRME/EN_ATTENTE.
 *     → Supprime les anciennes notifications EVENT_UPDATED avant d'en créer de nouvelles.
 *
 *   PATCH /events/:id/activate                  [ADMIN, RESP_CENTRE, RESP_CLUB]
 *     → Activer un événement (is_active = true).
 *     → Valide la demande soumise par un RESPONSABLE_CLUB.
 *
 *   PATCH /events/:id/refuse-request            [ADMIN, RESP_CENTRE, RESP_CLUB]
 *     → Refuser la demande d'événement d'un RESPONSABLE_CLUB (is_active = false).
 *
 *   PATCH /events/:id/deactivate                [ADMIN, RESP_CENTRE, RESP_CLUB]
 *     → Désactiver un événement sans l'annuler (is_active = false, sans notifications).
 *
 *   PATCH /events/:id/cancel                    [ADMIN, RESP_CENTRE, RESP_CLUB]
 *     → Annuler un événement actif (is_active = false).
 *     → Supprime les notifications EVENT_UPDATED / EVENT_REMINDER liées.
 *     → Envoie une notification d'annulation à tous les participants CONFIRME/EN_ATTENTE.
 */

import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from 'src/auth/roles.decorator';
import { RolesGuard } from 'src/auth/roles.guard';
import { CreateEventDto } from './dto/create-event.dto';
import { CreateEventFeedbackDto } from './dto/create-event-feedback.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { EventsService } from './events.service';

@Controller('events')
@UseGuards(AuthGuard('jwt'))
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  /**
   * POST /events
   * Créer un événement. RESPONSABLE_CLUB → demande (is_active=false).
   * ADMIN / RESPONSABLE_CENTRE → actif immédiatement.
   * Crée automatiquement une réservation VALIDEE pour bloquer le local.
   */
  @Post()
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'RESPONSABLE_CENTRE', 'RESPONSABLE_CLUB')
  create(@Request() req: any, @Body() dto: CreateEventDto) {
    return this.eventsService.create(req.user.userId, dto);
  }

  /**
   * GET /events?includeInactive=true
   * Liste les événements visibles selon le rôle de l'utilisateur connecté.
   * ADMIN → tout. RESP_CENTRE → son centre. RESP_CLUB → ses clubs. Autres → actifs.
   */
  @Get()
  findAll(
    @Request() req: any,
    @Query('includeInactive') includeInactive?: string,
  ) {
    const include = String(includeInactive).toLowerCase() === 'true';
    return this.eventsService.findAll(req.user.userId, include);
  }

  /**
   * GET /events/me/participations
   * Mes événements : inscrit (non ANNULE) OU membre ACCEPTE du club lié.
   * Inclut my_participation_status + my_participation_checkin dans chaque résultat.
   */
  @Get('me/participations')
  findMyParticipations(
    @Request() req: any,
    @Query('includeInactive') includeInactive?: string,
  ) {
    const include = String(includeInactive).toLowerCase() === 'true';
    return this.eventsService.findMyParticipations(req.user.userId, include);
  }

  /**
   * GET /events/availability/check?id_local=&date=&start=&end=&excludeEventId=
   * Vérifier si un créneau est libre dans un local.
   * Vérifie conflits events ET conflits réservations locaux.
   * excludeEventId : auto-exclusion lors d'une modification.
   */
  @Get('availability/check')
  checkAvailability(
    @Query('id_local') localId: string,
    @Query('date') date: string,
    @Query('start') start: string,
    @Query('end') end: string,
    @Query('excludeEventId') excludeEventId?: string,
  ) {
    return this.eventsService.checkLocalAvailability(
      localId,
      date,
      start,
      end,
      excludeEventId,
    );
  }

  /**
   * GET /events/stats/dashboard?includeInactive=&centreId=&gouvernorat=
   * Tableau de bord analytique filtrable par centre ou gouvernorat.
   * Retourne : popularité, taux de remplissage, top clubs, top utilisateurs, fréquence mensuelle.
   */
  @Get('stats/dashboard')
  getDashboardStats(
    @Request() req: any,
    @Query('includeInactive') includeInactive?: string,
    @Query('centreId') centreId?: string,
    @Query('gouvernorat') gouvernorat?: string,
  ) {
    const include = String(includeInactive).toLowerCase() === 'true';
    return this.eventsService.getDashboardStats(
      req.user.userId,
      include,
      centreId || undefined,
      gouvernorat || undefined,
    );
  }

  /**
   * GET /events/:id
   * Détail complet : participants, créateur, feedback summary.
   * Accès restreint selon le rôle (centre, clubs, statut actif).
   */
  @Get(':id')
  findOne(@Request() req: any, @Param('id') id: string) {
    return this.eventsService.findOne(req.user.userId, id);
  }

  /**
   * GET /events/:id/feedback
   * Résumé des feedbacks : note moyenne, count, 10 derniers, myFeedback, canRate.
   * canRate = vrai si participé (CONFIRME/ANNULE) ET événement commencé.
   */
  @Get(':id/feedback')
  getEventFeedback(@Request() req: any, @Param('id') id: string) {
    return this.eventsService.getEventFeedback(id, req.user.userId);
  }

  /**
   * POST /events/:id/feedback
   * Soumettre ou modifier son feedback (upsert).
   * Body : { note: 1-5, commentaire?: string (max 500 caractères) }
   * Conditions : avoir participé + événement déjà commencé.
   */
  @Post(':id/feedback')
  submitEventFeedback(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: CreateEventFeedbackDto,
  ) {
    return this.eventsService.submitEventFeedback(id, req.user.userId, dto);
  }

  /**
   * POST /events/:id/participants/register
   * S'inscrire à un événement (statut EN_ATTENTE).
   * Si ANNULE/REFUSE précédemment → réinscription autorisée.
   * Si déjà CONFIRME/EN_ATTENTE → erreur doublon.
   */
  @Post(':id/participants/register')
  registerToEvent(@Request() req: any, @Param('id') id: string) {
    return this.eventsService.registerToEvent(id, req.user.userId);
  }

  /**
   * PATCH /events/:id/participants/me/cancel
   * Annuler sa propre inscription (status → ANNULE).
   * Déclenche automatiquement la promotion de la liste d'attente.
   */
  @Patch(':id/participants/me/cancel')
  cancelMyRegistration(@Request() req: any, @Param('id') id: string) {
    return this.eventsService.cancelMyRegistration(id, req.user.userId);
  }

  /**
   * PATCH /events/:id/participants/me/checkin
   * Auto check-in pendant l'événement (start ≤ now ≤ end).
   * Conditions : CONFIRME + événement en cours + pas encore checkin.
   * Premier check-in → +10 points (SQL atomique idempotent) + notification push.
   */
  @Patch(':id/participants/me/checkin')
  selfCheckin(@Request() req: any, @Param('id') id: string) {
    return this.eventsService.selfCheckin(id, req.user.userId);
  }

  /**
   * GET /events/:id/participants
   * Liste des participants groupés : confirmed, waitingList, refused, cancelled, all.
   * RESP_CENTRE : son centre uniquement. RESP_CLUB : ses clubs uniquement.
   */
  @Get(':id/participants')
  listParticipants(@Request() req: any, @Param('id') id: string) {
    return this.eventsService.listParticipants(id, req.user.userId);
  }

  /**
   * PATCH /events/:id/participants/:participantId/status
   * Changer le statut d'un participant (EN_ATTENTE / CONFIRME / REFUSE / ANNULE).
   * CONFIRME → vérifie la capacité. REFUSE/ANNULE → promeut la liste d'attente.
   * CONFIRME/REFUSE → notification push au participant.
   */
  @Patch(':id/participants/:participantId/status')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'RESPONSABLE_CENTRE', 'RESPONSABLE_CLUB')
  updateParticipantStatus(
    @Request() req: any,
    @Param('id') id: string,
    @Param('participantId') participantId: string,
    @Body('status') status: string,
  ) {
    return this.eventsService.updateParticipantStatus(
      id,
      participantId,
      status,
      req.user.userId,
    );
  }

  /**
   * PATCH /events/:id/participants/:participantId/checkin
   * Marquer présent ou absent un participant (par un responsable).
   * Check-in : uniquement pendant l'événement (start ≤ now ≤ end).
   * Premier check-in → +10 points (SQL atomique) → notification push.
   */
  @Patch(':id/participants/:participantId/checkin')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'RESPONSABLE_CENTRE', 'RESPONSABLE_CLUB')
  setParticipantCheckin(
    @Request() req: any,
    @Param('id') id: string,
    @Param('participantId') participantId: string,
    @Body('checkin') checkin: boolean,
  ) {
    return this.eventsService.setParticipantCheckin(
      id,
      participantId,
      checkin,
      req.user.userId,
    );
  }

  /**
   * PATCH /events/:id
   * Modifier un événement (nom, description, dates, heures, local, clubs, capacité, timeline).
   * Vérifie les conflits après modification (excludeEventId pattern).
   * Notifie les participants CONFIRME/EN_ATTENTE des champs modifiés.
   */
  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'RESPONSABLE_CENTRE', 'RESPONSABLE_CLUB')
  update(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateEventDto,
  ) {
    return this.eventsService.update(req.user.userId, id, dto);
  }

  /**
   * PATCH /events/:id/activate
   * Activer un événement (is_active = true).
   * Valide la demande soumise par un RESPONSABLE_CLUB.
   */
  @Patch(':id/activate')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'RESPONSABLE_CENTRE', 'RESPONSABLE_CLUB')
  activate(@Request() req: any, @Param('id') id: string) {
    return this.eventsService.setActive(req.user.userId, id, true);
  }

  /**
   * PATCH /events/:id/refuse-request
   * Refuser la demande d'événement d'un RESPONSABLE_CLUB (is_active = false).
   */
  @Patch(':id/refuse-request')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'RESPONSABLE_CENTRE', 'RESPONSABLE_CLUB')
  refuseRequest(@Request() req: any, @Param('id') id: string) {
    return this.eventsService.refuseEventRequest(req.user.userId, id);
  }

  /**
   * PATCH /events/:id/deactivate
   * Désactiver un événement sans l'annuler (is_active = false, sans notifications).
   */
  @Patch(':id/deactivate')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'RESPONSABLE_CENTRE', 'RESPONSABLE_CLUB')
  deactivate(@Request() req: any, @Param('id') id: string) {
    return this.eventsService.setActive(req.user.userId, id, false);
  }

  /**
   * PATCH /events/:id/cancel
   * Annuler un événement actif (is_active = false).
   * Supprime les notifications EVENT_UPDATED / EVENT_REMINDER liées à l'événement.
   * Envoie une notification d'annulation à tous les participants CONFIRME/EN_ATTENTE.
   */
  @Patch(':id/cancel')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'RESPONSABLE_CENTRE', 'RESPONSABLE_CLUB')
  cancel(@Request() req: any, @Param('id') id: string) {
    return this.eventsService.cancelEvent(req.user.userId, id);
  }
}
