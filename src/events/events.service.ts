import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, utilisateurs } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

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

  private assertCanManageEvent(
    requester: Pick<utilisateurs, 'id' | 'role' | 'id_centre'>,
    localCentreId: string,
    club: { id_coach: string | null; id_centre: string },
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
      return {
        ...(includeInactive ? {} : { is_active: true }),
        club: { id_coach: requester.id },
      };
    }

    return { is_active: true };
  }

  async create(userId: string, dto: CreateEventDto) {
    const requester = await this.resolveRequester(userId);
    const { local, club } = await this.resolveLocalAndClub(
      dto.locaux_id,
      dto.club_id,
    );
    this.assertCanManageEvent(requester, local.id_centre, {
      id_coach: club.id_coach,
      id_centre: club.id_centre,
    });

    const { eventDate, startDateTime, endDateTime } = this.buildDateTimes(
      dto.date_event,
      dto.start_time,
      dto.end_time,
    );

    const occurrenceDates = this.buildOccurrenceDates(
      eventDate,
      dto.recurrence_type,
      dto.recurrence_count,
      dto.recurrence_until,
    );

    const conflictsSummary: string[] = [];
    for (const occurrenceDate of occurrenceDates) {
      const occurrenceStart = this.buildTimeOnDate(
        occurrenceDate,
        dto.start_time,
      );
      const occurrenceEnd = this.buildTimeOnDate(occurrenceDate, dto.end_time);
      const conflicts = await this.findConflicts(
        dto.locaux_id,
        occurrenceDate,
        occurrenceStart,
        occurrenceEnd,
      );

      if (conflicts.length > 0) {
        conflictsSummary.push(occurrenceDate.toISOString().split('T')[0]);
      }
    }

    if (conflictsSummary.length > 0) {
      throw new BadRequestException(
        `Conflit de planning sur les dates: ${conflictsSummary.join(', ')}`,
      );
    }

    const createdEvents = await this.prisma.$transaction(
      occurrenceDates.map((occurrenceDate) => {
        const occurrenceStart = this.buildTimeOnDate(
          occurrenceDate,
          dto.start_time,
        );
        const occurrenceEnd = this.buildTimeOnDate(
          occurrenceDate,
          dto.end_time,
        );

        return this.prisma.events.create({
          data: {
            nom: dto.nom,
            description: dto.description,
            date_event: occurrenceDate,
            start_time: occurrenceStart,
            end_time: occurrenceEnd,
            capacity: dto.capacity,
            club_id: dto.club_id,
            locaux_id: dto.locaux_id,
            created_by: userId,
          },
          include: {
            club: { select: { id: true, nom: true, id_centre: true } },
            local: { select: { id: true, nom: true, id_centre: true } },
          },
        });
      }),
    );

    return {
      createdCount: createdEvents.length,
      recurrenceType: dto.recurrence_type ?? 'NONE',
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
        : await this.prisma.inscriptions_clubs.findFirst({
            where: {
              id_utilisateur: requester.id,
              id_club: event.club.id,
              statut: 'ACCEPTE',
              est_suspendu: false,
            },
            select: { id: true },
          });

    if (requester.role === 'RESPONSABLE_CENTRE') {
      if (
        !requester.id_centre ||
        requester.id_centre !== event.local.id_centre
      ) {
        throw new ForbiddenException('Evenement hors de votre centre');
      }
    } else if (requester.role === 'RESPONSABLE_CLUB') {
      const isManagerOfClub = event.club.id_coach === requester.id;
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

    return event;
  }

  async update(userId: string, eventId: string, dto: UpdateEventDto) {
    const requester = await this.resolveRequester(userId);

    const existing = await this.prisma.events.findUnique({
      where: { id: eventId },
      include: {
        club: { select: { id: true, id_coach: true, id_centre: true } },
        local: { select: { id: true, id_centre: true } },
      },
    });

    if (!existing) {
      throw new NotFoundException('Evenement introuvable');
    }

    this.assertCanManageEvent(requester, existing.local.id_centre, {
      id_coach: existing.club.id_coach,
      id_centre: existing.club.id_centre,
    });

    const nextClubId = dto.club_id ?? existing.club_id;
    const nextLocalId = dto.locaux_id ?? existing.locaux_id;
    const { local, club } = await this.resolveLocalAndClub(
      nextLocalId,
      nextClubId,
    );

    this.assertCanManageEvent(requester, local.id_centre, {
      id_coach: club.id_coach,
      id_centre: club.id_centre,
    });

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

    return this.prisma.events.update({
      where: { id: eventId },
      data: {
        nom: dto.nom ?? existing.nom,
        description: dto.description ?? existing.description,
        date_event: eventDate,
        start_time: startDateTime,
        end_time: endDateTime,
        capacity: dto.capacity ?? existing.capacity,
        club_id: nextClubId,
        locaux_id: nextLocalId,
      },
      include: {
        club: { select: { id: true, nom: true } },
        local: { select: { id: true, nom: true } },
        _count: { select: { participants: true } },
      },
    });
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
      id_coach: existing.club.id_coach,
      id_centre: existing.club.id_centre,
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

    return {
      available: conflicts.length === 0,
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
      event.club.id_coach !== requester.id
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
      id_coach: event.club.id_coach,
      id_centre: event.club.id_centre,
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
      id_coach: event.club.id_coach,
      id_centre: event.club.id_centre,
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
