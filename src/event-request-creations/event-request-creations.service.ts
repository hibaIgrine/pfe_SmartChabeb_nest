/**
 * ============================================================
 * FICHIER : event-request-creations.service.ts
 * RÔLE    : Logique métier pour les demandes de création d'événement.
 * ============================================================
 *
 * CONCEPT :
 *   Ce service gère un workflow de demande structurée pour créer un événement.
 *   Contrairement à la création directe (POST /events), ici la demande est
 *   stockée dans event_request_creations avec statut PENDING, et l'événement
 *   n'est créé dans la table events QUE lors de l'approbation.
 *
 * TYPE Requester :
 *   { id, role, id_centre } — profil minimal du demandeur chargé depuis la BDD.
 *
 * MÉTHODES PRIVÉES (helpers) :
 *
 *   resolveRequester(userId)
 *     → Charge l'utilisateur (id, role, id_centre). NotFoundException si absent.
 *
 *   normalizeTime(value)
 *     → Normalise un horaire en "HH:mm" en clampant h (0-23) et m (0-59).
 *     → Ex: "9:5" → "09:05", "25:70" → "23:59".
 *
 *   buildDateTime(date, time)
 *     → Construit un objet Date complet depuis une date "YYYY-MM-DD" et un horaire.
 *     → Utilise le constructeur numérique new Date(y, m, d, h, min, s) pour éviter
 *       les décalages de timezone lors du parsing des ISO strings.
 *
 *   buildDateOnly(date)
 *     → Construit une Date à midi UTC (Date.UTC(y, m-1, d, 12, 0, 0)).
 *     → Le midi UTC garantit que le jour calendaire survit à toute conversion
 *       timezone lors de la sérialisation JSON.
 *
 *   resolveClubs(clubIds)
 *     → Vérifie que tous les clubIds existent dans la BDD.
 *     → Lève BadRequestException si un club est introuvable.
 *
 *   resolveManagedClubIds(userId)
 *     → Retourne les IDs des clubs gérés par l'utilisateur :
 *       id_coach = userId OU staff actif (is_active=true).
 *     → Différent de getManagedClubIds dans EventsService qui ne regarde que id_coach.
 *
 *   normalizeClubSelection(clubId?, clubIds?)
 *     → primaryClubId = clubId OU clubIds[0] (si pas de clubId).
 *     → collaborators = clubIds filtrés pour exclure le primaryClubId.
 *
 *   assertCapacityIsValid(capacity?)
 *     → Vérifie que capacity est un entier entre 1 et 1 000 000.
 *
 *   assertRequesterCanUseClubs(requester, primaryClubId, collaboratorIds)
 *     → Si RESPONSABLE_CLUB : vérifie que chaque club (primaire + collaborateurs)
 *       est géré par l'utilisateur (via resolveManagedClubIds).
 *     → Les autres rôles ne sont pas vérifiés ici (ils ont accès libre aux clubs).
 *
 * MÉTHODES PUBLIQUES :
 *
 *   create(userId, dto)
 *     → Pipeline de création de demande :
 *       1. resolveRequester → charge le demandeur
 *       2. Vérifie l'existence du local
 *       3. normalizeClubSelection → primaryClubId + collaborators
 *       4. resolveClubs → vérifie existence de tous les clubs
 *       5. Vérifie que clubs et local sont dans le même centre
 *       6. assertRequesterCanUseClubs → RBAC RESP_CLUB
 *       7. assertCapacityIsValid → entier 1-1 000 000
 *       8. buildDateOnly + buildDateTime → dates/heures typées
 *       9. Vérifie end > start
 *       10. Crée la demande avec statut PENDING dans event_request_creations
 *     → Retourne la demande avec requester, club, local inclus.
 *
 *   findMyRequests(userId)
 *     → Retourne les demandes visibles selon le rôle :
 *         RESP_CENTRE → toutes les demandes du local de son centre
 *         RESP_CLUB   → ses demandes + demandes de ses clubs (primary OU collaborating)
 *         Autres      → seulement ses propres demandes (created_by = userId)
 *     → Inclut : requester, reviewer, club, local, event lié (si approuvé).
 *     → Triées par created_at DESC.
 *
 *   findPendingForCentre(userId)
 *     → Retourne les demandes PENDING pour le centre de l'utilisateur.
 *     → RBAC : ADMIN ou RESP_CENTRE uniquement.
 *     → Filtre : status=PENDING + local.id_centre = requester.id_centre
 *     → Triées par created_at ASC (FIFO : première soumise, première traitée).
 *
 *   approve(userId, requestId)
 *     → Valide une demande PENDING :
 *       1. Vérifie existence + statut PENDING (BadRequestException si déjà traitée)
 *       2. RBAC : ADMIN ou RESP_CENTRE de ce centre
 *       3. Reconstruit le payload pour eventsService.create() :
 *          - date_event formaté depuis les composantes locales (getFullYear/getMonth/getDate)
 *            pour préserver le jour calendaire sans décalage timezone
 *          - start_time / end_time extraits depuis .toTimeString() (HH:mm:ss)
 *       4. eventsService.create(requester.id, payload) → reviewerId comme créateur
 *          → is_active = true car reviewer est ADMIN ou RESP_CENTRE
 *       5. Mise à jour de la demande : status=APPROVED, reviewed_by, reviewed_at, event_id
 *     → Retourne la demande mise à jour avec event lié.
 *
 *   refuse(userId, requestId)
 *     → Refuse une demande PENDING :
 *       1. Vérifie existence + statut PENDING
 *       2. RBAC : ADMIN ou RESP_CENTRE de ce centre
 *       3. Mise à jour : status=REFUSED, reviewed_by, reviewed_at
 *     → Aucun événement n'est créé.
 *     → Retourne la demande mise à jour.
 */

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { EventsService } from 'src/events/events.service';
import { CreateEventRequestCreationDto } from './dto/create-event-request-creation.dto';

