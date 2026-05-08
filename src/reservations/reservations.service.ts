import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { NotificationsService } from 'src/notifications/notifications.service';
import { CreateReservationDto } from './dto/create-reservation.dto';

@Injectable()
export class ReservationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  private async resolveUserOrFail(userId: string) {
    const user = await this.prisma.utilisateurs.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });

    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    return user;
  }

  private ensureTimeRange(startDateTime: Date, endDateTime: Date) {
    if (endDateTime <= startDateTime) {
      throw new BadRequestException(
        'heure_fin doit etre strictement superieure a heure_debut',
      );
    }
  }

  private async buildReservationScopeWhere(
    userId: string,
    role?: string,
  ): Promise<Prisma.reservations_locauxWhereInput> {
    if (role === 'ADMIN') {
      return {};
    }

    if (role === 'RESPONSABLE_CENTRE') {
      const requester = await this.prisma.utilisateurs.findUnique({
        where: { id: userId },
        select: { id_centre: true },
      });

      if (!requester?.id_centre) {
        return { id: { in: [] } };
      }

      return {
        local: {
          id_centre: requester.id_centre,
        },
      };
    }

    if (role === 'RESPONSABLE_CLUB') {
      const clubs = await this.prisma.clubs.findMany({
        where: { id_coach: userId, est_actif: true },
        select: { id_centre: true },
      });

      const centreIds = [...new Set(clubs.map((c) => c.id_centre))].filter(
        Boolean,
      );

      if (centreIds.length === 0) {
        return { id: { in: [] } };
      }

      return {
        local: {
          id_centre: { in: centreIds },
        },
      };
    }

    return { id_utilisateur: userId };
  }

  private async assertResponsableCanReserveLocal(
    userId: string,
    localId: string,
  ): Promise<void> {
    const managedClub = await this.prisma.clubs.findFirst({
      where: {
        id_coach: userId,
        est_actif: true,
        centre: {
          locaux: {
            some: {
              id: localId,
            },
          },
        },
      },
      select: { id: true },
    });

    if (!managedClub) {
      throw new ForbiddenException(
        'Vous ne pouvez reserver que les locaux du centre de vos clubs',
      );
    }
  }

  /**
   * 🛡️ ALGORITHME ANTI-CONFLIT
   * Vérifie si un local est disponible pour une date et un créneau donné.
   * excludeId permet d'ignorer une réservation spécifique (utile pour la modification).
   */
  async checkAvailability(
    localId: string,
    date: string,
    start: string,
    end: string,
    excludeId?: string,
  ): Promise<boolean> {
    const dateRes = new Date(date);
    const debut = new Date(`${date}T${start}`);
    const fin = new Date(`${date}T${end}`);

    const conflict = await this.prisma.reservations_locaux.findFirst({
      where: {
        id_local: localId,
        statut: { in: ['EN_ATTENTE', 'VALIDEE'] },
        date_reservation: dateRes,
        // 💡 Si on modifie, on ne se compare pas à soi-même
        id: excludeId ? { not: excludeId } : undefined,
        OR: [
          {
            // La nouvelle commence pendant une existante
            heure_debut: { lte: debut },
            heure_fin: { gt: debut },
          },
          {
            // La nouvelle finit pendant une existante
            heure_debut: { lt: fin },
            heure_fin: { gte: fin },
          },
          {
            // La nouvelle englobe totalement une existante
            heure_debut: { gte: debut },
            heure_fin: { lte: fin },
          },
        ],
      },
    });

    return !conflict;
  }

  /**
   * 📝 CRÉER UNE RÉSERVATION
   */
  async create(userId: string, dto: CreateReservationDto) {
    const user = await this.resolveUserOrFail(userId);

    if (user.role === 'RESPONSABLE_CLUB') {
      await this.assertResponsableCanReserveLocal(userId, dto.id_local);
    }

    const isAvailable = await this.checkAvailability(
      dto.id_local,
      dto.date_reservation,
      dto.heure_debut,
      dto.heure_fin,
    );

    if (!isAvailable) {
      throw new ConflictException(
        'Ce créneau horaire est déjà réservé ou en attente de validation.',
      );
    }

    const local = await this.prisma.locaux.findUnique({
      where: { id: dto.id_local },
    });

    if (!local) throw new NotFoundException("Le local spécifié n'existe pas.");

    const hDebut = new Date(`${dto.date_reservation}T${dto.heure_debut}`);
    const hFin = new Date(`${dto.date_reservation}T${dto.heure_fin}`);
    this.ensureTimeRange(hDebut, hFin);

    // Calcul du prix
    const dureeHeures = (hFin.getTime() - hDebut.getTime()) / (1000 * 60 * 60);
    const prixTotal = local.prix_heure
      ? Number(local.prix_heure) * dureeHeures
      : 0;

    return await this.prisma.reservations_locaux.create({
      data: {
        date_reservation: new Date(dto.date_reservation),
        heure_debut: hDebut,
        heure_fin: hFin,
        objet: dto.objet,
        id_utilisateur: userId,
        id_local: dto.id_local,
        prix_total: prixTotal,
        statut: 'EN_ATTENTE',
      },
    });
  }

  /**
   * 📋 LISTER LES RÉSERVATIONS
   */
  async findAll(userId?: string, role?: string) {
    if (!userId) {
      return [];
    }

    const where = await this.buildReservationScopeWhere(userId, role);

    return await this.prisma.reservations_locaux.findMany({
      where,
      include: {
        utilisateur: { select: { nom: true, prenom: true, email: true } },
        local: { include: { centre: true } },
        payments: {
          select: {
            id: true,
            status: true,
            amount: true,
            created_at: true,
          },
          orderBy: { created_at: 'desc' },
        },
      },
      orderBy: { date_creation: 'desc' },
    });
  }

  /**
   * ✅ VALIDER / REFUSER (Admin)
   */
  async updateStatus(
    id: string,
    statut: string,
    requesterId: string,
    requesterRole: string,
  ) {
    const resToUpdate = await this.prisma.reservations_locaux.findUnique({
      where: { id },
      include: {
        local: { select: { id: true, nom: true } },
      },
    });

    if (!resToUpdate) throw new NotFoundException('Réservation introuvable');

    const normalizedStatus = (statut ?? '').toUpperCase();
    if (
      !['EN_ATTENTE', 'VALIDEE', 'REFUSEE', 'ANNULEE'].includes(
        normalizedStatus,
      )
    ) {
      throw new BadRequestException(
        'statut doit etre EN_ATTENTE, VALIDEE, REFUSEE ou ANNULEE',
      );
    }

    await this.resolveUserOrFail(requesterId);

    if (normalizedStatus === 'ANNULEE') {
      const isOwner = resToUpdate.id_utilisateur === requesterId;
      if (!isOwner && requesterRole !== 'ADMIN') {
        throw new ForbiddenException(
          'Vous ne pouvez annuler que vos propres reservations',
        );
      }
    } else if (requesterRole !== 'ADMIN' && requesterRole !== 'RESPONSABLE_CENTRE') {
      throw new ForbiddenException('Seul l admin ou le responsable de centre peuvent modifier le statut');
    }

    if (normalizedStatus === 'VALIDEE') {
      // On convertit les Date de la BDD en string pour l'algo de check
      const dateStr = resToUpdate.date_reservation.toISOString().split('T')[0];
      const startStr = resToUpdate.heure_debut.toTimeString().split(' ')[0];
      const endStr = resToUpdate.heure_fin.toTimeString().split(' ')[0];

      const isAvailable = await this.checkAvailability(
        resToUpdate.id_local,
        dateStr,
        startStr,
        endStr,
        id, // Exclure soi-même
      );

      if (!isAvailable) {
        throw new ConflictException(
          'Action impossible : Ce créneau est désormais occupé par une autre validation.',
        );
      }
    }

    const updated = await this.prisma.reservations_locaux.update({
      where: { id },
      data: { statut: normalizedStatus },
    });

    if (normalizedStatus === 'VALIDEE' || normalizedStatus === 'REFUSEE') {
      try {
        await this.notificationsService.createReservationDecisionNotification({
          utilisateurId: updated.id_utilisateur,
          reservationId: updated.id,
          localId: updated.id_local,
          localNom: resToUpdate.local?.nom ?? 'local',
          dateReservation: updated.date_reservation,
          heureDebut: updated.heure_debut,
          heureFin: updated.heure_fin,
          statut: normalizedStatus,
          adminId: requesterId,
        });
      } catch (err) {
        console.error('Erreur creation notification reservation :', err);
      }
    }

    return updated;
  }

  /**
   * 📅 VOIR LES OCCUPATIONS (Pour le front)
   */
  async getOccupiedSlots(localId: string, date: string) {
    return await this.prisma.reservations_locaux.findMany({
      where: {
        id_local: localId,
        date_reservation: new Date(date),
        statut: 'VALIDEE',
      },
      select: { heure_debut: true, heure_fin: true, objet: true },
      orderBy: { heure_debut: 'asc' },
    });
  }

  /**
   * 📅 PLANNING D'UN LOCAL
   * Retourne uniquement les réservations validées pour afficher le calendrier.
   */
  async getLocalPlanning(localId: string) {
    return await this.prisma.reservations_locaux.findMany({
      where: {
        id_local: localId,
        statut: 'VALIDEE',
      },
      include: {
        utilisateur: {
          select: { nom: true, prenom: true, email: true },
        },
        local: {
          select: {
            id: true,
            nom: true,
            type: true,
            prix_heure: true,
            centre: {
              select: { id: true, nom: true },
            },
          },
        },
      },
      orderBy: [{ date_reservation: 'asc' }, { heure_debut: 'asc' }],
    });
  }

  async getReservationStatsOverview(userId: string, role?: string) {
    const baseWhere = await this.buildReservationScopeWhere(userId, role);

    const [allReservations, validReservations, scopedLocauxCount] =
      await Promise.all([
        this.prisma.reservations_locaux.findMany({
          where: {
            ...baseWhere,
            statut: { not: 'ANNULEE' },
          },
          select: {
            id: true,
            statut: true,
            prix_total: true,
            date_reservation: true,
            heure_debut: true,
            heure_fin: true,
            id_local: true,
            local: { select: { nom: true } },
          },
        }),
        this.prisma.reservations_locaux.findMany({
          where: {
            ...baseWhere,
            statut: 'VALIDEE',
          },
          select: {
            id: true,
            prix_total: true,
            date_reservation: true,
            heure_debut: true,
            heure_fin: true,
            id_local: true,
            local: { select: { nom: true } },
          },
        }),
        this.prisma.locaux.count({
          where:
            role === 'ADMIN'
              ? {}
              : role === 'RESPONSABLE_CENTRE'
                ? {
                    centre: {
                      utilisateurs: {
                        some: { id: userId },
                      },
                    },
                  }
                : role === 'RESPONSABLE_CLUB'
                  ? {
                      centre: {
                        clubs: {
                          some: {
                            id_coach: userId,
                            est_actif: true,
                          },
                        },
                      },
                    }
                  : {
                      reservations: {
                        some: { id_utilisateur: userId },
                      },
                    },
        }),
      ]);

    const reservationCount = allReservations.length;

    const revenueTotal = validReservations.reduce((sum, reservation) => {
      const amount = reservation.prix_total
        ? Number(reservation.prix_total)
        : 0;
      return sum + amount;
    }, 0);

    const usedRoomsMap = new Map<string, { roomName: string; count: number }>();
    for (const reservation of validReservations) {
      const key = reservation.id_local;
      const roomName = reservation.local?.nom ?? 'Local inconnu';
      const current = usedRoomsMap.get(key);
      usedRoomsMap.set(key, {
        roomName,
        count: (current?.count ?? 0) + 1,
      });
    }

    const mostUsedRoom = [...usedRoomsMap.values()].sort(
      (a, b) => b.count - a.count,
    )[0] ?? { roomName: 'Aucune salle', count: 0 };

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const monthEnd = new Date(
      monthStart.getFullYear(),
      monthStart.getMonth() + 1,
      0,
    );
    monthEnd.setHours(23, 59, 59, 999);

    const monthlyValidReservations = validReservations.filter((r) => {
      const date = new Date(r.date_reservation);
      return date >= monthStart && date <= monthEnd;
    });

    const occupiedHours = monthlyValidReservations.reduce(
      (sum, reservation) => {
        const durationMs =
          reservation.heure_fin.getTime() - reservation.heure_debut.getTime();
        return sum + durationMs / (1000 * 60 * 60);
      },
      0,
    );

    const daysInMonth = monthEnd.getDate();
    const dailyOpenHours = 14;
    const availableHours = Math.max(
      1,
      scopedLocauxCount * daysInMonth * dailyOpenHours,
    );
    const occupancyRate = Number(
      Math.min(100, (occupiedHours / availableHours) * 100).toFixed(2),
    );

    return {
      reservationCount,
      mostUsedRoom,
      occupancyRate,
      revenueTotal: Number(revenueTotal.toFixed(2)),
      monthContext: {
        month: monthStart.getMonth() + 1,
        year: monthStart.getFullYear(),
        localsCount: scopedLocauxCount,
      },
    };
  }

  /**
   * 🔄 MODIFIER UNE RÉSERVATION (User)
   */
  async update(userId: string, id: string, dto: CreateReservationDto) {
    const existing = await this.prisma.reservations_locaux.findUnique({
      where: { id },
      select: { id: true, id_utilisateur: true, statut: true },
    });

    if (!existing) {
      throw new NotFoundException('Reservation introuvable');
    }

    const user = await this.resolveUserOrFail(userId);
    const isOwner = existing.id_utilisateur === userId;
    if (!isOwner && user.role !== 'ADMIN') {
      throw new ForbiddenException(
        'Vous ne pouvez modifier que vos propres reservations',
      );
    }

    if (user.role === 'RESPONSABLE_CLUB') {
      await this.assertResponsableCanReserveLocal(userId, dto.id_local);
    }

    const isAvailable = await this.checkAvailability(
      dto.id_local,
      dto.date_reservation,
      dto.heure_debut,
      dto.heure_fin,
      id, // 💡 Important pour ne pas bloquer sa propre modification
    );

    if (!isAvailable) {
      throw new ConflictException('Ce nouveau créneau est déjà occupé.');
    }

    const local = await this.prisma.locaux.findUnique({
      where: { id: dto.id_local },
    });
    if (!local) throw new NotFoundException('Local introuvable');

    const hDebut = new Date(`${dto.date_reservation}T${dto.heure_debut}`);
    const hFin = new Date(`${dto.date_reservation}T${dto.heure_fin}`);
    this.ensureTimeRange(hDebut, hFin);

    // Recalcul du prix en cas de changement d'heures
    const dureeHeures = (hFin.getTime() - hDebut.getTime()) / (1000 * 60 * 60);
    const prixTotal = local.prix_heure
      ? Number(local.prix_heure) * dureeHeures
      : 0;

    return await this.prisma.reservations_locaux.update({
      where: { id },
      data: {
        date_reservation: new Date(dto.date_reservation),
        heure_debut: hDebut,
        heure_fin: hFin,
        objet: dto.objet,
        prix_total: prixTotal,
        statut: 'EN_ATTENTE', // Repasse en attente pour re-validation admin
      },
    });
  }

  /**
   * ❌ ANNULER (User)
   */
  async cancel(userId: string, id: string) {
    const existing = await this.prisma.reservations_locaux.findUnique({
      where: { id },
      select: { id: true, id_utilisateur: true },
    });

    if (!existing) {
      throw new NotFoundException('Reservation introuvable');
    }

    const user = await this.resolveUserOrFail(userId);
    const isOwner = existing.id_utilisateur === userId;
    if (!isOwner && user.role !== 'ADMIN') {
      throw new ForbiddenException(
        'Vous ne pouvez annuler que vos propres reservations',
      );
    }

    return await this.prisma.reservations_locaux.update({
      where: { id },
      data: { statut: 'ANNULEE' },
    });
  }
}
