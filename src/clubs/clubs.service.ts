import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { NotificationsService } from 'src/notifications/notifications.service';
import { ReservationsService } from 'src/reservations/reservations.service';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class ClubsService {
  private readonly weekdayIndexes: Record<string, number> = {
    SUNDAY: 0,
    MONDAY: 1,
    TUESDAY: 2,
    WEDNESDAY: 3,
    THURSDAY: 4,
    FRIDAY: 5,
    SATURDAY: 6,
    Dimanche: 0,
    Lundi: 1,
    Mardi: 2,
    Mercredi: 3,
    Jeudi: 4,
    Vendredi: 5,
    Samedi: 6,
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly reservationsService: ReservationsService,
  ) {}

  private normalizePlanningObject(planning: any): Record<string, any> {
    if (!planning) return {};

    if (typeof planning === 'string') {
      try {
        const parsed = JSON.parse(planning);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed;
        }
        return { texte: planning };
      } catch {
        return { texte: planning };
      }
    }

    if (typeof planning === 'object' && !Array.isArray(planning)) {
      return planning;
    }

    return {};
  }

  private withStartWorkflow(
    planning: any,
    minimumParticipantsRaw?: any,
  ): Record<string, any> {
    const base = this.normalizePlanningObject(planning);
    const currentWorkflow =
      base.start_workflow && typeof base.start_workflow === 'object'
        ? base.start_workflow
        : {};

    const parsedMinimum = Number(minimumParticipantsRaw);
    const existingMinimum = Number(currentWorkflow.minimum_participants);

    const minimumParticipants =
      Number.isFinite(parsedMinimum) && parsedMinimum > 1
        ? Math.floor(parsedMinimum)
        : Number.isFinite(existingMinimum) && existingMinimum > 1
          ? Math.floor(existingMinimum)
          : 5;

    return {
      ...base,
      start_workflow: {
        minimum_participants: minimumParticipants,
        centre_validation_required: true,
        centre_validated: Boolean(currentWorkflow.centre_validated),
        is_started: Boolean(currentWorkflow.is_started),
        validated_by: currentWorkflow.validated_by ?? null,
        validated_at: currentWorkflow.validated_at ?? null,
      },
    };
  }

  private getNextWeekdayDate(dayLabel: string): Date {
    const targetIndex = this.weekdayIndexes[dayLabel];
    if (targetIndex === undefined) {
      throw new BadRequestException(`Jour invalide: ${dayLabel}`);
    }

    const nextDate = new Date();
    const currentIndex = nextDate.getDay();
    let daysUntilTarget = (targetIndex - currentIndex + 7) % 7;

    if (daysUntilTarget === 0) {
      daysUntilTarget = 7;
    }

    nextDate.setDate(nextDate.getDate() + daysUntilTarget);
    return nextDate;
  }

  private formatDateOnly(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  private generateWeeklyDates(startDate: Date, occurrences = 52): Date[] {
    const dates: Date[] = [];
    for (let i = 0; i < occurrences; i++) {
      const current = new Date(startDate);
      current.setDate(startDate.getDate() + i * 7);
      dates.push(current);
    }
    return dates;
  }

  private normalizePlanningSlots(planning: any) {
    const normalized = this.normalizePlanningObject(planning);
    const slots = Array.isArray(normalized.slots) ? normalized.slots : [];

    return slots
      .map((slot: any) => ({
        day: (slot?.day ?? '').toString().trim(),
        startTime: (slot?.startTime ?? '').toString().trim(),
        endTime: (slot?.endTime ?? '').toString().trim(),
      }))
      .filter((slot: { day: string; startTime: string; endTime: string }) =>
        Boolean(slot.day && slot.startTime && slot.endTime),
      );
  }

  private buildRecurringReservations(params: {
    planning: any;
    localId: string;
    clubName: string;
    userId: string;
    prixHeure?: number | null;
  }) {
    const slots = this.normalizePlanningSlots(params.planning);

    if (slots.length === 0) {
      return [];
    }

    return slots.flatMap((slot) => {
      const startDate = this.getNextWeekdayDate(slot.day);
      const dates = this.generateWeeklyDates(startDate, 52);
      const startHour =
        slot.startTime.length === 5 ? `${slot.startTime}:00` : slot.startTime;
      const endHour =
        slot.endTime.length === 5 ? `${slot.endTime}:00` : slot.endTime;
      const durationHours =
        (new Date(`1970-01-01T${endHour}`).getTime() -
          new Date(`1970-01-01T${startHour}`).getTime()) /
        (1000 * 60 * 60);
      const prixTotal = params.prixHeure ? params.prixHeure * durationHours : 0;

      return dates.map((dateItem) => {
        const dateStr = this.formatDateOnly(dateItem);
        return {
          date_reservation: new Date(dateStr),
          heure_debut: new Date(`${dateStr}T${startHour}`),
          heure_fin: new Date(`${dateStr}T${endHour}`),
          objet: `Créneau club validé: ${params.clubName}`,
          statut: 'VALIDEE',
          prix_total: prixTotal,
          id_local: params.localId,
          id_utilisateur: params.userId,
        };
      });
    });
  }

  private extractMinimumParticipants(club: { planning: any }): number {
    const planning = this.normalizePlanningObject(club.planning);
    const raw = Number((planning.start_workflow as any)?.minimum_participants);
    if (Number.isFinite(raw) && raw > 1) {
      return Math.floor(raw);
    }
    return 5;
  }

  private buildStartStatus(club: {
    planning: any;
    accepted_participants?: number;
  }) {
    const planning = this.normalizePlanningObject(club.planning);
    const workflow =
      planning.start_workflow && typeof planning.start_workflow === 'object'
        ? planning.start_workflow
        : {};

    const minimum = this.extractMinimumParticipants({ planning });
    const accepted = Number(club.accepted_participants ?? 0);
    const validated = Boolean(workflow.centre_validated);
    const started = Boolean(workflow.is_started);

    return {
      minimum_participants: minimum,
      accepted_participants: accepted,
      minimum_reached: accepted >= minimum,
      centre_validation_required: true,
      centre_validated: validated,
      is_started: started,
      ready_for_validation: accepted >= minimum && !validated,
      validated_by: workflow.validated_by ?? null,
      validated_at: workflow.validated_at ?? null,
    };
  }

  // ==========================================
  // UTILS : Gestion des Images
  // ==========================================
  private saveBase64Image(base64Data: string): string {
    if (!base64Data || !base64Data.startsWith('data:image')) return base64Data;

    try {
      const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (!matches || matches.length !== 3)
        throw new Error('Format Base64 invalide');

      const extension = matches[1].split('/')[1] || 'png';
      const imageBuffer = Buffer.from(matches[2], 'base64');
      const filename = `club-${Date.now()}-${Math.floor(Math.random() * 10000)}.${extension}`;

      const uploadDir = path.join(process.cwd(), 'uploads');
      if (!fs.existsSync(uploadDir))
        fs.mkdirSync(uploadDir, { recursive: true });

      const filePath = path.join(uploadDir, filename);
      fs.writeFileSync(filePath, imageBuffer);

      return `/uploads/${filename}`;
    } catch (err) {
      console.error('Erreur image Base64:', err);
      return '';
    }
  }

  // ==========================================
  // CRUD : Gestion des Clubs
  // ==========================================

  async create(data: any, requesterId?: string, requesterRole?: string) {
    return this.createWithAccessControl(data, requesterId, requesterRole);
  }

  async createWithAccessControl(
    data: any,
    requesterId?: string,
    requesterRole?: string,
  ) {
    let resolvedCentreId = data.id_centre;

    if (requesterRole === 'RESPONSABLE_CENTRE') {
      if (!requesterId) {
        throw new BadRequestException('Utilisateur responsable introuvable');
      }

      const requester = await this.prisma.utilisateurs.findUnique({
        where: { id: requesterId },
        select: { id_centre: true, role: true },
      });

      if (!requester || !requester.id_centre) {
        throw new BadRequestException(
          'Aucun centre associe au responsable courant',
        );
      }

      resolvedCentreId = requester.id_centre;
    }

    if (!resolvedCentreId) {
      throw new BadRequestException('id_centre est obligatoire');
    }

    const resolvedLocalId = data.id_local || data.id_local_souhaite || null;
    const finalLogoUrl = data.logo_url
      ? this.saveBase64Image(data.logo_url)
      : undefined;
    const finalPlanning = this.withStartWorkflow(
      data.planning,
      data.minimum_participants,
    );
    const recurringReservations = resolvedLocalId
      ? this.buildRecurringReservations({
          planning: finalPlanning,
          localId: resolvedLocalId,
          clubName: data.nom,
          userId: data.id_coach || requesterId || resolvedLocalId,
          prixHeure: null,
        })
      : [];

    return await this.prisma.$transaction(async (tx) => {
      const nouveauClub = await tx.clubs.create({
        data: {
          nom: data.nom,
          description: data.description,
          categorie: data.categorie,
          id_centre: resolvedCentreId,
          id_coach: data.id_coach || undefined,
          planning: finalPlanning,
          logo_url: finalLogoUrl,
          capacite: data.capacite ? parseInt(data.capacite) : null,
          locale_fixe: data.locale_fixe ?? data.locale ?? null,
        },
      });

      if (recurringReservations.length > 0) {
        const local = await tx.locaux.findUnique({
          where: { id: resolvedLocalId },
          select: { prix_heure: true, id_centre: true },
        });

        if (!local) {
          throw new BadRequestException('Local introuvable pour le club.');
        }

        if (local.id_centre !== resolvedCentreId) {
          throw new BadRequestException(
            'Le local selectionne ne correspond pas au centre du club.',
          );
        }

        const reservationsToCreate = recurringReservations.map(
          (reservation) => {
            const durationHours =
              (reservation.heure_fin.getTime() -
                reservation.heure_debut.getTime()) /
              (1000 * 60 * 60);
            const prixTotal = local.prix_heure
              ? Number(local.prix_heure) * durationHours
              : 0;

            return {
              ...reservation,
              prix_total: prixTotal,
            };
          },
        );

        const availabilityChecks = await Promise.all(
          reservationsToCreate.map((reservation) => {
            const dateStr = reservation.date_reservation
              .toISOString()
              .split('T')[0];
            const startTime = reservation.heure_debut
              .toTimeString()
              .split(' ')[0];
            const endTime = reservation.heure_fin.toTimeString().split(' ')[0];

            return this.reservationsService.checkAvailability(
              resolvedLocalId,
              dateStr,
              startTime,
              endTime,
            );
          }),
        );

        if (availabilityChecks.some((available) => !available)) {
          throw new BadRequestException(
            'Le local choisi est indisponible pour un des créneaux du planning.',
          );
        }

        const planningInsert = await tx.reservations_locaux.createMany({
          data: reservationsToCreate,
        });

        if (!planningInsert.count) {
          throw new BadRequestException(
            "Aucune réservation n'a pu être créée pour ce club.",
          );
        }
      }

      if (data.staff && Array.isArray(data.staff)) {
        const staffData = await Promise.all(
          data.staff.map(async (s: any) => {
            const roleName = (s.role_dans_club ?? '').toString().trim();
            if (!roleName) {
              throw new BadRequestException('Rôle club requis pour le staff.');
            }

            const clubRole = await tx.club_roles.upsert({
              where: { nom: roleName.toUpperCase() },
              update: { description: undefined },
              create: {
                nom: roleName.toUpperCase(),
                description: `Rôle club ${roleName.toUpperCase()}`,
              },
            });

            return {
              id_club: nouveauClub.id,
              id_utilisateur: s.id_utilisateur,
              role_dans_club: roleName.toUpperCase(),
              id_club_role: clubRole.id,
            };
          }),
        );

        await tx.club_staff.createMany({
          data: staffData,
        });
      }
      return nouveauClub;
    });
  }

  async findAll(id_centre?: string) {
    const clubs = await this.prisma.clubs.findMany({
      where: id_centre ? { id_centre } : {}, // 💡 id_salle -> id_centre
      include: {
        responsable: { select: { nom: true, prenom: true } }, // 💡 coach -> responsable
        centre: { select: { nom: true, gouvernorat: true } }, // 💡 salles -> centre
        inscriptions: {
          include: {
            utilisateur: {
              select: {
                id: true,
                nom: true,
                prenom: true,
                email: true,
                photo_profil_url: true,
              },
            },
          },
          orderBy: { date_adhesion: 'desc' },
        },
        _count: {
          select: {
            inscriptions: {
              where: { statut: 'ACCEPTE' },
            },
          },
        },
      },
      orderBy: { nom: 'asc' },
    });

    return clubs.map((club) => ({
      ...club,
      start_status: this.buildStartStatus({
        planning: club.planning,
        accepted_participants: club._count.inscriptions,
      }),
    }));
  }

  async findClubsForUserCentre(userId: string) {
    const user = await this.prisma.utilisateurs.findUnique({
      where: { id: userId },
      select: {
        id_centre: true,
        centre: {
          select: {
            id: true,
            nom: true,
            gouvernorat: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    if (!user.id_centre) {
      return { centre: null, clubs: [] };
    }

    const clubs = await this.prisma.clubs.findMany({
      where: {
        id_centre: user.id_centre,
        est_actif: true,
      },
      include: {
        centre: {
          select: {
            id: true,
            nom: true,
            gouvernorat: true,
          },
        },
        responsable: {
          select: {
            id: true,
            nom: true,
            prenom: true,
            photo_profil_url: true,
          },
        },
        staff: {
          where: { is_active: true },
          include: {
            utilisateur: {
              select: {
                id: true,
                nom: true,
                prenom: true,
                photo_profil_url: true,
              },
            },
          },
        },
        inscriptions: {
          where: { id_utilisateur: userId },
          select: {
            id: true,
            statut: true,
            date_adhesion: true,
            est_suspendu: true,
          },
        },
        _count: {
          select: {
            inscriptions: {
              where: { statut: 'ACCEPTE' },
            },
          },
        },
      },
      orderBy: { nom: 'asc' },
    });

    return {
      centre: user.centre,
      clubs: clubs.map((club) => ({
        ...club,
        my_inscription: club.inscriptions[0] ?? null,
        start_status: this.buildStartStatus({
          planning: club.planning,
          accepted_participants: club._count.inscriptions,
        }),
      })),
    };
  }

  async findClubForUserCentre(userId: string, clubId: string) {
    if (!clubId || !/^[0-9a-fA-F-]{36}$/.test(clubId)) {
      throw new BadRequestException('Identifiant de club invalide');
    }

    const user = await this.prisma.utilisateurs.findUnique({
      where: { id: userId },
      select: {
        id_centre: true,
        centre: {
          select: {
            id: true,
            nom: true,
            gouvernorat: true,
            adresse: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    if (!user.id_centre) {
      throw new BadRequestException('Aucun centre associe a votre compte');
    }

    const club = await this.prisma.clubs.findFirst({
      where: {
        id: clubId,
        id_centre: user.id_centre,
        est_actif: true,
      },
      include: {
        centre: {
          select: {
            id: true,
            nom: true,
            gouvernorat: true,
            adresse: true,
          },
        },
        responsable: {
          select: {
            id: true,
            nom: true,
            prenom: true,
            photo_profil_url: true,
          },
        },
        staff: {
          where: { is_active: true },
          include: {
            utilisateur: {
              select: {
                id: true,
                nom: true,
                prenom: true,
                role: true,
                photo_profil_url: true,
              },
            },
          },
        },
        inscriptions: {
          where: { id_utilisateur: userId },
          select: {
            id: true,
            statut: true,
            date_adhesion: true,
            est_suspendu: true,
          },
        },
        _count: {
          select: {
            inscriptions: {
              where: { statut: 'ACCEPTE' },
            },
          },
        },
      },
    });

    if (!club) {
      throw new NotFoundException('Club introuvable dans votre centre');
    }

    return {
      centre: user.centre,
      club: {
        ...club,
        my_inscription: club.inscriptions[0] ?? null,
        start_status: this.buildStartStatus({
          planning: club.planning,
          accepted_participants: club._count.inscriptions,
        }),
      },
    };
  }

  async findOne(id: string) {
    if (!id || !/^[0-9a-fA-F-]{36}$/.test(id)) {
      throw new BadRequestException('Identifiant de club invalide');
    }

    const club = await this.prisma.clubs.findUnique({
      where: { id },
      include: {
        centre: { select: { id: true, nom: true } },
        responsable: { select: { id: true, nom: true, prenom: true } },
      },
    });

    if (!club) throw new NotFoundException('Club introuvable');

    const [staffRows, inscriptionRows] = await Promise.all([
      this.prisma.club_staff.findMany({ where: { id_club: id } }),
      this.prisma.inscriptions_clubs.findMany({
        where: { id_club: id },
        orderBy: { date_adhesion: 'desc' },
      }),
    ]);

    const userIds = Array.from(
      new Set([
        ...staffRows.map((s) => s.id_utilisateur),
        ...inscriptionRows.map((i) => i.id_utilisateur),
      ]),
    );

    const users = userIds.length
      ? await this.prisma.utilisateurs.findMany({
          where: { id: { in: userIds } },
          select: {
            id: true,
            nom: true,
            prenom: true,
            email: true,
            photo_profil_url: true,
          },
        })
      : [];

    const usersMap = new Map(users.map((user) => [user.id, user]));

    const clubRoleIds = Array.from(
      new Set(
        staffRows
          .map((item) => item.id_club_role)
          .filter((roleId): roleId is string => Boolean(roleId)),
      ),
    );

    const clubRoles = clubRoleIds.length
      ? await this.prisma.club_roles.findMany({
          where: { id: { in: clubRoleIds } },
          select: { id: true, nom: true, description: true },
        })
      : [];

    const clubRolesMap = new Map(clubRoles.map((role) => [role.id, role]));

    const staff = staffRows
      .map((item) => ({
        ...item,
        utilisateur: usersMap.get(item.id_utilisateur) ?? null,
        club_role: item.id_club_role
          ? (clubRolesMap.get(item.id_club_role) ?? null)
          : null,
      }))
      .filter((item) => item.utilisateur !== null);

    const inscriptions = inscriptionRows
      .map((item) => ({
        ...item,
        utilisateur: usersMap.get(item.id_utilisateur) ?? null,
      }))
      .filter((item) => item.utilisateur !== null);

    const acceptedParticipants = inscriptions.filter(
      (item) => item.statut === 'ACCEPTE',
    ).length;

    return {
      ...club,
      staff,
      inscriptions,
      start_status: this.buildStartStatus({
        planning: club.planning,
        accepted_participants: acceptedParticipants,
      }),
    };
  }

  async update(id: string, data: any) {
    let finalLogoUrl = data.logo_url;
    if (finalLogoUrl && finalLogoUrl.startsWith('data:image')) {
      finalLogoUrl = this.saveBase64Image(finalLogoUrl);
    }

    const current = await this.prisma.clubs.findUnique({
      where: { id },
      select: { planning: true },
    });

    let finalPlanning = this.withStartWorkflow(
      data.planning !== undefined ? data.planning : current?.planning,
      data.minimum_participants,
    );

    return await this.prisma.clubs.update({
      where: { id },
      data: {
        nom: data.nom,
        description: data.description,
        categorie: data.categorie,
        id_centre: data.id_centre, // 💡 id_salle -> id_centre
        id_coach: data.id_coach || undefined,
        logo_url: finalLogoUrl !== undefined ? finalLogoUrl : undefined,
        planning: finalPlanning !== undefined ? finalPlanning : undefined,
        capacite: data.capacite ? parseInt(data.capacite) : undefined,
        locale_fixe:
          data.locale_fixe !== undefined ? data.locale_fixe : undefined,
      },
    });
  }

  async validateClubStart(
    clubId: string,
    requesterId: string,
    requesterRole: string,
  ) {
    const club = await this.prisma.clubs.findUnique({
      where: { id: clubId },
      select: {
        id: true,
        nom: true,
        id_centre: true,
        planning: true,
      },
    });

    if (!club) {
      throw new NotFoundException('Club introuvable');
    }

    if (requesterRole !== 'ADMIN' && requesterRole !== 'RESPONSABLE_CENTRE') {
      throw new BadRequestException(
        'Validation réservée au responsable centre.',
      );
    }

    if (requesterRole === 'RESPONSABLE_CENTRE') {
      const requester = await this.prisma.utilisateurs.findUnique({
        where: { id: requesterId },
        select: { id_centre: true },
      });

      if (!requester?.id_centre || requester.id_centre !== club.id_centre) {
        throw new BadRequestException(
          'Vous ne pouvez valider que les clubs de votre centre.',
        );
      }
    }

    const acceptedParticipants = await this.prisma.inscriptions_clubs.count({
      where: {
        id_club: clubId,
        statut: 'ACCEPTE',
      },
    });

    const minimumParticipants = this.extractMinimumParticipants(club);

    if (acceptedParticipants < minimumParticipants) {
      throw new BadRequestException(
        `Le club doit atteindre au moins ${minimumParticipants} participants acceptés avant validation finale.`,
      );
    }

    const planning = this.withStartWorkflow(club.planning, minimumParticipants);
    const workflow =
      planning.start_workflow && typeof planning.start_workflow === 'object'
        ? planning.start_workflow
        : {};

    planning.start_workflow = {
      ...workflow,
      minimum_participants: minimumParticipants,
      centre_validation_required: true,
      centre_validated: true,
      is_started: true,
      validated_by: requesterId,
      validated_at: new Date().toISOString(),
    };

    const updated = await this.prisma.clubs.update({
      where: { id: clubId },
      data: {
        planning,
      },
      select: {
        id: true,
        nom: true,
        planning: true,
      },
    });

    return {
      ...updated,
      start_status: this.buildStartStatus({
        planning: updated.planning,
        accepted_participants: acceptedParticipants,
      }),
      message: 'Validation finale effectuée. Le club peut démarrer.',
    };
  }

  async addStaffToClub(
    clubId: string,
    data: { id_utilisateur: string; role_dans_club: string },
  ) {
    const club = await this.prisma.clubs.findUnique({ where: { id: clubId } });
    if (!club) throw new NotFoundException('Club introuvable');

    const roleName = (data.role_dans_club ?? '').toString().trim();
    if (!roleName) {
      throw new BadRequestException('Rôle club requis.');
    }

    const clubRole = await this.prisma.club_roles.upsert({
      where: { nom: roleName.toUpperCase() },
      update: { description: undefined },
      create: {
        nom: roleName.toUpperCase(),
        description: `Rôle club ${roleName.toUpperCase()}`,
      },
    });

    const existingStaff = await this.prisma.club_staff.findUnique({
      where: {
        id_club_id_utilisateur: {
          id_club: clubId,
          id_utilisateur: data.id_utilisateur,
        },
      },
    });

    if (existingStaff) {
      return await this.prisma.club_staff.update({
        where: { id: existingStaff.id },
        data: {
          role_dans_club: roleName.toUpperCase(),
          id_club_role: clubRole.id,
          is_active: true,
        },
      });
    }

    return await this.prisma.club_staff.create({
      data: {
        id_club: clubId,
        id_utilisateur: data.id_utilisateur,
        role_dans_club: roleName.toUpperCase(),
        id_club_role: clubRole.id,
        is_active: true,
      },
    });
  }

  async deactivateStaff(clubId: string, staffId: string) {
    const staff = await this.prisma.club_staff.findFirst({
      where: { id: staffId, id_club: clubId },
    });

    if (!staff) {
      throw new NotFoundException('Staff introuvable pour ce club.');
    }

    return await this.prisma.club_staff.update({
      where: { id: staff.id },
      data: { is_active: false } as any,
    });
  }

  async reactivateStaff(clubId: string, staffId: string) {
    const staff = await this.prisma.club_staff.findFirst({
      where: { id: staffId, id_club: clubId },
    });

    if (!staff) {
      throw new NotFoundException('Staff introuvable pour ce club.');
    }

    return await this.prisma.club_staff.update({
      where: { id: staff.id },
      data: { is_active: true } as any,
    });
  }

  async remove(id: string) {
    const club = await this.prisma.clubs.findUnique({ where: { id } });
    if (!club) throw new NotFoundException('Club introuvable');
    return await this.prisma.clubs.update({
      where: { id },
      data: { est_actif: false },
    });
  }

  async activate(id: string) {
    const club = await this.prisma.clubs.findUnique({ where: { id } });
    if (!club) throw new NotFoundException('Club introuvable');
    return await this.prisma.clubs.update({
      where: { id },
      data: { est_actif: true },
    });
  }

  // ==========================================
  // LOGIQUE : Inscriptions & File d'attente
  // ==========================================

  async applyToClub(userId: string, clubId: string) {
    return await this.prisma.$transaction(async (tx) => {
      const club = await tx.clubs.findUnique({
        where: { id: clubId },
        select: {
          id_centre: true,
          capacite: true,
          _count: {
            select: { inscriptions: { where: { statut: 'ACCEPTE' } } },
          },
        },
      });

      if (!club) throw new NotFoundException('Club introuvable');

      const user = await tx.utilisateurs.findUnique({
        where: { id: userId },
        select: { id_centre: true },
      });

      if (!user?.id_centre || user.id_centre !== club.id_centre) {
        throw new BadRequestException(
          'Vous ne pouvez rejoindre que les clubs de votre centre.',
        );
      }

      const existingRequest = await tx.inscriptions_clubs.findUnique({
        where: {
          id_utilisateur_id_club: { id_utilisateur: userId, id_club: clubId },
        },
      });

      const isFull =
        club.capacite !== null && club._count.inscriptions >= club.capacite;
      const targetStatus = isFull ? 'LISTE_ATTENTE' : 'EN_ATTENTE';

      if (existingRequest) {
        if (existingRequest.statut === 'REFUSE') {
          return await tx.inscriptions_clubs.update({
            where: { id: existingRequest.id },
            data: {
              statut: targetStatus,
              date_adhesion: new Date(),
              date_validation: null,
              responsable_id: null,
            },
          });
        }
        throw new ConflictException(
          'Une demande est déjà active pour ce club.',
        );
      }

      return await tx.inscriptions_clubs.create({
        data: { id_utilisateur: userId, id_club: clubId, statut: targetStatus },
      });
    });
  }

  async updateInscriptionStatus(
    inscriptionId: string,
    statut: string,
    responsableId: string,
  ) {
    const inscription = await this.prisma.inscriptions_clubs.findUnique({
      where: { id: inscriptionId },
      include: {
        club: {
          include: {
            _count: {
              select: { inscriptions: { where: { statut: 'ACCEPTE' } } },
            },
          },
        },
      },
    });

    if (!inscription) {
      throw new NotFoundException('Inscription introuvable.');
    }

    if (statut === 'ACCEPTE') {
      if (
        inscription.club.capacite &&
        inscription.club._count.inscriptions >= inscription.club.capacite
      ) {
        throw new ConflictException('Capacité maximale atteinte.');
      }
    }

    const updatedInscription = await this.prisma.inscriptions_clubs.update({
      where: { id: inscriptionId },
      data: {
        statut,
        date_validation: new Date(),
        responsable_id: responsableId,
      },
    });

    if (statut === 'ACCEPTE' || statut === 'REFUSE') {
      try {
        await this.notificationsService.createMembershipDecisionNotification({
          utilisateurId: inscription.id_utilisateur,
          clubId: inscription.id_club,
          clubNom: inscription.club.nom,
          inscriptionId: inscription.id,
          statut,
          responsableId,
        });
      } catch (err) {
        console.error('Erreur creation notification adhesion :', err);
      }
    }

    return updatedInscription;
  }

  async removeInscription(id: string) {
    return await this.prisma.$transaction(async (tx) => {
      const current = await tx.inscriptions_clubs.findUnique({ where: { id } });
      if (!current) throw new NotFoundException('Inscription introuvable');

      await tx.inscriptions_clubs.delete({ where: { id } });

      const next = await tx.inscriptions_clubs.findFirst({
        where: { id_club: current.id_club, statut: 'LISTE_ATTENTE' },
        orderBy: { date_adhesion: 'asc' },
      });

      if (next) {
        await tx.inscriptions_clubs.update({
          where: { id: next.id },
          data: { statut: 'EN_ATTENTE' },
        });
      }
      return { success: true };
    });
  }

  async leaveClub(userId: string, clubId: string) {
    const del = await this.prisma.inscriptions_clubs.deleteMany({
      where: { id_utilisateur: userId, id_club: clubId },
    });
    if (del.count === 0) throw new NotFoundException('Non inscrit.');
    return { message: 'Succès' };
  }

  async findMyClubs(userId: string) {
    return await this.prisma.inscriptions_clubs.findMany({
      where: { id_utilisateur: userId },
      include: {
        club: {
          select: {
            id: true,
            nom: true,
            logo_url: true,
            categorie: true,
            description: true,
            locale_fixe: true,
            planning: true,
          },
        },
      },
    });
  }

  // ==========================================
  // LOGIQUE : Staff & Suspension
  // ==========================================

  async suspendMember(id: string, data: { dateFin: string; motif: string }) {
    return await this.prisma.inscriptions_clubs.update({
      where: { id },
      data: {
        est_suspendu: true,
        date_fin_suspension: new Date(data.dateFin),
        motif_suspension: data.motif,
      },
    });
  }

  async reactivateMember(id: string) {
    return await this.prisma.inscriptions_clubs.update({
      where: { id },
      data: {
        est_suspendu: false,
        date_fin_suspension: null,
        motif_suspension: null,
      },
    });
  }

  async findStaffByCentre(id_centre: string) {
    return await this.prisma.utilisateurs.findMany({
      where: {
        id_centre,
        role: { in: ['COACH', 'ANIMATEUR', 'RESPONSABLE_CLUB'] },
      },
      select: { id: true, nom: true, prenom: true, role: true },
    });
  }
}
