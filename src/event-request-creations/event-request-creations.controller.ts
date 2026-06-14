/**
 * ============================================================
 * FICHIER : event-request-creations.controller.ts
 * RÔLE    : Routes HTTP pour les demandes de création d'événement.
 * ============================================================
 *
 * BASE URL : /event-request-creations
 * Tout le controller est protégé par AuthGuard('jwt') → JWT obligatoire.
 *
 * ROUTES EXPOSÉES :
 *
 *   POST /event-request-creations                   [ADMIN, RESP_CENTRE, RESP_CLUB]
 *     → Soumettre une demande de création d'événement (statut PENDING).
 *     → L'événement N'EST PAS encore créé — il sera créé seulement lors de l'approbation.
 *     → Mêmes champs que CreateEventDto : nom, dates, heures, local, clubs, capacité, timeline.
 *     → RESPONSABLE_CLUB : doit être coach ou staff actif des clubs associés.
 *
 *   GET /event-request-creations/me
 *     → Lister mes demandes (ou les demandes visibles selon mon rôle) :
 *         RESPONSABLE_CENTRE → toutes les demandes de son centre (pas seulement les siennes)
 *         RESPONSABLE_CLUB   → ses demandes + demandes de ses clubs (primaire ou collaborateur)
 *         Autres             → uniquement ses propres demandes (filtre par created_by)
 *
 *   GET /event-request-creations/pending            [ADMIN, RESP_CENTRE]
 *     → Lister les demandes en attente (PENDING) pour le centre de l'utilisateur.
 *     → Triées par created_at ASC (première demande soumise = première traitée).
 *     → Inclut : requester (auteur), reviewer (si déjà traité), club, local, event lié.
 *
 *   PATCH /event-request-creations/:id/approve      [ADMIN, RESP_CENTRE]
 *     → Approuver une demande PENDING.
 *     → Vérifie que la demande appartient au centre du reviewer (sauf ADMIN).
 *     → Appelle eventsService.create() avec le reviewer comme créateur
 *       → L'événement est créé avec is_active = true (car reviewer = ADMIN ou RESP_CENTRE).
 *     → Met à jour la demande : status=APPROVED, reviewed_by, reviewed_at, event_id.
 *
 *   PATCH /event-request-creations/:id/refuse       [ADMIN, RESP_CENTRE]
 *     → Refuser une demande PENDING.
 *     → Vérifie que la demande appartient au centre du reviewer (sauf ADMIN).
 *     → Met à jour : status=REFUSED, reviewed_by, reviewed_at.
 *     → Aucun événement n'est créé.
 *
 * NOTE : Une demande déjà traitée (APPROVED ou REFUSED) lève une BadRequestException.
 */

import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from 'src/auth/roles.decorator';
import { RolesGuard } from 'src/auth/roles.guard';
import { CreateEventRequestCreationDto } from './dto/create-event-request-creation.dto';
import { EventRequestCreationsService } from './event-request-creations.service';

@Controller('event-request-creations')
@UseGuards(AuthGuard('jwt'))
export class EventRequestCreationsController {
  constructor(
    private readonly eventRequestCreationsService: EventRequestCreationsService,
  ) {}

  /**
   * POST /event-request-creations
   * Soumettre une demande de création d'événement (statut PENDING).
   * L'événement n'est pas encore créé — il sera créé lors de l'approbation.
   * RESP_CLUB : doit être coach ou staff actif des clubs associés.
   */
  @Post()
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'RESPONSABLE_CENTRE', 'RESPONSABLE_CLUB')
  create(@Request() req: any, @Body() dto: CreateEventRequestCreationDto) {
    return this.eventRequestCreationsService.create(req.user.userId, dto);
  }

  /**
   * GET /event-request-creations/me
   * Mes demandes (visibilité selon le rôle) :
   *   RESP_CENTRE → toutes les demandes de son centre
   *   RESP_CLUB   → ses demandes + demandes de ses clubs (primaire ou collaborateur)
   *   Autres      → uniquement ses propres demandes (created_by)
   */
  @Get('me')
  findMyRequests(@Request() req: any) {
    return this.eventRequestCreationsService.findMyRequests(req.user.userId);
  }

  /**
   * GET /event-request-creations/pending
   * Demandes en attente (PENDING) pour le centre de l'utilisateur.
   * Triées par created_at ASC (FIFO). Inclut requester, reviewer, club, local, event.
   */
  @Get('pending')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'RESPONSABLE_CENTRE')
  findPendingForCentre(@Request() req: any) {
    return this.eventRequestCreationsService.findPendingForCentre(
      req.user.userId,
    );
  }

  /**
   * PATCH /event-request-creations/:id/approve
   * Approuver une demande PENDING → eventsService.create() → événement is_active=true.
   * Met à jour : status=APPROVED, reviewed_by, reviewed_at, event_id.
   * Lève BadRequestException si déjà traitée.
   */
  @Patch(':id/approve')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'RESPONSABLE_CENTRE')
  approve(@Request() req: any, @Param('id') id: string) {
    return this.eventRequestCreationsService.approve(req.user.userId, id);
  }

  /**
   * PATCH /event-request-creations/:id/refuse
   * Refuser une demande PENDING (aucun événement créé).
   * Met à jour : status=REFUSED, reviewed_by, reviewed_at.
   * Lève BadRequestException si déjà traitée.
   */
  @Patch(':id/refuse')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'RESPONSABLE_CENTRE')
  refuse(@Request() req: any, @Param('id') id: string) {
    return this.eventRequestCreationsService.refuse(req.user.userId, id);
  }
}