type Requester = {
  id: string;
  role: string;
  id_centre: string | null;
};

@Injectable()
export class EventRequestCreationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventsService: EventsService,
  ) {}

  /** Charge l'utilisateur (id, role, id_centre). NotFoundException si absent. */
  private async resolveRequester(userId: string): Promise<Requester> {
    const user = await this.prisma.utilisateurs.findUnique({
      where: { id: userId },
      select: { id: true, role: true, id_centre: true },
    });

    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    return user;
  }

  /** Normalise un horaire en "HH:mm" en clampant h (0-23) et m (0-59). */
  private normalizeTime(value: string) {
    const parts = value.split(':');
    const hh = String(
      Math.min(Math.max(Number(parts[0]) || 0, 0), 23),
    ).padStart(2, '0');
    const mm = String(
      Math.min(Math.max(Number(parts[1]) || 0, 0), 59),
    ).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  /**
   * Construit un DateTime depuis "YYYY-MM-DD" + "HH:mm".
   * Utilise le constructeur numérique new Date(y, m, d, h, min, s) pour éviter
   * les décalages de timezone liés au parsing des ISO strings.
   */
  private buildDateTime(date: string, time: string) {
    const normalizedTime = this.normalizeTime(time);
    const timePart =
      normalizedTime.length === 5 ? `${normalizedTime}:00` : normalizedTime;
    // Parse components and construct Date using numeric constructor to
    // ensure the resulting Date represents the local wall-clock time
    // (avoids accidental timezone shifts when parsing ISO strings).
    const [y, m, d] = date.split('-').map((v) => Number(v));
    const [hh, mm, ss] = timePart.split(':').map((v) => Number(v));
    return new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, ss || 0);
  }

  /**
   * Construit une Date à midi UTC (Date.UTC(y, m-1, d, 12, 0, 0)).
   * Le midi UTC garantit que le jour calendaire survit à toute conversion timezone en JSON.
   */
  private buildDateOnly(date: string) {
    const [y, m, d] = date.split('-').map((v) => Number(v));
    // Use UTC noon so the stored calendar day survives any timezone
    // conversion when the Date is serialized back to JSON.
    return new Date(Date.UTC(y, (m || 1) - 1, d || 1, 12, 0, 0));
  }

  /** Vérifie que tous les clubIds existent. BadRequestException si l'un est introuvable. */
  private async resolveClubs(clubIds: string[]) {
    if (clubIds.length === 0) return [];

    const clubs = await this.prisma.clubs.findMany({
      where: { id: { in: clubIds } },
      select: { id: true, id_centre: true },
    });

    if (clubs.length !== clubIds.length) {
      throw new BadRequestException('Un ou plusieurs clubs sont introuvables');
    }

    return clubs;
  }

  /**
   * Retourne les IDs des clubs gérés par l'utilisateur.
   * Inclut : id_coach = userId OU staff actif (is_active=true).
   * Plus large que getManagedClubIds d'EventsService (qui ne regarde que id_coach).
   */
  private async resolveManagedClubIds(userId: string) {
    const clubs = await this.prisma.clubs.findMany({
      where: {
        OR: [
          { id_coach: userId },
          {
            staff: {
              some: {
                id_utilisateur: userId,
                is_active: true,
              },
            },
          },
        ],
      },
      select: { id: true },
    });

    return clubs.map((club) => club.id);
  }

  /**
   * primaryClubId = clubId OU clubIds[0].
   * collaborators = clubIds filtrés pour exclure le primaryClubId.
   */
  private normalizeClubSelection(clubId?: string, clubIds?: string[]) {
    const primaryClubId = clubId || clubIds?.[0] || null;
    const collaborators = Array.isArray(clubIds)
      ? clubIds.filter((value) => value && value !== primaryClubId)
      : [];

    return { primaryClubId, collaborators };
  }

  /** Vérifie que la capacité est un entier entre 1 et 1 000 000. */
  private assertCapacityIsValid(capacity?: number) {
    if (capacity === undefined || capacity === null) return;

    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new BadRequestException('La capacité doit être un entier positif');
    }

    if (capacity > 1000000) {
      throw new BadRequestException(
        'La capacité ne doit pas dépasser 1 000 000',
      );
    }
  }

  /**
   * RBAC pour RESPONSABLE_CLUB : vérifie que chaque club associé est géré par lui.
   * (coach OU staff actif). Les autres rôles ne sont pas vérifiés.
   */
  private async assertRequesterCanUseClubs(
    requester: Requester,
    primaryClubId: string | null,
    collaboratorIds: string[],
  ) {
    if (requester.role !== 'RESPONSABLE_CLUB') return;

    const managedClubIds = new Set(
      await this.resolveManagedClubIds(requester.id),
    );

    if (primaryClubId && !managedClubIds.has(primaryClubId)) {
      throw new ForbiddenException('Club principal non autorisé');
    }

    for (const collaboratorId of collaboratorIds) {
      if (!managedClubIds.has(collaboratorId)) {
        throw new ForbiddenException('Club collaborateur non autorisé');
      }
    }
  }

  /**
   * Crée une demande d'événement (statut PENDING).
   * Pipeline : local → clubs (même centre) → RBAC RESP_CLUB → capacité → dates/heures → insert.
   * L'événement N'EST PAS créé ici — il le sera lors de l'approbation.
   */
  async create(userId: string, dto: CreateEventRequestCreationDto) {
    const requester = await this.resolveRequester(userId);
    const local = await this.prisma.locaux.findUnique({
      where: { id: dto.locaux_id },
      select: { id: true, id_centre: true },
    });

    if (!local) {
      throw new NotFoundException('Local introuvable');
    }

    const { primaryClubId, collaborators } = this.normalizeClubSelection(
      dto.club_id,
      dto.club_ids,
    );

    const clubsToCheck = [primaryClubId, ...collaborators].filter(
      (value): value is string => Boolean(value),
    );
    const clubRecords = await this.resolveClubs(clubsToCheck);
    const primaryClub = primaryClubId
      ? (clubRecords.find((club) => club.id === primaryClubId) ?? null)
      : null;

    if (primaryClub && primaryClub.id_centre !== local.id_centre) {
      throw new BadRequestException(
        'Le club principal doit appartenir au centre du local',
      );
    }

    for (const collaboratorId of collaborators) {
      const collaborator = clubRecords.find(
        (club) => club.id === collaboratorId,
      );
      if (collaborator?.id_centre !== local.id_centre) {
        throw new BadRequestException(
          'Les clubs collaborateurs doivent appartenir au même centre que le local',
        );
      }
    }

    await this.assertRequesterCanUseClubs(
      requester,
      primaryClubId,
      collaborators,
    );

    this.assertCapacityIsValid(dto.capacity);

    const eventDate = this.buildDateOnly(dto.date_event);
    const startDateTime = this.buildDateTime(dto.date_event, dto.start_time);
    const endDateTime = this.buildDateTime(dto.date_event, dto.end_time);

    if (endDateTime <= startDateTime) {
      throw new BadRequestException(
        "L'heure de fin doit être supérieure à l'heure de début",
      );
    }

    const request = await this.prisma.event_request_creations.create({
      data: {
        nom: dto.nom,
        description: dto.description,
        date_event: eventDate,
        start_time: startDateTime,
        end_time: endDateTime,
        capacity: dto.capacity,
        timeline: dto.timeline
          ? (dto.timeline as unknown as Prisma.InputJsonValue)
          : undefined,
        club_id: primaryClubId ?? undefined,
        collaborating_club_ids: collaborators,
        locaux_id: dto.locaux_id,
        created_by: requester.id,
        status: 'PENDING',
      },
      include: {
        requester: {
          select: { id: true, nom: true, prenom: true, role: true },
        },
        club: { select: { id: true, nom: true, id_centre: true } },
        local: { select: { id: true, nom: true, id_centre: true } },
      },
    });

    return request;
  }

  /**
   * Retourne les demandes visibles selon le rôle :
   *   RESP_CENTRE → toutes les demandes du local de son centre
   *   RESP_CLUB   → ses demandes + demandes de ses clubs (primaire OU collaborateurs)
   *   Autres      → seulement ses propres demandes (created_by = userId)
   * Inclut requester, reviewer, club, local, event lié. Trié par created_at DESC.
   */
  async findMyRequests(userId: string) {
    const requester = await this.resolveRequester(userId);

    if (requester.role === 'RESPONSABLE_CENTRE') {
      return this.prisma.event_request_creations.findMany({
        where: {
          local: { id_centre: requester.id_centre ?? undefined },
        },
        include: {
          requester: {
            select: { id: true, nom: true, prenom: true, role: true },
          },
          reviewer: {
            select: { id: true, nom: true, prenom: true, role: true },
          },
          club: { select: { id: true, nom: true, id_centre: true } },
          local: { select: { id: true, nom: true, id_centre: true } },
          event: { select: { id: true, nom: true, is_active: true } },
        },
        orderBy: { created_at: 'desc' },
      });
    }

    if (requester.role === 'RESPONSABLE_CLUB') {
      const managedClubIds = await this.resolveManagedClubIds(requester.id);

      return this.prisma.event_request_creations.findMany({
        where: {
          OR: [
            { created_by: requester.id },
            { club_id: { in: managedClubIds } },
            { collaborating_club_ids: { hasSome: managedClubIds } },
          ],
        },
        include: {
          requester: {
            select: { id: true, nom: true, prenom: true, role: true },
          },
          reviewer: {
            select: { id: true, nom: true, prenom: true, role: true },
          },
          club: { select: { id: true, nom: true, id_centre: true } },
          local: { select: { id: true, nom: true, id_centre: true } },
          event: { select: { id: true, nom: true, is_active: true } },
        },
        orderBy: { created_at: 'desc' },
      });
    }

    return this.prisma.event_request_creations.findMany({
      where: { created_by: requester.id },
      include: {
        requester: {
          select: { id: true, nom: true, prenom: true, role: true },
        },
        reviewer: { select: { id: true, nom: true, prenom: true, role: true } },
        club: { select: { id: true, nom: true, id_centre: true } },
        local: { select: { id: true, nom: true, id_centre: true } },
        event: { select: { id: true, nom: true, is_active: true } },
      },
      orderBy: { created_at: 'desc' },
    });
  }

  /**
   * Retourne les demandes PENDING pour le centre de l'utilisateur (FIFO, trié created_at ASC).
   * RBAC : ADMIN ou RESPONSABLE_CENTRE uniquement.
   */
  async findPendingForCentre(userId: string) {
    const requester = await this.resolveRequester(userId);
    if (requester.role !== 'RESPONSABLE_CENTRE' && requester.role !== 'ADMIN') {
      throw new ForbiddenException('Acces refuse');
    }

    return this.prisma.event_request_creations.findMany({
      where: {
        status: 'PENDING',
        local: { id_centre: requester.id_centre ?? undefined },
      },
      include: {
        requester: {
          select: { id: true, nom: true, prenom: true, role: true },
        },
        reviewer: { select: { id: true, nom: true, prenom: true, role: true } },
        club: { select: { id: true, nom: true, id_centre: true } },
        local: { select: { id: true, nom: true, id_centre: true } },
        event: { select: { id: true, nom: true, is_active: true } },
      },
      orderBy: { created_at: 'asc' },
    });
  }

  /**
   * Approuve une demande PENDING.
   * Vérifie : PENDING + RBAC (RESP_CENTRE de ce centre).
   * Reconstruit le payload et appelle eventsService.create(reviewerId, ...).
   *   → Reviewer = ADMIN ou RESP_CENTRE → is_active = true (événement actif immédiatement).
   *   → date_event formaté depuis composantes locales (getFullYear/getMonth/getDate)
   *     pour préserver le jour calendaire sans décalage timezone.
   * Met à jour la demande : status=APPROVED, reviewed_by, reviewed_at, event_id.
   */
  async approve(userId: string, requestId: string) {
    const requester = await this.resolveRequester(userId);
    const request = await this.prisma.event_request_creations.findUnique({
      where: { id: requestId },
      include: {
        club: { select: { id: true, nom: true, id_centre: true } },
        local: { select: { id: true, nom: true, id_centre: true } },
      },
    });

    if (!request) {
      throw new NotFoundException('Demande introuvable');
    }

    if (request.status !== 'PENDING') {
      throw new BadRequestException('Demande déjà traitée');
    }

    if (
      requester.role !== 'ADMIN' &&
      requester.role !== 'RESPONSABLE_CENTRE' &&
      requester.id_centre !== request.local.id_centre
    ) {
      throw new ForbiddenException('Demande hors de votre centre');
    }

    const clubIds = [
      request.club_id,
      ...(Array.isArray(request.collaborating_club_ids)
        ? request.collaborating_club_ids
        : []),
    ].filter((value): value is string => Boolean(value));

    const payload = {
      nom: request.nom,
      description: request.description ?? undefined,
      // Format date_event using local date parts to preserve the
      // user-selected calendar day regardless of timezone.
      date_event: `${request.date_event.getFullYear()}-${String(
        request.date_event.getMonth() + 1,
      ).padStart(2, '0')}-${String(request.date_event.getDate()).padStart(
        2,
        '0',
      )}`,
      start_time: request.start_time.toTimeString().split(' ')[0].slice(0, 5),
      end_time: request.end_time.toTimeString().split(' ')[0].slice(0, 5),
      locaux_id: request.locaux_id,
      club_id: request.club_id ?? undefined,
      club_ids: clubIds.filter((clubId) => clubId !== request.club_id),
      capacity: request.capacity ?? undefined,
      timeline: request.timeline as
        | Array<{
            title: string;
            start_time: string;
            end_time: string;
            details?: string;
          }>
        | undefined,
    };

    const createdEvent = await this.eventsService.create(
      requester.id,
      payload as any,
    );
    const firstEvent = Array.isArray(createdEvent.events)
      ? createdEvent.events[0]
      : null;

    return this.prisma.event_request_creations.update({
      where: { id: requestId },
      data: {
        status: 'APPROVED',
        reviewed_by: requester.id,
        reviewed_at: new Date(),
        event_id: firstEvent?.id,
      },
      include: {
        requester: {
          select: { id: true, nom: true, prenom: true, role: true },
        },
        reviewer: { select: { id: true, nom: true, prenom: true, role: true } },
        club: { select: { id: true, nom: true, id_centre: true } },
        local: { select: { id: true, nom: true, id_centre: true } },
        event: { select: { id: true, nom: true, is_active: true } },
      },
    });
  }

  /**
   * Refuse une demande PENDING (aucun événement créé).
   * Vérifie : PENDING + RBAC. Met à jour : status=REFUSED, reviewed_by, reviewed_at.
   */
  async refuse(userId: string, requestId: string) {
    const requester = await this.resolveRequester(userId);
    const request = await this.prisma.event_request_creations.findUnique({
      where: { id: requestId },
      include: { local: { select: { id_centre: true } } },
    });

    if (!request) {
      throw new NotFoundException('Demande introuvable');
    }

    if (request.status !== 'PENDING') {
      throw new BadRequestException('Demande déjà traitée');
    }

    if (
      requester.role !== 'ADMIN' &&
      requester.role !== 'RESPONSABLE_CENTRE' &&
      requester.id_centre !== request.local.id_centre
    ) {
      throw new ForbiddenException('Demande hors de votre centre');
    }

    return this.prisma.event_request_creations.update({
      where: { id: requestId },
      data: {
        status: 'REFUSED',
        reviewed_by: requester.id,
        reviewed_at: new Date(),
      },
      include: {
        requester: {
          select: { id: true, nom: true, prenom: true, role: true },
        },
        reviewer: { select: { id: true, nom: true, prenom: true, role: true } },
        club: { select: { id: true, nom: true, id_centre: true } },
        local: { select: { id: true, nom: true, id_centre: true } },
        event: { select: { id: true, nom: true, is_active: true } },
      },
    });
  }
}
