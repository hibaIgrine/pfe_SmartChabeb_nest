import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, utilisateurs } from '@prisma/client';
import { NotificationsService } from 'src/notifications/notifications.service';
import { ReservationsService } from 'src/reservations/reservations.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateEventDto } from './dto/create-event.dto';
import { CreateEventFeedbackDto } from './dto/create-event-feedback.dto';
import { UpdateEventDto } from './dto/update-event.dto';

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly reservationsService: ReservationsService,
  ) {}

  private readonly pointsPerParticipation = 10;
  private readonly timeRegex = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

  private readonly participantStatuses = [
    'EN_ATTENTE',
    'CONFIRME',
    'REFUSE',
    'ANNULE',
  ] as const;

  private addDays(baseDate: Date, days: number) {
    const copy = new Date(baseDate);
    copy.setDate(copy.getDate() + days);
    return copy;
  }

  private addMonths(baseDate: Date, months: number) {
    const copy = new Date(baseDate);
    copy.setMonth(copy.getMonth() + months);
    return copy;
  }

  private normalizeDateOnly(dateValue: Date) {
    const dateStr = dateValue.toISOString().split('T')[0];
    return new Date(`${dateStr}T00:00:00`);
  }

  private buildOccurrenceDates(
    baseDate: Date,
    recurrenceType?: 'NONE' | 'DAILY' | 'WEEKLY' | 'MONTHLY',
    recurrenceCount?: number,
    recurrenceUntil?: string,
  ) {
    const type = recurrenceType ?? 'NONE';
    if (type === 'NONE') {
      return [this.normalizeDateOnly(baseDate)];
    }

    const maxCount = Math.min(Math.max(recurrenceCount ?? 1, 1), 52);
    const untilDate = recurrenceUntil
      ? this.normalizeDateOnly(new Date(`${recurrenceUntil}T00:00:00`))
      : null;

    if (untilDate && untilDate < this.normalizeDateOnly(baseDate)) {
      throw new BadRequestException(
        'recurrence_until doit etre superieur ou egal a date_event',
      );
    }

    const occurrences: Date[] = [];
    for (let i = 0; i < maxCount; i++) {
      const current =
        type === 'DAILY'
          ? this.addDays(baseDate, i)
          : type === 'WEEKLY'
            ? this.addDays(baseDate, i * 7)
            : this.addMonths(baseDate, i);

      const normalizedCurrent = this.normalizeDateOnly(current);
      if (untilDate && normalizedCurrent > untilDate) {
        break;
      }
      occurrences.push(normalizedCurrent);
    }

    if (occurrences.length === 0) {
      throw new BadRequestException('Aucune occurrence valide generee');
    }

    return occurrences;
  }

  private buildTimeOnDate(date: Date, time: string) {
    const datePart = date.toISOString().split('T')[0];
    const normalizedTime = time.length === 5 ? `${time}:00` : time;
    return new Date(`${datePart}T${normalizedTime}`);
  }

  private normalizeTimeToHHMM(value: string) {
    const [h, m] = value.split(':');
    return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
  }

  private timeToMinutes(value: string) {
    const normalized = this.normalizeTimeToHHMM(value);
    const [h, m] = normalized.split(':').map(Number);
    return h * 60 + m;
  }

  private normalizeTimeline(
    timeline:
      | Array<{
          title: string;
          start_time: string;
          end_time: string;
          details?: string;
        }>
      | undefined,
    eventStartTime: string,
    eventEndTime: string,
  ) {
    if (timeline === undefined) return undefined;
    if (timeline.length === 0) return [];

    const eventStartMinutes = this.timeToMinutes(eventStartTime);
    const eventEndMinutes = this.timeToMinutes(eventEndTime);

    const normalized = timeline.map((step, index) => {
      const title = (step.title ?? '').trim();
      const startTime = this.normalizeTimeToHHMM(step.start_time ?? '');
      const endTime = this.normalizeTimeToHHMM(step.end_time ?? '');
      const details = step.details?.trim() || undefined;

      if (!title) {
        throw new BadRequestException(
          `Timeline etape ${index + 1}: titre obligatoire`,
        );
      }

      if (
        !this.timeRegex.test(step.start_time) ||
        !this.timeRegex.test(step.end_time)
      ) {
        throw new BadRequestException(
          `Timeline etape ${index + 1}: format horaire invalide (HH:mm ou HH:mm:ss)`,
        );
      }

      const startMinutes = this.timeToMinutes(startTime);
      const endMinutes = this.timeToMinutes(endTime);

      if (endMinutes <= startMinutes) {
        throw new BadRequestException(
          `Timeline etape ${index + 1}: l'heure de fin doit etre superieure a l'heure de debut`,
        );
      }

      if (startMinutes < eventStartMinutes || endMinutes > eventEndMinutes) {
        throw new BadRequestException(
          `Timeline etape ${index + 1}: doit etre comprise entre ${this.normalizeTimeToHHMM(eventStartTime)} et ${this.normalizeTimeToHHMM(eventEndTime)}`,
        );
      }

      return {
        title,
        start_time: startTime,
        end_time: endTime,
        details,
        startMinutes,
        endMinutes,
      };
    });

    const sorted = [...normalized].sort(
      (a, b) => a.startMinutes - b.startMinutes,
    );

    for (let i = 1; i < sorted.length; i++) {
      const previous = sorted[i - 1];
      const current = sorted[i];

      if (current.startMinutes < previous.endMinutes) {
        throw new BadRequestException(
          `Timeline invalide: chevauchement entre "${previous.title}" et "${current.title}"`,
        );
      }
    }

    return sorted.map(({ title, start_time, end_time, details }) => ({
      title,
      start_time,
      end_time,
      details,
    }));
  }

  private async findConflicts(
    localId: string,
    dateEvent: Date,
    startDateTime: Date,
    endDateTime: Date,
    excludeEventId?: string,
  ) {
    return this.prisma.events.findMany({
      where: {
        locaux_id: localId,
        is_active: true,
        date_event: dateEvent,
        ...(excludeEventId ? { id: { not: excludeEventId } } : {}),
        OR: [
          {
            start_time: { lte: startDateTime },
            end_time: { gt: startDateTime },
          },
          {
            start_time: { lt: endDateTime },
            end_time: { gte: endDateTime },
          },
          {
            start_time: { gte: startDateTime },
            end_time: { lte: endDateTime },
          },
        ],
      },
      select: {
        id: true,
        nom: true,
        date_event: true,
        start_time: true,
        end_time: true,
      },
      orderBy: { start_time: 'asc' },
    });
  }

  private async resolveRequester(userId: string) {
    const user = await this.prisma.utilisateurs.findUnique({
      where: { id: userId },
      select: { id: true, role: true, id_centre: true },
    });

    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    return user;
  }

  private buildDateTimes(
    dateEvent: string,
    startTime: string,
    endTime: string,
  ) {
    const eventDate = new Date(dateEvent);
    const startDateTime = new Date(`${dateEvent}T${startTime}`);
    const endDateTime = new Date(`${dateEvent}T${endTime}`);

    if (Number.isNaN(eventDate.getTime())) {
      throw new BadRequestException('date_event invalide');
    }

    if (
      Number.isNaN(startDateTime.getTime()) ||
      Number.isNaN(endDateTime.getTime())
    ) {
      throw new BadRequestException('start_time ou end_time invalide');
    }

    if (endDateTime <= startDateTime) {
      throw new BadRequestException(
        'end_time doit etre strictement superieur a start_time',
      );
    }

    return { eventDate, startDateTime, endDateTime };
  }

  private async resolveLocalAndClub(locauxId: string, clubId: string) {
    const [local, club] = await Promise.all([
      this.prisma.locaux.findUnique({
        where: { id: locauxId },
        select: { id: true, id_centre: true, nom: true },
      }),
      this.prisma.clubs.findUnique({
        where: { id: clubId },
        select: {
          id: true,
          id_centre: true,
          id_coach: true,
          nom: true,
          est_actif: true,
        },
      }),
    ]);

    if (!local) {
      throw new NotFoundException('Local introuvable');
    }

    if (!club || !club.est_actif) {
      throw new NotFoundException('Club introuvable ou inactif');
    }

    if (local.id_centre !== club.id_centre) {
      throw new BadRequestException(
        'Le club et le local doivent appartenir au meme centre',
      );
    }

    return { local, club };
  }

  private async resolveLocal(locauxId: string) {
    const local = await this.prisma.locaux.findUnique({
      where: { id: locauxId },
      select: { id: true, id_centre: true, nom: true },
    });

    if (!local) {
      throw new NotFoundException('Local introuvable');
    }

    return local;
  }

  private normalizeClubSelection(clubId?: string | null, clubIds?: string[]) {
    const uniqueIds = Array.from(
      new Set([clubId, ...(clubIds ?? [])].filter(Boolean) as string[]),
    );

    return {
      primaryClubId: uniqueIds[0] ?? null,
      collaboratingClubIds: uniqueIds.slice(1),
    };
  }

  private async getManagedClubIds(userId: string) {
    const clubs = await this.prisma.clubs.findMany({
      where: { id_coach: userId, est_actif: true },
      select: { id: true },
    });

    return clubs.map((club) => club.id);
  }

  private async resolveClubsForEvent(
    localCentreId: string,
    primaryClubId: string | null,
    collaboratingClubIds: string[],
    requesterId: string,
    requesterRole: string,
  ) {
    const allClubIds = Array.from(
      new Set(
        [primaryClubId, ...collaboratingClubIds].filter(Boolean) as string[],
      ),
    );

    if (allClubIds.length === 0) {
      if (requesterRole === 'RESPONSABLE_CLUB') {
        throw new ForbiddenException(
          'Un responsable club doit associer au moins un club a l evenement',
        );
      }

      return { primaryClub: null, collaboratingClubIds: [] as string[] };
    }

    const clubs = await this.prisma.clubs.findMany({
      where: { id: { in: allClubIds } },
      select: {
        id: true,
        id_centre: true,
        id_coach: true,
        nom: true,
        est_actif: true,
      },
    });

    if (clubs.length !== allClubIds.length) {
      throw new NotFoundException('Un ou plusieurs clubs sont introuvables');
    }

    if (clubs.some((club) => !club.est_actif)) {
      throw new BadRequestException('Un ou plusieurs clubs sont inactifs');
    }

    if (clubs.some((club) => club.id_centre !== localCentreId)) {
      throw new BadRequestException(
        'Tous les clubs associes doivent appartenir au meme centre que le local',
      );
    }

    if (requesterRole === 'RESPONSABLE_CLUB') {
      const managedClubIds = await this.getManagedClubIds(requesterId);
      const canManageOneClub = allClubIds.some((clubId) =>
        managedClubIds.includes(clubId),
      );

      if (!canManageOneClub) {
        throw new ForbiddenException(
          'Vous ne pouvez gerer que les evenements liees a vos clubs',
        );
      }
    }

    const primaryClub =
      clubs.find((club) => club.id === primaryClubId) ?? clubs[0];
    const collaboratingIds = allClubIds.filter(
      (clubId) => clubId !== primaryClub.id,
    );

    return { primaryClub, collaboratingClubIds: collaboratingIds };
  }

  private assertCanManageEvent(
    requester: Pick<utilisateurs, 'id' | 'role' | 'id_centre'>,
    localCentreId: string,
    club: { id_coach: string | null; id_centre: string } | null,
  ) {
    if (requester.role === 'ADMIN') {
      return;
    }

    if (requester.role === 'RESPONSABLE_CENTRE') {
      if (!requester.id_centre || requester.id_centre !== localCentreId) {
        throw new ForbiddenException(
          'Vous ne pouvez gerer que les evenements de votre centre',
        );
      }
      return;
    }

    if (requester.role === 'RESPONSABLE_CLUB') {
      if (!club) {
        throw new ForbiddenException(
          'Un responsable club doit associer au moins un club a l evenement',
        );
      }
      if (club.id_coach !== requester.id) {
        throw new ForbiddenException(
          'Vous ne pouvez gerer que les evenements de vos clubs',
        );
      }
      return;
    }

    throw new ForbiddenException('Role non autorise pour gerer les evenements');
  }

  private async resolveEventForManagement(eventId: string) {
    const event = await this.prisma.events.findUnique({
      where: { id: eventId },
      include: {
        club: { select: { id_coach: true, id_centre: true, nom: true } },
        local: { select: { id_centre: true, nom: true } },
      },
    });

    if (!event) {
      throw new NotFoundException('Evenement introuvable');
    }

    return event;
  }

  private async countConfirmedParticipants(
    eventId: string,
    excludeId?: string,
  ) {
    return this.prisma.event_participants.count({
      where: {
        event_id: eventId,
        status: 'CONFIRME',
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
  }

  private async buildFeedbackSummary(eventId: string, userId: string) {
    const [stats, recentFeedbacks, myFeedback, myParticipation, event] =
      await Promise.all([
        this.prisma.eventFeedbacks.aggregate({
          where: { event_id: eventId },
          _avg: { note: true },
          _count: { note: true },
        }),
        this.prisma.eventFeedbacks.findMany({
          where: { event_id: eventId },
          include: {
            user: {
              select: { id: true, nom: true, prenom: true },
            },
          },
          orderBy: { created_at: 'desc' },
          take: 10,
        }),
        this.prisma.eventFeedbacks.findUnique({
          where: {
            event_id_user_id: {
              event_id: eventId,
              user_id: userId,
            },
          },
          select: {
            id: true,
            note: true,
            commentaire: true,
            created_at: true,
            updated_at: true,
          },
        }),
        this.prisma.event_participants.findUnique({
          where: {
            event_id_user_id: {
              event_id: eventId,
              user_id: userId,
            },
          },
          select: { status: true },
        }),
        this.prisma.events.findUnique({
          where: { id: eventId },
          select: { start_time: true },
        }),
      ]);

    const canRate =
      Boolean(event) &&
      (myParticipation?.status === 'CONFIRME' ||
        myParticipation?.status === 'ANNULE') &&
      new Date(event?.start_time ?? 0).getTime() <= Date.now();

    return {
      ratingAverage: Number((stats._avg.note ?? 0).toFixed(1)),
      ratingCount: stats._count.note,
      myFeedback,
      canRate,
      recentFeedbacks,
    };
  }

  private async buildVisibilityWhere(
    requester: Pick<utilisateurs, 'id' | 'role' | 'id_centre'>,
    includeInactive: boolean,
  ): Promise<Prisma.eventsWhereInput> {
    if (requester.role === 'ADMIN') {
      return includeInactive ? {} : { is_active: true };
    }

    if (requester.role === 'RESPONSABLE_CENTRE') {
      if (!requester.id_centre) {
        return { id: { in: [] } };
      }

      return {
        ...(includeInactive ? {} : { is_active: true }),
        local: { id_centre: requester.id_centre },
      };
    }

    if (requester.role === 'RESPONSABLE_CLUB') {
      const managedClubIds = await this.getManagedClubIds(requester.id);

      return {
        ...(includeInactive ? {} : { is_active: true }),
        OR: [
          { club: { id_coach: requester.id } },
          {
            collaborating_club_ids: {
              hasSome: managedClubIds,
            },
          },
        ],
      };
    }

    return { is_active: true };
  }

  async create(userId: string, dto: CreateEventDto) {
    const requester = await this.resolveRequester(userId);
    const local = await this.resolveLocal(dto.locaux_id);
    const { primaryClubId, collaboratingClubIds } = this.normalizeClubSelection(
      dto.club_id,
      dto.club_ids,
    );
    const { primaryClub, collaboratingClubIds: resolvedCollaborators } =
      await this.resolveClubsForEvent(
        local.id_centre,
        primaryClubId,
        collaboratingClubIds,
        requester.id,
        requester.role,
      );

    this.assertCanManageEvent(
      requester,
      local.id_centre,
      primaryClub
        ? {
            id_coach: primaryClub.id_coach,
            id_centre: primaryClub.id_centre,
          }
        : null,
    );

    const { eventDate, startDateTime, endDateTime } = this.buildDateTimes(
      dto.date_event,
      dto.start_time,
      dto.end_time,
    );

    // Recurrence removed: only single occurrence per event creation
    const occurrenceDates = [eventDate];

    const timeline = this.normalizeTimeline(
      dto.timeline,
      dto.start_time,
      dto.end_time,
    );

    const conflictsSummary: string[] = [];
    for (const occurrenceDate of occurrenceDates) {
      const occurrenceStart = this.buildTimeOnDate(
        occurrenceDate,
        dto.start_time,
      );
      const occurrenceEnd = this.buildTimeOnDate(occurrenceDate, dto.end_time);

      const eventConflicts = await this.findConflicts(
        dto.locaux_id,
        occurrenceDate,
        occurrenceStart,
        occurrenceEnd,
      );

      const dateStr = occurrenceDate.toISOString().split('T')[0];
      const startStr = occurrenceStart.toTimeString().split(' ')[0];
      const endStr = occurrenceEnd.toTimeString().split(' ')[0];
      const reservationFree = await this.reservationsService.checkAvailability(
        dto.locaux_id,
        dateStr,
        startStr,
        endStr,
      );

      if (eventConflicts.length > 0 || !reservationFree) {
        conflictsSummary.push(dateStr);
      }
    }

    if (conflictsSummary.length > 0) {
      throw new BadRequestException(
        `Conflit de planning sur les dates: ${conflictsSummary.join(', ')}`,
      );
    }

    const createdEvents = await this.prisma.$transaction(async (tx) => {
      const created: any[] = [];

      for (const occurrenceDate of occurrenceDates) {
        const occurrenceStart = this.buildTimeOnDate(
          occurrenceDate,
          dto.start_time,
        );
        const occurrenceEnd = this.buildTimeOnDate(
          occurrenceDate,
          dto.end_time,
        );

        const ev = await tx.events.create({
          data: {
            nom: dto.nom,
            description: dto.description,
            date_event: occurrenceDate,
            start_time: occurrenceStart,
            end_time: occurrenceEnd,
            capacity: dto.capacity,
            timeline:
              timeline === undefined
                ? undefined
                : (timeline as Prisma.InputJsonValue),
            club_id: primaryClub?.id,
            collaborating_club_ids: resolvedCollaborators,
            locaux_id: dto.locaux_id,
            created_by: userId,
          },
          include: {
            club: { select: { id: true, nom: true, id_centre: true } },
            local: { select: { id: true, nom: true, id_centre: true } },
          },
        });

        created.push(ev);
      }

      // Create reservations for the event occurrences
      const local = await tx.locaux.findUnique({
        where: { id: dto.locaux_id },
        select: { prix_heure: true },
      });

      const reservationsToCreate = occurrenceDates.map((occurrenceDate) => {
        const occurrenceStart = this.buildTimeOnDate(
          occurrenceDate,
          dto.start_time,
        );
        const occurrenceEnd = this.buildTimeOnDate(
          occurrenceDate,
          dto.end_time,
        );

        const durationHours =
          (occurrenceEnd.getTime() - occurrenceStart.getTime()) /
          (1000 * 60 * 60);

        const prixTotal = local?.prix_heure
          ? Number(local.prix_heure) * durationHours
          : 0;

        return {
          date_reservation: occurrenceDate,
          heure_debut: occurrenceStart,
          heure_fin: occurrenceEnd,
          objet: `Réservation pour événement: ${dto.nom}`,
          id_utilisateur: userId,
          id_local: dto.locaux_id,
          prix_total: prixTotal,
          statut: 'VALIDEE',
        } as any;
      });

      if (reservationsToCreate.length > 0) {
        const insert = await tx.reservations_locaux.createMany({
          data: reservationsToCreate,
        });

        if (!insert.count) {
          throw new BadRequestException(
            "Aucune réservation n'a pu être créée pour cet événement.",
          );
        }
      }

      return created;
    });

    return {
      createdCount: createdEvents.length,
      events: createdEvents,
    };
  }

  async findAll(userId: string, includeInactive = false) {
    const requester = await this.resolveRequester(userId);
    const where = await this.buildVisibilityWhere(requester, includeInactive);

    return this.prisma.events.findMany({
      where,
      include: {
        club: { select: { id: true, nom: true, categorie: true } },
        local: { select: { id: true, nom: true, type: true } },
        _count: { select: { participants: true } },
      },
      orderBy: [{ date_event: 'asc' }, { start_time: 'asc' }],
    });
  }

  async getDashboardStats(userId: string, includeInactive = false) {
    const requester = await this.resolveRequester(userId);
    const where = await this.buildVisibilityWhere(requester, includeInactive);

    const events = await this.prisma.events.findMany({
      where,
      select: {
        id: true,
        nom: true,
        date_event: true,
        capacity: true,
        club: {
          select: {
            id: true,
            nom: true,
          },
        },
        participants: {
          select: {
            status: true,
            user: {
              select: {
                id: true,
                nom: true,
                prenom: true,
              },
            },
          },
        },
      },
    });

    const totalEvents = events.length;
    let participantsCount = 0;
    let totalConfirmed = 0;
    let totalCapacity = 0;
    let eventsWithParticipants = 0;

    const clubStatsMap = new Map<
      string,
      {
        clubId: string;
        clubNom: string;
        participants: number;
        confirmed: number;
        waiting: number;
        evenements: number;
      }
    >();

    const userStatsMap = new Map<
      string,
      {
        userId: string;
        nom: string;
        participations: number;
        confirmees: number;
        enAttente: number;
      }
    >();

    const frequencyMap = new Map<string, number>();

    const popularEvents = events
      .map((event) => {
        const periodDate = new Date(event.date_event);
        const periodKey = `${String(periodDate.getMonth() + 1).padStart(2, '0')}/${periodDate.getFullYear()}`;
        frequencyMap.set(periodKey, (frequencyMap.get(periodKey) ?? 0) + 1);

        const confirmed = event.participants.filter(
          (participant) => participant.status === 'CONFIRME',
        ).length;
        const waiting = event.participants.filter(
          (participant) => participant.status === 'EN_ATTENTE',
        ).length;

        const participants = confirmed + waiting;
        const capacity =
          typeof event.capacity === 'number' ? event.capacity : 0;
        const fillRate =
          capacity > 0 ? Number(((confirmed / capacity) * 100).toFixed(1)) : 0;

        participantsCount += participants;
        totalConfirmed += confirmed;

        if (capacity > 0) {
          totalCapacity += capacity;
        }

        if (participants > 0) {
          eventsWithParticipants += 1;
        }

        if (event.club) {
          const existingClubStat = clubStatsMap.get(event.club.id) ?? {
            clubId: event.club.id,
            clubNom: event.club.nom,
            participants: 0,
            confirmed: 0,
            waiting: 0,
            evenements: 0,
          };

          existingClubStat.participants += participants;
          existingClubStat.confirmed += confirmed;
          existingClubStat.waiting += waiting;
          existingClubStat.evenements += 1;
          clubStatsMap.set(event.club.id, existingClubStat);
        }

        for (const participant of event.participants) {
          if (
            participant.status !== 'CONFIRME' &&
            participant.status !== 'EN_ATTENTE'
          ) {
            continue;
          }

          const fullName =
            `${participant.user.prenom} ${participant.user.nom}`.trim();
          const existingUserStat = userStatsMap.get(participant.user.id) ?? {
            userId: participant.user.id,
            nom: fullName || 'Utilisateur',
            participations: 0,
            confirmees: 0,
            enAttente: 0,
          };

          existingUserStat.participations += 1;
          if (participant.status === 'CONFIRME') {
            existingUserStat.confirmees += 1;
          }
          if (participant.status === 'EN_ATTENTE') {
            existingUserStat.enAttente += 1;
          }
          userStatsMap.set(participant.user.id, existingUserStat);
        }

        return {
          id: event.id,
          nom: event.nom,
          participants,
          confirmed,
          waiting,
          capacity,
          fillRate,
        };
      })
      .sort((a, b) => b.participants - a.participants)
      .slice(0, 5);

    const participationParClub = Array.from(clubStatsMap.values())
      .sort((a, b) => b.participants - a.participants)
      .slice(0, 8);

    const participationParUtilisateur = Array.from(userStatsMap.values())
      .sort((a, b) => b.participations - a.participations)
      .slice(0, 10);

    const frequenceEvenements = Array.from(frequencyMap.entries())
      .map(([periode, evenements]) => ({ periode, evenements }))
      .sort((a, b) => {
        const [monthA, yearA] = a.periode
          .split('/')
          .map((value) => Number(value));
        const [monthB, yearB] = b.periode
          .split('/')
          .map((value) => Number(value));
        if (yearA !== yearB) return yearA - yearB;
        return monthA - monthB;
      });

    const tauxParticipation =
      totalEvents > 0
        ? Number(((eventsWithParticipants / totalEvents) * 100).toFixed(1))
        : 0;

    const tauxRemplissage =
      totalCapacity > 0
        ? Number(((totalConfirmed / totalCapacity) * 100).toFixed(1))
        : 0;

    return {
      nombreEvenements: totalEvents,
      nombreParticipants: participantsCount,
      tauxParticipation,
      tauxRemplissage,
      evenementsPopulaires: popularEvents,
      participationParClub,
      participationParUtilisateur,
      frequenceEvenements,
    };
  }

  async findMyParticipations(userId: string, includeInactive = true) {
    await this.resolveRequester(userId);

    const events = await this.prisma.events.findMany({
      where: {
        ...(includeInactive ? {} : { is_active: true }),
        OR: [
          {
            participants: {
              some: {
                user_id: userId,
                status: { not: 'ANNULE' },
              },
            },
          },
          {
            club: {
              inscriptions: {
                some: {
                  id_utilisateur: userId,
                  statut: 'ACCEPTE',
                  est_suspendu: false,
                },
              },
            },
          },
        ],
      },
      include: {
        club: { select: { id: true, nom: true, categorie: true } },
        local: { select: { id: true, nom: true, type: true } },
        _count: { select: { participants: true } },
        participants: {
          where: { user_id: userId },
          select: { status: true, checkin: true },
          take: 1,
        },
      },
      orderBy: [{ date_event: 'asc' }, { start_time: 'asc' }],
    });

    return events.map((event) => {
      const myParticipation = event.participants[0];
      return {
        ...event,
        participants: undefined,
        my_participation_status: myParticipation?.status ?? null,
        my_participation_checkin: myParticipation?.checkin ?? false,
      };
    });
  }

  async findOne(userId: string, eventId: string) {
    const requester = await this.resolveRequester(userId);

    const event = await this.prisma.events.findUnique({
      where: { id: eventId },
      include: {
        club: {
          select: {
            id: true,
            nom: true,
            categorie: true,
            id_coach: true,
            id_centre: true,
          },
        },
        local: { select: { id: true, nom: true, type: true, id_centre: true } },
        createur: { select: { id: true, nom: true, prenom: true, role: true } },
        participants: {
          include: {
            user: {
              select: {
                id: true,
                nom: true,
                prenom: true,
                email: true,
                role: true,
              },
            },
          },
          orderBy: { created_at: 'desc' },
        },
      },
    });

    if (!event) {
      throw new NotFoundException('Evenement introuvable');
    }

    const myParticipation =
      requester.role === 'ADMIN'
        ? null
        : await this.prisma.event_participants.findUnique({
            where: {
              event_id_user_id: {
                event_id: eventId,
                user_id: requester.id,
              },
            },
            select: { status: true },
          });

    const myAcceptedClubMembership =
      requester.role === 'ADMIN'
        ? null
        : event.club
          ? await this.prisma.inscriptions_clubs.findFirst({
              where: {
                id_utilisateur: requester.id,
                id_club: event.club.id,
                statut: 'ACCEPTE',
                est_suspendu: false,
              },
              select: { id: true },
            })
          : null;

    if (requester.role === 'RESPONSABLE_CENTRE') {
      if (
        !requester.id_centre ||
        requester.id_centre !== event.local.id_centre
      ) {
        throw new ForbiddenException('Evenement hors de votre centre');
      }
    } else if (requester.role === 'RESPONSABLE_CLUB') {
      const managedClubIds = await this.getManagedClubIds(requester.id);
      const relatedClubIds = [
        event.club?.id,
        ...(Array.isArray(event.collaborating_club_ids)
          ? event.collaborating_club_ids
          : []),
      ].filter(Boolean) as string[];
      const isManagerOfClub = relatedClubIds.some((clubId) =>
        managedClubIds.includes(clubId),
      );
      const isAcceptedMemberOfClub = Boolean(myAcceptedClubMembership);
      const isEventParticipant =
        myParticipation?.status !== undefined &&
        myParticipation.status !== 'ANNULE';

      if (!isManagerOfClub && !isAcceptedMemberOfClub && !isEventParticipant) {
        throw new ForbiddenException('Evenement hors de vos clubs');
      }
    } else if (
      requester.role !== 'ADMIN' &&
      !event.is_active &&
      (!myParticipation || myParticipation.status === 'ANNULE')
    ) {
      throw new ForbiddenException('Evenement inactif non accessible');
    }

    const feedbackSummary = await this.buildFeedbackSummary(
      eventId,
      requester.id,
    );

    return {
      ...event,
      ratingAverage: feedbackSummary.ratingAverage,
      ratingCount: feedbackSummary.ratingCount,
      myFeedback: feedbackSummary.myFeedback,
      canRate: feedbackSummary.canRate,
      recentFeedbacks: feedbackSummary.recentFeedbacks,
    };
  }

  async getEventFeedback(eventId: string, userId: string) {
    const event = await this.prisma.events.findUnique({
      where: { id: eventId },
      select: { id: true },
    });

    if (!event) {
      throw new NotFoundException('Evenement introuvable');
    }

    await this.findOne(userId, eventId);
    return this.buildFeedbackSummary(eventId, userId);
  }

  async submitEventFeedback(
    eventId: string,
    userId: string,
    dto: CreateEventFeedbackDto,
  ) {
    const event = await this.prisma.events.findUnique({
      where: { id: eventId },
      select: { id: true, start_time: true },
    });

    if (!event) {
      throw new NotFoundException('Evenement introuvable');
    }

    const participation = await this.prisma.event_participants.findUnique({
      where: {
        event_id_user_id: {
          event_id: eventId,
          user_id: userId,
        },
      },
      select: { status: true },
    });

    if (
      !participation ||
      (participation.status !== 'CONFIRME' && participation.status !== 'ANNULE')
    ) {
      throw new ForbiddenException(
        'Seuls les membres ayant participe peuvent noter cet evenement',
      );
    }

    if (new Date(event.start_time).getTime() > Date.now()) {
      throw new BadRequestException(
        'La notation est disponible a partir du debut de l evenement',
      );
    }

    const note = Number(dto.note);
    if (!Number.isInteger(note) || note < 1 || note > 5) {
      throw new BadRequestException('La note doit etre comprise entre 1 et 5');
    }

    const commentaire = dto.commentaire?.trim() || null;
    if (commentaire && commentaire.length > 500) {
      throw new BadRequestException(
        'Le commentaire ne doit pas depasser 500 caracteres',
      );
    }

    const feedback = await this.prisma.eventFeedbacks.upsert({
      where: {
        event_id_user_id: {
          event_id: eventId,
          user_id: userId,
        },
      },
      update: {
        note,
        commentaire,
      },
      create: {
        event_id: eventId,
        user_id: userId,
        note,
        commentaire,
      },
      include: {
        user: {
          select: {
            id: true,
            nom: true,
            prenom: true,
          },
        },
      },
    });

    const summary = await this.buildFeedbackSummary(eventId, userId);

    return {
      feedback,
      ratingAverage: summary.ratingAverage,
      ratingCount: summary.ratingCount,
    };
  }

  async update(userId: string, eventId: string, dto: UpdateEventDto) {
    const requester = await this.resolveRequester(userId);

    const existing = await this.prisma.events.findUnique({
      where: { id: eventId },
      include: {
        club: { select: { id: true, id_coach: true, id_centre: true } },
        local: { select: { id: true, id_centre: true } },
        createur: { select: { id: true, nom: true, prenom: true } },
      },
    });

    if (!existing) {
      throw new NotFoundException('Evenement introuvable');
    }

    this.assertCanManageEvent(
      requester,
      existing.local.id_centre,
      existing.club
        ? {
            id_coach: existing.club.id_coach,
            id_centre: existing.club.id_centre,
          }
        : null,
    );

    const nextClubSelection = this.normalizeClubSelection(
      Object.prototype.hasOwnProperty.call(dto, 'club_id')
        ? dto.club_id
        : existing.club_id,
      Object.prototype.hasOwnProperty.call(dto, 'club_ids')
        ? dto.club_ids
        : Array.isArray(existing.collaborating_club_ids)
          ? existing.collaborating_club_ids
          : [],
    );
    const nextLocalId = dto.locaux_id ?? existing.locaux_id;
    const nextLocal = await this.resolveLocal(nextLocalId);
    const {
      primaryClub: nextPrimaryClub,
      collaboratingClubIds: nextCollaboratingClubIds,
    } = await this.resolveClubsForEvent(
      nextLocal.id_centre,
      nextClubSelection.primaryClubId,
      nextClubSelection.collaboratingClubIds,
      requester.id,
      requester.role,
    );

    this.assertCanManageEvent(
      requester,
      nextLocal.id_centre,
      nextPrimaryClub
        ? {
            id_coach: nextPrimaryClub.id_coach,
            id_centre: nextPrimaryClub.id_centre,
          }
        : null,
    );

    const dateEvent =
      dto.date_event ?? existing.date_event.toISOString().split('T')[0];
    const startTime =
      dto.start_time ??
      existing.start_time.toISOString().split('T')[1].slice(0, 8);
    const endTime =
      dto.end_time ?? existing.end_time.toISOString().split('T')[1].slice(0, 8);

    const { eventDate, startDateTime, endDateTime } = this.buildDateTimes(
      dateEvent,
      startTime,
      endTime,
    );

    const timeline = this.normalizeTimeline(dto.timeline, startTime, endTime);

    const conflicts = await this.findConflicts(
      nextLocalId,
      eventDate,
      startDateTime,
      endDateTime,
      eventId,
    );

    if (conflicts.length > 0) {
      throw new BadRequestException(
        'Conflit de planning: le local est deja reserve sur ce creneau',
      );
    }

    const updatedEvent = await this.prisma.events.update({
      where: { id: eventId },
      data: {
        nom: dto.nom ?? existing.nom,
        description: dto.description ?? existing.description,
        date_event: eventDate,
        start_time: startDateTime,
        end_time: endDateTime,
        capacity: dto.capacity ?? existing.capacity,
        ...(timeline !== undefined
          ? { timeline: timeline as Prisma.InputJsonValue }
          : {}),
        club_id: nextPrimaryClub?.id,
        collaborating_club_ids: nextCollaboratingClubIds,
        locaux_id: nextLocalId,
      },
      include: {
        club: { select: { id: true, nom: true, id_centre: true } },
        local: { select: { id: true, nom: true, id_centre: true } },
        createur: { select: { id: true, nom: true, prenom: true } },
        _count: { select: { participants: true } },
      },
    });

    const changes: string[] = [];
    if ((dto.nom ?? existing.nom) !== existing.nom) changes.push('le nom');
    if ((dto.description ?? existing.description) !== existing.description)
      changes.push('la description');
    if (dateEvent !== existing.date_event.toISOString().split('T')[0])
      changes.push('la date');
    if (
      startTime !== existing.start_time.toISOString().split('T')[1].slice(0, 8)
    )
      changes.push('l heure de debut');
    if (endTime !== existing.end_time.toISOString().split('T')[1].slice(0, 8))
      changes.push('l heure de fin');
    if ((dto.capacity ?? existing.capacity) !== existing.capacity)
      changes.push('la capacite');
    if (nextLocalId !== existing.locaux_id) changes.push('le local');
    if ((nextPrimaryClub?.id ?? null) !== existing.club_id)
      changes.push('le club principal');
    if (
      JSON.stringify(nextCollaboratingClubIds) !==
      JSON.stringify(
        Array.isArray(existing.collaborating_club_ids)
          ? existing.collaborating_club_ids
          : [],
      )
    ) {
      changes.push('les clubs collaborateurs');
    }

    if (changes.length > 0) {
      const participantsToNotify =
        await this.prisma.event_participants.findMany({
          where: {
            event_id: eventId,
            status: { in: ['CONFIRME', 'EN_ATTENTE'] },
          },
          select: {
            user_id: true,
          },
        });

      await this.prisma.notifications.deleteMany({
        where: {
          id_utilisateur: {
            in: participantsToNotify.map((participant) => participant.user_id),
          },
          type: {
            in: ['EVENT_UPDATED', 'EVENT_REMINDER'],
          },
          data: {
            path: ['eventId'],
            equals: eventId,
          },
        },
      });

      for (const participant of participantsToNotify) {
        try {
          await this.notificationsService.createEventUpdateNotification({
            utilisateurId: participant.user_id,
            eventId: updatedEvent.id,
            eventNom: updatedEvent.nom,
            clubId: updatedEvent.club?.id,
            clubNom: updatedEvent.club?.nom,
            localNom: updatedEvent.local.nom,
            dateEvent: updatedEvent.date_event,
            startTime: updatedEvent.start_time,
            endTime: updatedEvent.end_time,
            dateEventText: dateEvent,
            startTimeText: startTime.slice(0, 5),
            endTimeText: endTime.slice(0, 5),
            changes,
            responsableId: requester.id,
          });
        } catch (error) {
          console.error(
            'Erreur creation notification modification evenement :',
            error,
          );
        }
      }
    }

    return updatedEvent;
  }

  async setActive(userId: string, eventId: string, isActive: boolean) {
    const requester = await this.resolveRequester(userId);

    const existing = await this.prisma.events.findUnique({
      where: { id: eventId },
      include: {
        club: { select: { id_coach: true, id_centre: true } },
        local: { select: { id_centre: true } },
      },
    });

    if (!existing) {
      throw new NotFoundException('Evenement introuvable');
    }

    this.assertCanManageEvent(requester, existing.local.id_centre, {
      id_coach: existing.club?.id_coach ?? null,
      id_centre: existing.club?.id_centre ?? existing.local.id_centre,
    });

    return this.prisma.events.update({
      where: { id: eventId },
      data: { is_active: isActive },
      include: {
        club: { select: { id: true, nom: true } },
        local: { select: { id: true, nom: true } },
      },
    });
  }

  async cancelEvent(userId: string, eventId: string) {
    const requester = await this.resolveRequester(userId);

    const existing = await this.prisma.events.findUnique({
      where: { id: eventId },
      include: {
        club: {
          select: { id: true, nom: true, id_coach: true, id_centre: true },
        },
        local: { select: { id: true, nom: true, id_centre: true } },
      },
    });

    if (!existing) {
      throw new NotFoundException('Evenement introuvable');
    }

    this.assertCanManageEvent(requester, existing.local.id_centre, {
      id_coach: existing.club?.id_coach ?? null,
      id_centre: existing.club?.id_centre ?? existing.local.id_centre,
    });

    if (!existing.is_active) {
      throw new BadRequestException('Evenement deja annule ou inactif');
    }

    const participantsToNotify = await this.prisma.event_participants.findMany({
      where: {
        event_id: eventId,
        status: { in: ['CONFIRME', 'EN_ATTENTE'] },
      },
      select: { user_id: true },
    });

    const updatedEvent = await this.prisma.events.update({
      where: { id: eventId },
      data: { is_active: false },
      include: {
        club: { select: { id: true, nom: true } },
        local: { select: { id: true, nom: true } },
        _count: { select: { participants: true } },
      },
    });

    await this.prisma.notifications.deleteMany({
      where: {
        id_utilisateur: {
          in: participantsToNotify.map((participant) => participant.user_id),
        },
        type: { in: ['EVENT_UPDATED', 'EVENT_REMINDER'] },
        data: {
          path: ['eventId'],
          equals: eventId,
        },
      },
    });

    for (const participant of participantsToNotify) {
      try {
        await this.notificationsService.createEventCancellationNotification({
          utilisateurId: participant.user_id,
          eventId: existing.id,
          eventNom: existing.nom,
          clubId: existing.club?.id,
          clubNom: existing.club?.nom,
          localNom: existing.local.nom,
          dateEvent: existing.date_event,
          startTime: existing.start_time,
          endTime: existing.end_time,
          responsableId: requester.id,
        });
      } catch (error) {
        console.error(
          'Erreur creation notification annulation evenement :',
          error,
        );
      }
    }

    return updatedEvent;
  }

  async checkLocalAvailability(
    localId: string,
    date: string,
    start: string,
    end: string,
    excludeEventId?: string,
  ) {
    if (!localId || !date || !start || !end) {
      throw new BadRequestException(
        'id_local, date, start et end sont obligatoires',
      );
    }

    const { eventDate, startDateTime, endDateTime } = this.buildDateTimes(
      date,
      start,
      end,
    );

    const conflicts = await this.findConflicts(
      localId,
      eventDate,
      startDateTime,
      endDateTime,
      excludeEventId,
    );

    const reservationsFree = await this.reservationsService.checkAvailability(
      localId,
      date,
      start,
      end,
    );

    return {
      available: conflicts.length === 0 && reservationsFree,
      conflicts,
      durationMinutes: Math.floor(
        (endDateTime.getTime() - startDateTime.getTime()) / 60000,
      ),
    };
  }

  async registerToEvent(eventId: string, userId: string) {
    const event = await this.prisma.events.findUnique({
      where: { id: eventId },
      include: {
        club: { select: { id: true, nom: true, est_actif: true } },
      },
    });

    if (!event) {
      throw new NotFoundException('Evenement introuvable');
    }

    if (!event.is_active) {
      throw new BadRequestException('Evenement inactif');
    }

    const user = await this.resolveRequester(userId);
    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    const existing = await this.prisma.event_participants.findUnique({
      where: {
        event_id_user_id: {
          event_id: eventId,
          user_id: userId,
        },
      },
    });

    const nextStatus = 'EN_ATTENTE';

    if (existing) {
      if (existing.status === 'CONFIRME' || existing.status === 'EN_ATTENTE') {
        throw new BadRequestException('Vous etes deja inscrit a cet evenement');
      }

      return this.prisma.event_participants.update({
        where: { id: existing.id },
        data: { status: nextStatus, checkin: false },
        include: {
          user: {
            select: {
              id: true,
              nom: true,
              prenom: true,
              email: true,
              role: true,
            },
          },
        },
      });
    }

    return this.prisma.event_participants.create({
      data: {
        event_id: eventId,
        user_id: userId,
        status: nextStatus,
      },
      include: {
        user: {
          select: {
            id: true,
            nom: true,
            prenom: true,
            email: true,
            role: true,
          },
        },
      },
    });
  }

  async cancelMyRegistration(eventId: string, userId: string) {
    const participant = await this.prisma.event_participants.findUnique({
      where: {
        event_id_user_id: {
          event_id: eventId,
          user_id: userId,
        },
      },
    });

    if (!participant) {
      throw new NotFoundException('Inscription introuvable');
    }

    const updated = await this.prisma.event_participants.update({
      where: { id: participant.id },
      data: { status: 'ANNULE', checkin: false },
    });

    await this.promoteWaitlistIfPossible(eventId);
    return updated;
  }

  async listParticipants(eventId: string, requesterId: string) {
    const requester = await this.resolveRequester(requesterId);
    const event = await this.resolveEventForManagement(eventId);

    if (
      requester.role === 'RESPONSABLE_CENTRE' &&
      requester.id_centre !== event.local.id_centre
    ) {
      throw new ForbiddenException('Evenement hors de votre centre');
    }

    if (
      requester.role === 'RESPONSABLE_CLUB' &&
      event.club?.id_coach !== requester.id
    ) {
      throw new ForbiddenException('Evenement hors de vos clubs');
    }

    const participants = await this.prisma.event_participants.findMany({
      where: { event_id: eventId },
      include: {
        user: {
          select: {
            id: true,
            nom: true,
            prenom: true,
            email: true,
            role: true,
          },
        },
      },
      orderBy: [{ status: 'asc' }, { created_at: 'asc' }],
    });

    return {
      eventId,
      confirmed: participants.filter((p) => p.status === 'CONFIRME'),
      waitingList: participants.filter((p) => p.status === 'EN_ATTENTE'),
      refused: participants.filter((p) => p.status === 'REFUSE'),
      cancelled: participants.filter((p) => p.status === 'ANNULE'),
      all: participants,
    };
  }

  async updateParticipantStatus(
    eventId: string,
    participantId: string,
    status: string,
    requesterId: string,
  ) {
    const normalized = (status ?? '').toUpperCase();
    if (!this.participantStatuses.includes(normalized as any)) {
      throw new BadRequestException(
        'status doit etre EN_ATTENTE, CONFIRME, REFUSE ou ANNULE',
      );
    }

    const requester = await this.resolveRequester(requesterId);
    const event = await this.resolveEventForManagement(eventId);
    this.assertCanManageEvent(requester, event.local.id_centre, {
      id_coach: event.club?.id_coach ?? null,
      id_centre: event.club?.id_centre ?? event.local.id_centre,
    });

    const participant = await this.prisma.event_participants.findFirst({
      where: { id: participantId, event_id: eventId },
    });

    if (!participant) {
      throw new NotFoundException('Participant introuvable pour cet evenement');
    }

    if (normalized === 'CONFIRME' && typeof event.capacity === 'number') {
      const confirmedCount = await this.countConfirmedParticipants(
        eventId,
        participant.id,
      );
      if (confirmedCount >= event.capacity) {
        throw new BadRequestException(
          'Evenement complet, confirmation impossible',
        );
      }
    }

    const updated = await this.prisma.event_participants.update({
      where: { id: participant.id },
      data: {
        status: normalized,
        checkin: normalized === 'CONFIRME' ? participant.checkin : false,
      },
      include: {
        user: {
          select: {
            id: true,
            nom: true,
            prenom: true,
            email: true,
            role: true,
          },
        },
      },
    });

    if (normalized === 'ANNULE' || normalized === 'REFUSE') {
      await this.promoteWaitlistIfPossible(eventId);
    }

    if (normalized === 'CONFIRME' || normalized === 'REFUSE') {
      try {
        await this.notificationsService.createEventParticipationDecisionNotification(
          {
            utilisateurId: participant.user_id,
            eventId: event.id,
            eventNom: event.nom,
            clubId: event.club_id,
            clubNom: event.club?.nom,
            dateEvent: event.date_event,
            startTime: event.start_time,
            endTime: event.end_time,
            statut: normalized,
            responsableId: requesterId,
          },
        );
      } catch (error) {
        console.error(
          'Erreur creation notification participation evenement :',
          error,
        );
      }
    }

    return updated;
  }

  async setParticipantCheckin(
    eventId: string,
    participantId: string,
    checkin: boolean,
    requesterId: string,
  ) {
    const requester = await this.resolveRequester(requesterId);
    const event = await this.resolveEventForManagement(eventId);
    this.assertCanManageEvent(requester, event.local.id_centre, {
      id_coach: event.club?.id_coach ?? null,
      id_centre: event.club?.id_centre ?? event.local.id_centre,
    });

    const participant = await this.prisma.event_participants.findFirst({
      where: { id: participantId, event_id: eventId },
    });
    if (!participant) {
      throw new NotFoundException('Participant introuvable pour cet evenement');
    }

    if (participant.status !== 'CONFIRME' && checkin) {
      throw new BadRequestException(
        'Seuls les participants confirmes peuvent etre check-in',
      );
    }

    // Verify event is ongoing when marking as present
    if (checkin) {
      const now = new Date();
      const startTime = new Date(event.start_time);
      const endTime = new Date(event.end_time);

      if (now < startTime) {
        throw new BadRequestException(
          `L'événement commence le ${startTime.toLocaleString('fr-FR')}. Vous ne pouvez pas marquer la présence maintenant.`,
        );
      }

      if (now > endTime) {
        throw new BadRequestException(
          `L'événement s'est terminé le ${endTime.toLocaleString('fr-FR')}. Vous ne pouvez plus marquer la présence.`,
        );
      }
    }

    // Award points only once for the first successful check-in on this event.
    if (checkin) {
      const awarded = await this.prisma.$transaction(async (tx) => {
        const updatedRows = await tx.$queryRaw<Array<{ user_id: string }>>(
          Prisma.sql`
            UPDATE event_participants
            SET checkin = true,
                points_awarded = true,
                updated_at = NOW()
            WHERE id = ${participant.id}::uuid
              AND event_id = ${eventId}::uuid
              AND status = 'CONFIRME'
              AND points_awarded = false
            RETURNING user_id
          `,
        );

        if (updatedRows.length === 0) {
          return null;
        }

        const awardedUserId = updatedRows[0].user_id;
        await tx.$executeRaw(
          Prisma.sql`
            UPDATE utilisateurs
            SET points = COALESCE(points, 0) + ${this.pointsPerParticipation}
            WHERE id = ${awardedUserId}::uuid
          `,
        );

        const updatedParticipant = await tx.event_participants.findUnique({
          where: { id: participant.id },
          include: {
            user: {
              select: {
                id: true,
                nom: true,
                prenom: true,
                email: true,
                role: true,
              },
            },
          },
        });

        return {
          awardedUserId,
          updatedParticipant,
        };
      });

      if (awarded?.awardedUserId) {
        try {
          await this.notificationsService.createPointsEarnedNotification({
            utilisateurId: awarded.awardedUserId,
            eventId,
            eventNom: event.nom,
            points: this.pointsPerParticipation,
          });
        } catch (error) {
          console.error(
            'Erreur creation notification points evenement :',
            error,
          );
        }
      }

      if (awarded?.updatedParticipant) {
        return awarded.updatedParticipant;
      }
    }

    return this.prisma.event_participants.update({
      where: { id: participant.id },
      data: { checkin },
      include: {
        user: {
          select: {
            id: true,
            nom: true,
            prenom: true,
            email: true,
            role: true,
          },
        },
      },
    });
  }

  async selfCheckin(eventId: string, userId: string) {
    const event = await this.prisma.events.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        nom: true,
        start_time: true,
        end_time: true,
        is_active: true,
      },
    });

    if (!event) {
      throw new NotFoundException('Evenement introuvable');
    }

    if (!event.is_active) {
      throw new BadRequestException('Evenement inactif');
    }

    const now = new Date();
    if (now < event.start_time) {
      throw new BadRequestException(
        "L'evenement n'a pas encore commencé. Vous pourrez vous marquer present lors du deroulement de l'event.",
      );
    }

    if (now > event.end_time) {
      throw new BadRequestException(
        "L'evenement est terminé. Vous ne pouvez plus vous marquer present.",
      );
    }

    const participant = await this.prisma.event_participants.findFirst({
      where: { event_id: eventId, user_id: userId },
    });

    if (!participant) {
      throw new NotFoundException("Vous n'etes pas inscrit a cet evenement");
    }

    if (participant.status !== 'CONFIRME') {
      throw new BadRequestException(
        'Seuls les participants confirmes peuvent se marquer presents',
      );
    }

    if (participant.checkin) {
      throw new BadRequestException('Vous etes deja marque present');
    }

    // Award points only once for self check-in
    const awarded = await this.prisma.$transaction(async (tx) => {
      const updatedRows = await tx.$queryRaw<Array<{ user_id: string }>>(
        Prisma.sql`
          UPDATE event_participants
          SET checkin = true,
              points_awarded = true,
              updated_at = NOW()
          WHERE id = ${participant.id}::uuid
            AND event_id = ${eventId}::uuid
            AND status = 'CONFIRME'
            AND points_awarded = false
          RETURNING user_id
        `,
      );

      if (updatedRows.length === 0) {
        return null;
      }

      const awardedUserId = updatedRows[0].user_id;
      await tx.$executeRaw(
        Prisma.sql`
          UPDATE utilisateurs
          SET points = COALESCE(points, 0) + ${this.pointsPerParticipation}
          WHERE id = ${awardedUserId}::uuid
        `,
      );

      const updatedParticipant = await tx.event_participants.findUnique({
        where: { id: participant.id },
        include: {
          user: {
            select: {
              id: true,
              nom: true,
              prenom: true,
              email: true,
              role: true,
            },
          },
        },
      });

      return {
        awardedUserId,
        updatedParticipant,
      };
    });

    if (awarded?.awardedUserId) {
      try {
        await this.notificationsService.createPointsEarnedNotification({
          utilisateurId: awarded.awardedUserId,
          eventId,
          eventNom: event.nom,
          points: this.pointsPerParticipation,
        });
      } catch (error) {
        console.error(
          'Erreur creation notification points self-checkin :',
          error,
        );
      }
    }

    if (awarded?.updatedParticipant) {
      return awarded.updatedParticipant;
    }

    return this.prisma.event_participants.findUnique({
      where: { id: participant.id },
      include: {
        user: {
          select: {
            id: true,
            nom: true,
            prenom: true,
            email: true,
            role: true,
          },
        },
      },
    });
  }

  private async promoteWaitlistIfPossible(eventId: string) {
    const event = await this.prisma.events.findUnique({
      where: { id: eventId },
      select: { id: true, capacity: true },
    });
    if (!event || typeof event.capacity !== 'number') return;

    const confirmedCount = await this.countConfirmedParticipants(eventId);
    const remaining = event.capacity - confirmedCount;
    if (remaining <= 0) return;

    const waiting = await this.prisma.event_participants.findMany({
      where: { event_id: eventId, status: 'EN_ATTENTE' },
      orderBy: { created_at: 'asc' },
      take: remaining,
      select: { id: true },
    });

    if (waiting.length === 0) return;

    await this.prisma.event_participants.updateMany({
      where: { id: { in: waiting.map((p) => p.id) } },
      data: { status: 'CONFIRME' },
    });
  }
}
