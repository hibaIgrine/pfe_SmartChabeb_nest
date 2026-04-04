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

    return this.prisma.events.create({
      data: {
        nom: dto.nom,
        description: dto.description,
        date_event: eventDate,
        start_time: startDateTime,
        end_time: endDateTime,
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

    if (requester.role === 'RESPONSABLE_CENTRE') {
      if (
        !requester.id_centre ||
        requester.id_centre !== event.local.id_centre
      ) {
        throw new ForbiddenException('Evenement hors de votre centre');
      }
    } else if (requester.role === 'RESPONSABLE_CLUB') {
      if (event.club.id_coach !== requester.id) {
        throw new ForbiddenException('Evenement hors de vos clubs');
      }
    } else if (requester.role !== 'ADMIN' && !event.is_active) {
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
}
