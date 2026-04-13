import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ReservationsService } from 'src/reservations/reservations.service';
import { NotificationsService } from 'src/notifications/notifications.service';
import { CreateClubCreationRequestDto } from './dto/create-club-creation-request.dto';
import { UpdateClubCreationRequestStatusDto } from './dto/update-club-creation-request-status.dto';

@Injectable()
export class ClubCreationRequestsService {
  private readonly weekdayIndexes: Record<string, number> = {
    SUNDAY: 0,
    MONDAY: 1,
    TUESDAY: 2,
    WEDNESDAY: 3,
    THURSDAY: 4,
    FRIDAY: 5,
    SATURDAY: 6,
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly reservationsService: ReservationsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  private getTable() {
    return (this.prisma as any).demandes_creation_clubs;
  }

  private toDate(dateStr?: string, timeStr?: string): Date | null {
    if (!dateStr || !timeStr) return null;
    return new Date(`${dateStr}T${timeStr}`);
  }

  private formatDateOnly(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  private getNextWeekdayDate(weekday: string): Date {
    const targetIndex = this.weekdayIndexes[weekday];
    if (targetIndex === undefined) {
      throw new BadRequestException('Jour recurrent invalide');
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

  private generateWeeklyDates(startDate: Date, occurrences = 52): Date[] {
    const dates: Date[] = [];
    for (let i = 0; i < occurrences; i++) {
      const current = new Date(startDate);
      current.setDate(startDate.getDate() + i * 7);
      dates.push(current);
    }
    return dates;
  }

  private resolveStartDateForApproval(current: any): Date {
    const planning = current?.planning_souhaite;
    const planningWeekday =
      planning && typeof planning === 'object'
        ? planning.jour_recurrent || planning.jour
        : undefined;

    if (planningWeekday && this.weekdayIndexes[planningWeekday] !== undefined) {
      return this.getNextWeekdayDate(planningWeekday);
    }

    if (!current?.date_souhaitee) {
      throw new BadRequestException('Date de depart du planning introuvable');
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const storedDate = new Date(current.date_souhaitee);
    storedDate.setHours(0, 0, 0, 0);

    if (storedDate >= today) {
      return storedDate;
    }

    const weekday = Object.entries(this.weekdayIndexes).find(
      ([, dayIndex]) => dayIndex === storedDate.getDay(),
    )?.[0];

    if (weekday) {
      return this.getNextWeekdayDate(weekday);
    }

    return today;
  }

  private resolveRecurringSlot(dto: CreateClubCreationRequestDto) {
    if (!dto.heure_debut_souhaitee || !dto.heure_fin_souhaitee) {
      throw new BadRequestException(
        'heure_debut_souhaitee et heure_fin_souhaitee sont obligatoires',
      );
    }

    const recurringDate = dto.jour_recurrent
      ? this.getNextWeekdayDate(dto.jour_recurrent)
      : dto.date_souhaitee
        ? new Date(dto.date_souhaitee)
        : null;

    if (!recurringDate) {
      throw new BadRequestException(
        'Vous devez renseigner un jour recurrent ou une date souhaitee',
      );
    }

    const dateStr = this.formatDateOnly(recurringDate);
    const startDateTime = new Date(`${dateStr}T${dto.heure_debut_souhaitee}`);
    const endDateTime = new Date(`${dateStr}T${dto.heure_fin_souhaitee}`);

    if (endDateTime <= startDateTime) {
      throw new BadRequestException(
        'heure_fin_souhaitee doit etre strictement superieure a heure_debut_souhaitee',
      );
    }

    return {
      dateStr,
      startTime: dto.heure_debut_souhaitee,
      endTime: dto.heure_fin_souhaitee,
      date: recurringDate,
    };
  }

  private async ensureLocalAvailability(dto: CreateClubCreationRequestDto) {
    if (!dto.id_local_souhaite) {
      throw new BadRequestException('Le local souhaite est obligatoire');
    }

    const slot = this.resolveRecurringSlot(dto);

    const isAvailable = await this.reservationsService.checkAvailability(
      dto.id_local_souhaite,
      slot.dateStr,
      slot.startTime,
      slot.endTime,
    );

    if (!isAvailable) {
      throw new BadRequestException(
        'Le local choisi est indisponible pour ce creneau horaire.',
      );
    }
  }

  private parseObjectives(raw: string): string[] {
    if (!raw || typeof raw !== 'string') {
      throw new BadRequestException('Les objectifs du club sont obligatoires.');
    }

    let objectives: string[] = [];

    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        objectives = parsed
          .map((value) => (typeof value === 'string' ? value.trim() : ''))
          .filter(Boolean);
      }
    } catch {
      objectives = raw
        .split(/\r?\n|,|;/)
        .map((value) => value.trim())
        .filter(Boolean);
    }

    if (objectives.length === 0) {
      throw new BadRequestException(
        'Ajoutez au moins un objectif pour le club.',
      );
    }

    return objectives;
  }

  async create(
    userId: string,
    role: string,
    dto: CreateClubCreationRequestDto,
    files?: {
      cv?: Express.Multer.File[];
      attestation?: Express.Multer.File[];
      logo?: Express.Multer.File[];
    },
  ) {
    if (role !== 'ADHERENT') {
      throw new ForbiddenException(
        'Seuls les adherents peuvent soumettre une demande de creation de club.',
      );
    }

    const requester = await this.prisma.utilisateurs.findUnique({
      where: { id: userId },
      select: { id_centre: true },
    });

    const local = dto.id_local_souhaite
      ? await this.prisma.locaux.findUnique({
          where: { id: dto.id_local_souhaite },
          select: { id: true, id_centre: true, nom: true },
        })
      : null;

    if (dto.id_local_souhaite && !local) {
      throw new NotFoundException('Local souhaite introuvable');
    }

    if (
      requester?.id_centre &&
      local &&
      local.id_centre !== requester.id_centre
    ) {
      throw new ForbiddenException(
        'Le local selectionne ne fait pas partie de votre centre.',
      );
    }

    await this.ensureLocalAvailability(dto);

    const cvFile = files?.cv?.[0];
    const attestationFile = files?.attestation?.[0];
    const logoFile = files?.logo?.[0];
    const slot = this.resolveRecurringSlot(dto);
    const objectifs = this.parseObjectives(dto.objectifs);

    let parsedPlanning: any = null;
    if (dto.planning_souhaite) {
      try {
        parsedPlanning = JSON.parse(dto.planning_souhaite);
      } catch {
        parsedPlanning = { texte: dto.planning_souhaite };
      }
    }

    const planningObject =
      parsedPlanning &&
      typeof parsedPlanning === 'object' &&
      !Array.isArray(parsedPlanning)
        ? parsedPlanning
        : { texte: dto.planning_souhaite };

    return this.getTable().create({
      data: {
        nom_club: dto.nom_club,
        categorie: dto.categorie,
        description: dto.description,
        planning_souhaite: {
          ...planningObject,
          objectifs,
          capacite: dto.capacite,
          logo_url: logoFile ? `/uploads/${logoFile.filename}` : null,
          mode: 'HEBDOMADAIRE',
          jour_recurrent: dto.jour_recurrent,
          heure_debut: dto.heure_debut_souhaitee,
          heure_fin: dto.heure_fin_souhaitee,
          recurrence: 'TOUTE_L_ANNEE',
          date_reference: slot.dateStr,
        },
        id_demandeur: userId,
        id_centre: requester?.id_centre ?? local?.id_centre ?? null,
        id_local_souhaite: local?.id ?? null,
        date_souhaitee: slot.date,
        heure_debut_souhaitee: this.toDate(slot.dateStr, slot.startTime),
        heure_fin_souhaitee: this.toDate(slot.dateStr, slot.endTime),
        cv_url: cvFile ? `/uploads/${cvFile.filename}` : null,
        attestation_url: attestationFile
          ? `/uploads/${attestationFile.filename}`
          : null,
      },
      include: {
        demandeur: {
          select: {
            id: true,
            nom: true,
            prenom: true,
            email: true,
            role: true,
          },
        },
        local_souhaite: { select: { id: true, nom: true, type: true } },
      },
    });
  }

  async findMine(userId: string) {
    return this.getTable().findMany({
      where: { id_demandeur: userId },
      include: {
        local_souhaite: { select: { id: true, nom: true, type: true } },
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async findAll(requesterId: string, requesterRole: string, statut?: string) {
    const requester = await this.prisma.utilisateurs.findUnique({
      where: { id: requesterId },
      select: { id_centre: true },
    });

    const where: any = {};
    if (statut) {
      where.statut = statut;
    }

    if (requesterRole === 'RESPONSABLE_CENTRE') {
      if (!requester?.id_centre) {
        return [];
      }
      where.id_centre = requester.id_centre;
    }

    if (requesterRole !== 'ADMIN' && requesterRole !== 'RESPONSABLE_CENTRE') {
      throw new ForbiddenException('Acces refuse');
    }

    return this.getTable().findMany({
      where,
      include: {
        demandeur: {
          select: {
            id: true,
            nom: true,
            prenom: true,
            email: true,
            id_centre: true,
          },
        },
        local_souhaite: { select: { id: true, nom: true, type: true } },
        centre: { select: { id: true, nom: true } },
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async findCategories() {
    const [requestCategories, clubCategories] = await Promise.all([
      this.getTable().findMany({
        select: { categorie: true },
      }),
      this.prisma.clubs.findMany({
        select: { categorie: true },
      }),
    ]);

    const values = [...requestCategories, ...clubCategories]
      .map((item) => String(item.categorie || '').trim())
      .filter(Boolean);

    return Array.from(new Set(values)).sort((a, b) =>
      a.localeCompare(b, 'fr', { sensitivity: 'base' }),
    );
  }

  async updateStatus(
    id: string,
    requesterId: string,
    requesterRole: string,
    dto: UpdateClubCreationRequestStatusDto,
  ) {
    const current = await this.getTable().findUnique({
      where: { id },
      include: {
        local_souhaite: {
          select: { id: true, nom: true, prix_heure: true, id_centre: true },
        },
      },
    });

    if (!current) {
      throw new NotFoundException('Demande introuvable');
    }

    if (current.statut !== 'EN_ATTENTE') {
      throw new BadRequestException('Cette demande a deja ete traitee');
    }

    if (requesterRole !== 'ADMIN' && requesterRole !== 'RESPONSABLE_CENTRE') {
      throw new ForbiddenException('Acces refuse');
    }

    if (requesterRole === 'RESPONSABLE_CENTRE') {
      const requester = await this.prisma.utilisateurs.findUnique({
        where: { id: requesterId },
        select: { id_centre: true },
      });

      if (!requester?.id_centre || requester.id_centre !== current.id_centre) {
        throw new ForbiddenException(
          'Vous ne pouvez traiter que les demandes de votre centre',
        );
      }
    }

    if (dto.statut !== 'ACCEPTEE') {
      const updatedRequest = await this.getTable().update({
        where: { id },
        data: {
          statut: dto.statut,
          commentaire_decision: dto.commentaire_decision ?? null,
          reviewed_by: requesterId,
        },
      });

      try {
        await this.notificationsService.createClubCreationDecisionNotification({
          utilisateurId: current.id_demandeur,
          demandeId: current.id,
          clubNom: current.nom_club,
          statut: 'REFUSEE',
          commentaireDecision: dto.commentaire_decision ?? null,
          reviewedBy: requesterId,
        });
      } catch (err) {
        console.error(
          'Erreur lors de la creation de la notification de refus:',
          err,
        );
      }

      return updatedRequest;
    }

    if (
      !current.id_local_souhaite ||
      !current.date_souhaitee ||
      !current.heure_debut_souhaitee ||
      !current.heure_fin_souhaitee
    ) {
      throw new BadRequestException(
        'Impossible de valider: informations de local/horaire manquantes.',
      );
    }

    const startTime = current.heure_debut_souhaitee
      .toTimeString()
      .split(' ')[0];
    const endTime = current.heure_fin_souhaitee.toTimeString().split(' ')[0];
    const firstOccurrenceDate = this.resolveStartDateForApproval(current);
    const recurringDates = this.generateWeeklyDates(firstOccurrenceDate, 52);

    for (const dateItem of recurringDates) {
      const dateStr = this.formatDateOnly(dateItem);
      const isAvailable = await this.reservationsService.checkAvailability(
        current.id_local_souhaite,
        dateStr,
        startTime,
        endTime,
      );

      if (!isAvailable) {
        throw new BadRequestException(
          `Le local n'est pas disponible pour le créneau du ${dateStr}.`,
        );
      }
    }

    const durationHours =
      (current.heure_fin_souhaitee.getTime() -
        current.heure_debut_souhaitee.getTime()) /
      (1000 * 60 * 60);
    const prixTotal = current.local_souhaite?.prix_heure
      ? Number(current.local_souhaite.prix_heure) * durationHours
      : 0;

    const result = await this.prisma.$transaction(async (tx) => {
      const planningInsert = await tx.reservations_locaux.createMany({
        data: recurringDates.map((dateItem) => {
          const dateStr = this.formatDateOnly(dateItem);
          return {
            date_reservation: new Date(dateStr),
            heure_debut: new Date(`${dateStr}T${startTime}`),
            heure_fin: new Date(`${dateStr}T${endTime}`),
            objet: `Créneau club validé: ${current.nom_club}`,
            statut: 'VALIDEE',
            prix_total: prixTotal,
            id_local: current.id_local_souhaite as string,
            id_utilisateur: current.id_demandeur,
          };
        }),
      });

      if (!planningInsert.count) {
        throw new BadRequestException(
          "Aucune réservation n'a pu être créée pour ce créneau.",
        );
      }

      const clubCentreId =
        current.id_centre ?? current.local_souhaite?.id_centre;
      if (!clubCentreId) {
        throw new BadRequestException(
          'Impossible de créer le club officiel: centre introuvable.',
        );
      }

      const existingClub = await tx.clubs.findFirst({
        where: {
          nom: current.nom_club,
          id_centre: clubCentreId,
        },
        select: { id: true },
      });

      const officialClub = existingClub
        ? await tx.clubs.update({
            where: { id: existingClub.id },
            data: {
              id_coach: current.id_demandeur,
              capacite:
                Number((current.planning_souhaite as any)?.capacite) > 0
                  ? Number((current.planning_souhaite as any)?.capacite)
                  : null,
              logo_url:
                ((current.planning_souhaite as any)?.logo_url as string) ||
                null,
              est_actif: true,
            },
            select: { id: true },
          })
        : await tx.clubs.create({
            data: {
              nom: current.nom_club,
              description: current.description,
              categorie: current.categorie,
              id_centre: clubCentreId,
              id_coach: current.id_demandeur,
              capacite:
                Number((current.planning_souhaite as any)?.capacite) > 0
                  ? Number((current.planning_souhaite as any)?.capacite)
                  : null,
              logo_url:
                ((current.planning_souhaite as any)?.logo_url as string) ||
                null,
              planning: current.planning_souhaite ?? {
                mode: 'HEBDOMADAIRE',
                jour_recurrent:
                  (current.planning_souhaite as any)?.jour_recurrent ??
                  undefined,
                heure_debut:
                  (current.planning_souhaite as any)?.heure_debut ?? undefined,
                heure_fin:
                  (current.planning_souhaite as any)?.heure_fin ?? undefined,
                recurrence: 'TOUTE_L_ANNEE',
              },
              locale_fixe: current.local_souhaite?.nom,
              est_actif: true,
            },
            select: { id: true },
          });

      await tx.utilisateurs.update({
        where: { id: current.id_demandeur },
        data: { role: 'RESPONSABLE_CLUB' },
      });

      const updatedRequest = await (tx as any).demandes_creation_clubs.update({
        where: { id },
        data: {
          statut: dto.statut,
          commentaire_decision: dto.commentaire_decision ?? null,
          reviewed_by: requesterId,
        },
      });

      return {
        ...updatedRequest,
        planning_reservations_created: planningInsert.count,
        official_club_id: officialClub.id,
      };
    });

    try {
      await this.notificationsService.createClubCreationDecisionNotification({
        utilisateurId: current.id_demandeur,
        demandeId: current.id,
        clubNom: current.nom_club,
        statut: 'ACCEPTEE',
        commentaireDecision: dto.commentaire_decision ?? null,
        reviewedBy: requesterId,
      });
    } catch (err) {
      console.error(
        "Erreur lors de la creation de la notification d'acceptation:",
        err,
      );
    }

    return result;
  }
}
