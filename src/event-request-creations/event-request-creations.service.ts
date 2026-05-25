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

  private buildDateOnly(date: string) {
    const [y, m, d] = date.split('-').map((v) => Number(v));
    // Use UTC noon so the stored calendar day survives any timezone
    // conversion when the Date is serialized back to JSON.
    return new Date(Date.UTC(y, (m || 1) - 1, d || 1, 12, 0, 0));
  }

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

  private normalizeClubSelection(clubId?: string, clubIds?: string[]) {
    const primaryClubId = clubId || clubIds?.[0] || null;
    const collaborators = Array.isArray(clubIds)
      ? clubIds.filter((value) => value && value !== primaryClubId)
      : [];

    return { primaryClubId, collaborators };
  }

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
