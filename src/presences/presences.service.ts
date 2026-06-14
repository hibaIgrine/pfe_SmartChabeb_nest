/**
 * ============================================================
 * FICHIER : presences.service.ts
 * RÔLE    : Logique métier des présences, séances et feedbacks de clubs.
 * ============================================================
 *
 * MÉTHODES PRIVÉES UTILITAIRES :
 *
 *   escapeCsv(value)
 *     Échappe une valeur pour export CSV : si la valeur contient " , \n \r → encadre de guillemets
 *     et double les guillemets internes. Retourne '' pour null/undefined.
 *
 *   normalizeDate(input?)
 *     Valide le format YYYY-MM-DD ; si absent → date du jour (UTC).
 *     Parse en UTC midnight : new Date(`${raw}T00:00:00.000Z`).
 *     Lève BadRequestException si format invalide.
 *
 *   formatDate(date)
 *     Convertit un objet Date en "YYYY-MM-DD" via toISOString().split('T')[0].
 *
 *   assertCanManageClub(userId, clubId)
 *     RESP_CLUB : id_coach = userId OU club_staff.is_active (staff actif du club)
 *     RESP_CENTRE : club.id_centre = user.id_centre
 *     Lève ForbiddenException si l'utilisateur n'a pas le droit.
 *
 * MÉTHODES PUBLIQUES :
 *
 *   getManageableClubs(userId)
 *     RESP_CLUB  → WHERE id_coach = userId
 *     RESP_CENTRE → WHERE id_centre = user.id_centre
 *     Retourne clubs avec nom, categorie, locale_fixe, centre.nom, count(inscriptions ACCEPTE).
 *
 *   markPresence(responsableId, dto)
 *     Vérifie inscription ACCEPTE de id_utilisateur dans id_club.
 *     Trouve ou crée la séance pour (id_club, date_presence) via createSeance().
 *     Upsert presences_clubs sur (id_club, id_utilisateur, id_seance).
 *
 *   unmarkPresence(responsableId, dto)
 *     Vérifie droit via assertCanManageClub.
 *     deleteMany presences_clubs selon (id_club, id_utilisateur, id_seance?, date_seance?).
 *
 *   getMembersForDate(userId, clubId, date?, seanceId?)
 *     Charge inscriptions ACCEPTE + presences via Map<id_utilisateur, {statut, remarque}>.
 *     Retourne membres avec statut (PRESENT|ABSENT|NON_MARQUE).
 *
 *   getHistory(userId, clubId, memberId?, startDate?, endDate?, limit=100, seanceId?)
 *     Historique des présences filtrable. limit clampé entre 1 et 200.
 *
 *   createSeance(userId, dto)
 *     findFirst pour (id_club, date_seance) → si existe, retourne sans créer.
 *     Sinon : prisma.seances.create().
 *     Idempotent — peut être appelé plusieurs fois sans effets secondaires.
 *
 *   getSeancesForClub(userId, clubId, date?)
 *     Filtre séances par id_club, optionnellement par date.
 *
 *   getMyFeedbackSeances(userId)
 *     ADHERENT uniquement. Présences PRESENT où seance.date_seance ≤ maintenant.
 *     Charge feedbacks existants via Map<seanceId, feedback> → O(1) par séance.
 *     Retourne : { seance, presence, feedback: {...} | null }.
 *     Table seance_feedbacks accédée via `this.prisma as any` (modèle non typé).
 *
 *   submitSeanceFeedback(userId, seanceId, dto)
 *     Promise.all → [user, seance, attendance] en parallèle.
 *     Vérifie : user existe, séance existe + passée, présence PRESENT.
 *     Upsert sur (id_seance, id_utilisateur) dans seance_feedbacks.
 *     note_coach : 1-5, note_activites : 1-5, commentaire : max 500c.
 *
 *   getClubFeedbacks(userId, clubId, limit, seanceId?)
 *     Charge séances du club (filtrées par seanceId si fourni).
 *     Charge feedbacks via Map<seanceId, feedback[]>.
 *     Calcule average_coach et average_activities par séance.
 *     Retourne : [{ seance, feedback_count, average_coach, average_activities, feedbacks[] }]
 *
 *   getStats(userId, clubId, startDate?, endDate?)
 *     Promise.all → [membresActifs, presences] en parallèle.
 *     Maps en mémoire : par_jour (date → {presents, absents}), par_membre (userId → {nom, prénom, taux...})
 *     taux_presence global = presents / (presents + absents) * 100
 *
 *   exportDailyPresence(userId, clubId, date?, seanceId?)
 *     Export CSV 26 colonnes : club, centre, responsable, membre, statut, remarque, timestamp.
 *     escapeCsv() appliqué sur chaque cellule.
 *     Retourne : { fileName (YYYYMMDD_clubId.csv), csv (string), metadata {...}, records [] }
 *
 * TABLES PRISMA : presences_clubs, seances, seance_feedbacks (via `as any`)
 */

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { MarkPresenceDto } from './dto/mark-presence.dto';

@Injectable()
export class PresencesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Échappe une valeur pour export CSV — guillemets doublés si la valeur contient " , \n \r. */
  private escapeCsv(value: unknown): string {
    const raw = value === null || value === undefined ? '' : String(value);
    if (/[",\n\r]/.test(raw)) {
      return `"${raw.replace(/"/g, '""')}"`;
    }
    return raw;
  }

  /** Valide YYYY-MM-DD et parse en UTC midnight. Si absent → date du jour. Lève BadRequestException si invalide. */
  private normalizeDate(input?: string): Date {
    const raw =
      input && input.trim() ? input.trim() : this.formatDate(new Date());
    const isValid = /^\d{4}-\d{2}-\d{2}$/.test(raw);

    if (!isValid) {
      throw new BadRequestException(
        'date_presence doit respecter le format YYYY-MM-DD',
      );
    }

    return new Date(`${raw}T00:00:00.000Z`);
  }

  /** Convertit un objet Date en "YYYY-MM-DD" via toISOString().split('T')[0]. */
  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  /**
   * Vérifie que l'utilisateur peut gérer les présences du club.
   * RESP_CLUB : id_coach = userId OU staff actif. RESP_CENTRE : club.id_centre = user.id_centre.
   */
  private async assertCanManageClub(
    userId: string,
    clubId: string,
  ): Promise<void> {
    const user = await this.prisma.utilisateurs.findUnique({
      where: { id: userId },
      select: { role: true, id_centre: true },
    });

    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    if (
      user.role !== 'RESPONSABLE_CLUB' &&
      user.role !== 'RESPONSABLE_CENTRE'
    ) {
      throw new ForbiddenException(
        'Seuls les responsables du club ou du centre peuvent gerer les presences',
      );
    }

    const club = await this.prisma.clubs.findUnique({
      where: { id: clubId },
      select: {
        id: true,
        id_coach: true,
        id_centre: true,
      },
    });

    if (!club) {
      throw new NotFoundException('Club introuvable');
    }

    if (user.role === 'RESPONSABLE_CLUB') {
      const staffMembership = await this.prisma.club_staff.findFirst({
        where: {
          id_club: clubId,
          id_utilisateur: userId,
          is_active: true,
        },
        select: { id: true },
      });

      if (club.id_coach !== userId && !staffMembership) {
        throw new ForbiddenException(
          'Vous ne pouvez gerer que les presences de votre club',
        );
      }
    }

    if (
      user.role === 'RESPONSABLE_CENTRE' &&
      (!user.id_centre || club.id_centre !== user.id_centre)
    ) {
      throw new ForbiddenException(
        'Vous ne pouvez gerer que les presences des clubs de votre centre',
      );
    }
  }

  /**
   * Clubs gérables : RESP_CLUB → WHERE id_coach=userId, RESP_CENTRE → WHERE id_centre=user.id_centre.
   * Inclut count(inscriptions ACCEPTE) pour chaque club.
   */
  async getManageableClubs(userId: string) {
    const user = await this.prisma.utilisateurs.findUnique({
      where: { id: userId },
      select: { role: true, id_centre: true },
    });

    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    if (
      user.role !== 'RESPONSABLE_CLUB' &&
      user.role !== 'RESPONSABLE_CENTRE'
    ) {
      throw new ForbiddenException(
        'Seuls les responsables du club ou du centre peuvent consulter cette ressource',
      );
    }

    const whereClause =
      user.role === 'RESPONSABLE_CLUB'
        ? { id_coach: userId }
        : { id_centre: user.id_centre || '__NO_CENTRE__' };

    return await this.prisma.clubs.findMany({
      where: whereClause,
      select: {
        id: true,
        nom: true,
        categorie: true,
        locale_fixe: true,
        centre: {
          select: {
            nom: true,
          },
        },
        _count: {
          select: {
            inscriptions: {
              where: {
                statut: 'ACCEPTE',
              },
            },
          },
        },
      },
      orderBy: { nom: 'asc' },
    });
  }

  /**
   * Marque ou met à jour la présence d'un membre.
   * Vérifie inscription ACCEPTE → trouve/crée séance → upsert presences_clubs.
   * Clé upsert : (id_club, id_utilisateur, id_seance).
   */
  async markPresence(responsableId: string, dto: MarkPresenceDto) {
    const statut = (dto.statut || '').toUpperCase();
    if (!['PRESENT', 'ABSENT'].includes(statut)) {
      throw new BadRequestException('statut doit etre PRESENT ou ABSENT');
    }

    await this.assertCanManageClub(responsableId, dto.id_club);

    const inscription = await this.prisma.inscriptions_clubs.findFirst({
      where: {
        id_club: dto.id_club,
        id_utilisateur: dto.id_utilisateur,
        statut: 'ACCEPTE',
      },
      select: { id: true },
    });

    if (!inscription) {
      throw new NotFoundException('Ce membre n est pas actif dans le club');
    }

    const datePresence = this.normalizeDate(dto.date_presence);

    // Determine seance: if provided validate it belongs to the club,
    // otherwise try to find a seance on the same date or create one.
    let seanceId: string | null = dto.id_seance || null;

    if (seanceId) {
      const seance = await this.prisma.seances.findUnique({
        where: { id: seanceId },
        select: { id_club: true },
      });
      if (!seance || seance.id_club !== dto.id_club) {
        throw new BadRequestException('Séance invalide pour ce club');
      }
    } else {
      // try find existing seance for the club on that date
      const found = await this.prisma.seances.findFirst({
        where: { id_club: dto.id_club, date_seance: datePresence },
      });
      if (found) {
        seanceId = found.id;
      } else {
        // create a lightweight seance record
        const created = await this.prisma.seances.create({
          data: {
            id_club: dto.id_club,
            date_seance: datePresence,
            titre: `Séance ${this.formatDate(datePresence)}`,
            created_by: responsableId,
          },
        });
        seanceId = created.id;
      }
    }

    return await this.prisma.presences_clubs.upsert({
      where: {
        id_club_id_utilisateur_id_seance: {
          id_club: dto.id_club,
          id_utilisateur: dto.id_utilisateur,
          id_seance: seanceId,
        },
      },
      update: {
        statut,
        remarque: dto.remarque?.trim() || null,
        id_responsable: responsableId,
      },
      create: {
        id_club: dto.id_club,
        id_seance: seanceId,
        id_utilisateur: dto.id_utilisateur,
        id_responsable: responsableId,
        date_presence: datePresence,
        statut,
        remarque: dto.remarque?.trim() || null,
      },
      include: {
        membre: {
          select: {
            id: true,
            nom: true,
            prenom: true,
          },
        },
      },
    });
  }

  /**
   * Supprime le marquage de présence → membre revient à NON_MARQUE.
   * deleteMany sur (id_club, id_utilisateur, id_seance). Résout id_seance via date si absent.
   */
  async unmarkPresence(responsableId: string, dto: any) {
    await this.assertCanManageClub(responsableId, dto.id_club);

    const datePresence = dto.date_presence
      ? this.normalizeDate(dto.date_presence)
      : undefined;

    let seanceId: string | null = dto.id_seance || null;

    if (!seanceId && datePresence) {
      const found = await this.prisma.seances.findFirst({
        where: { id_club: dto.id_club, date_seance: datePresence },
        select: { id: true },
      });
      seanceId = found?.id || null;
    }

    if (!seanceId) {
      throw new BadRequestException('Séance requise pour annuler la présence');
    }

    await this.prisma.presences_clubs.deleteMany({
      where: {
        id_club: dto.id_club,
        id_utilisateur: dto.id_utilisateur,
        id_seance: seanceId,
      },
    });

    return { success: true };
  }

  /**
   * Membres actifs + leur statut pour une date/séance.
   * Utilise Map<id_utilisateur, {statut, remarque}> pour éviter N+1. NON_MARQUE si absent de la Map.
   */
  async getMembersForDate(
    userId: string,
    clubId: string,
    date?: string,
    seanceId?: string,
  ) {
    await this.assertCanManageClub(userId, clubId);

    const datePresence = this.normalizeDate(date);

    const inscriptions = await this.prisma.inscriptions_clubs.findMany({
      where: {
        id_club: clubId,
        statut: 'ACCEPTE',
      },
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
      orderBy: {
        utilisateur: {
          nom: 'asc',
        },
      },
    });

    const memberIds = inscriptions.map((item) => item.id_utilisateur);

    const presences = memberIds.length
      ? await this.prisma.presences_clubs.findMany({
          where: {
            id_club: clubId,
            id_utilisateur: { in: memberIds },
            ...(seanceId
              ? { id_seance: seanceId }
              : { date_presence: datePresence }),
          },
          select: {
            id_utilisateur: true,
            statut: true,
            remarque: true,
            id_seance: true,
          },
        })
      : [];

    const presenceMap = new Map<
      string,
      {
        statut: string;
        remarque: string | null;
      }
    >(
      presences.map((item) => [
        item.id_utilisateur,
        {
          statut: item.statut,
          remarque: item.remarque,
        },
      ]),
    );

    return {
      date_presence: this.formatDate(datePresence),
      membres: inscriptions.map((item) => {
        const status = presenceMap.get(item.id_utilisateur);
        return {
          inscription_id: item.id,
          id_utilisateur: item.utilisateur.id,
          nom: item.utilisateur.nom,
          prenom: item.utilisateur.prenom,
          photo_profil_url: item.utilisateur.photo_profil_url,
          statut_jour: status?.statut ?? 'NON_MARQUE',
          remarque: status?.remarque ?? null,
        };
      }),
    };
  }

  /**
   * Historique des présences filtrable par memberId, plage de dates, séance.
   * limit clampé entre 1 et 200. Trié par date_presence DESC.
   */
  async getHistory(
    userId: string,
    clubId: string,
    memberId?: string,
    startDate?: string,
    endDate?: string,
    limit = 100,
    seanceId?: string,
  ) {
    await this.assertCanManageClub(userId, clubId);

    const take = Number.isFinite(limit)
      ? Math.min(Math.max(limit, 1), 200)
      : 100;

    const dateStart = startDate ? this.normalizeDate(startDate) : undefined;
    const dateEnd = endDate ? this.normalizeDate(endDate) : undefined;

    return await this.prisma.presences_clubs.findMany({
      where: {
        id_club: clubId,
        id_utilisateur: memberId || undefined,
        id_seance: seanceId || undefined,
        date_presence:
          seanceId || (!dateStart && !dateEnd)
            ? undefined
            : {
                gte: dateStart,
                lte: dateEnd,
              },
      },
      include: {
        membre: {
          select: {
            id: true,
            nom: true,
            prenom: true,
          },
        },
        responsable: {
          select: {
            id: true,
            nom: true,
            prenom: true,
          },
        },
      },
      orderBy: [{ date_presence: 'desc' }, { created_at: 'desc' }],
      take,
    });
  }

  /**
   * Crée une séance (idempotent) : findFirst par (id_club, date_seance, titre) → retourne si existante.
   * Si absent → INSERT dans seances. Titre par défaut : "Séance YYYY-MM-DD".
   */
  async createSeance(userId: string, dto: any) {
    await this.assertCanManageClub(userId, dto.id_club);

    const dateSeance = dto.date_seance
      ? this.normalizeDate(dto.date_seance)
      : this.normalizeDate();

    // tenter de trouver une séance identique
    const existing = await this.prisma.seances.findFirst({
      where: {
        id_club: dto.id_club,
        date_seance: dateSeance,
        titre: dto.titre || undefined,
      },
    });

    if (existing) return existing;

    const created = await this.prisma.seances.create({
      data: {
        id_club: dto.id_club,
        date_seance: dateSeance,
        titre: dto.titre || `Séance ${this.formatDate(dateSeance)}`,
        heure_debut: dto.heure_debut ? new Date(dto.heure_debut) : undefined,
        heure_fin: dto.heure_fin ? new Date(dto.heure_fin) : undefined,
        created_by: userId,
      },
    });

    return created;
  }

  /** Séances d'un club, filtrables par date. Triées par heure_debut ASC. */
  async getSeancesForClub(userId: string, clubId: string, date?: string) {
    await this.assertCanManageClub(userId, clubId);

    const whereClause: any = { id_club: clubId };
    if (date) whereClause.date_seance = this.normalizeDate(date);

    return await this.prisma.seances.findMany({
      where: whereClause,
      orderBy: { heure_debut: 'asc' },
    });
  }

  /**
   * Séances passées où l'adhérent était PRESENT + feedbacks existants via Map<seanceId, feedback>.
   * Table seance_feedbacks accédée via `this.prisma as any` (modèle non typé dans Prisma Client).
   */
  async getMyFeedbackSeances(userId: string) {
    const prisma = this.prisma as any;

    const user = await this.prisma.utilisateurs.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });

    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    if (user.role !== 'ADHERENT') {
      throw new ForbiddenException('Accès réservé aux adhérents');
    }

    const attendances = await this.prisma.presences_clubs.findMany({
      where: {
        id_utilisateur: userId,
        statut: 'PRESENT',
        seance: {
          date_seance: {
            lte: new Date(),
          },
        },
      },
      include: {
        seance: {
          include: {
            club: {
              select: {
                id: true,
                nom: true,
                categorie: true,
                logo_url: true,
                id_coach: true,
                responsable: {
                  select: {
                    id: true,
                    nom: true,
                    prenom: true,
                    photo_profil_url: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: [{ date_presence: 'desc' }, { created_at: 'desc' }],
    });

    const seanceIds = attendances
      .map((item) => item.id_seance)
      .filter((value): value is string => Boolean(value));

    const feedbacks = seanceIds.length
      ? await prisma.seance_feedbacks.findMany({
          where: {
            id_seance: { in: seanceIds },
            id_utilisateur: userId,
          },
          select: {
            id: true,
            id_seance: true,
            note_coach: true,
            note_activites: true,
            commentaire: true,
            created_at: true,
            updated_at: true,
          },
        })
      : [];

    const feedbackMap = new Map(
      feedbacks.map((item) => [item.id_seance, item]),
    );

    return attendances
      .map((attendance) => {
        const seance = attendance.seance;
        if (!seance) {
          return null;
        }

        const feedback = feedbackMap.get(attendance.id_seance || '') || null;

        return {
          presenceId: attendance.id,
          seanceId: attendance.id_seance,
          club: seance.club,
          date_presence: this.formatDate(attendance.date_presence),
          seance: {
            id: seance.id,
            titre: seance.titre,
            date_seance: this.formatDate(seance.date_seance),
            heure_debut: seance.heure_debut,
            heure_fin: seance.heure_fin,
          },
          myFeedback: feedback,
          canRate: seance.date_seance.getTime() <= Date.now(),
        };
      })
      .filter(Boolean);
  }

  /**
   * Soumet ou met à jour le feedback d'un adhérent pour une séance.
   * Promise.all → [user, seance, attendance]. Upsert sur (id_seance, id_utilisateur).
   * Conditions : ADHERENT, PRESENT à la séance, date_seance ≤ maintenant, notes 1-5.
   */
  async submitSeanceFeedback(userId: string, seanceId: string, dto: any) {
    const prisma = this.prisma as any;

    const [user, seance, attendance] = await Promise.all([
      this.prisma.utilisateurs.findUnique({
        where: { id: userId },
        select: { id: true, role: true },
      }),
      this.prisma.seances.findUnique({
        where: { id: seanceId },
        select: {
          id: true,
          id_club: true,
          date_seance: true,
          titre: true,
          club: {
            select: {
              id: true,
              nom: true,
              responsable: {
                select: {
                  id: true,
                  nom: true,
                  prenom: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.presences_clubs.findFirst({
        where: {
          id_seance: seanceId,
          id_utilisateur: userId,
          statut: 'PRESENT',
        },
        select: { id: true, statut: true },
      }),
    ]);

    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    if (user.role !== 'ADHERENT') {
      throw new ForbiddenException('Accès réservé aux adhérents');
    }

    if (!seance) {
      throw new NotFoundException('Séance introuvable');
    }

    if (!attendance) {
      throw new ForbiddenException(
        'Seuls les membres présents peuvent donner un feedback',
      );
    }

    if (seance.date_seance.getTime() > Date.now()) {
      throw new BadRequestException(
        'Le feedback est disponible après la séance',
      );
    }

    const noteCoach = Number(dto.note_coach);
    const noteActivites = Number(dto.note_activites);

    if (!Number.isInteger(noteCoach) || noteCoach < 1 || noteCoach > 5) {
      throw new BadRequestException(
        'La note du coach doit être comprise entre 1 et 5',
      );
    }

    if (
      !Number.isInteger(noteActivites) ||
      noteActivites < 1 ||
      noteActivites > 5
    ) {
      throw new BadRequestException(
        'La note des activités doit être comprise entre 1 et 5',
      );
    }

    const commentaire = dto.commentaire?.trim() || null;
    if (commentaire && commentaire.length > 500) {
      throw new BadRequestException(
        'Le commentaire ne doit pas dépasser 500 caractères',
      );
    }

    const feedback = await prisma.seance_feedbacks.upsert({
      where: {
        id_seance_id_utilisateur: {
          id_seance: seanceId,
          id_utilisateur: userId,
        },
      },
      update: {
        note_coach: noteCoach,
        note_activites: noteActivites,
        commentaire,
      },
      create: {
        id_seance: seanceId,
        id_utilisateur: userId,
        note_coach: noteCoach,
        note_activites: noteActivites,
        commentaire,
      },
    });

    return {
      feedback,
      seance: {
        id: seance.id,
        titre: seance.titre,
        date_seance: this.formatDate(seance.date_seance),
        club: seance.club,
      },
    };
  }

  /**
   * Feedbacks des adhérents pour les séances du club.
   * Calcule average_coach et average_activities via Map<seanceId, {count, sumCoach, sumActivities}>.
   * Retourne : { feedbacks[], summary[{ seanceId, average_coach, average_activities, count }] }
   */
  async getClubFeedbacks(
    userId: string,
    clubId: string,
    limit = 100,
    seanceId?: string,
  ) {
    await this.assertCanManageClub(userId, clubId);

    const take = Number.isFinite(Number(limit))
      ? Math.min(Math.max(Number(limit), 1), 500)
      : 100;

    // Valide et récupère les séances applicables
    const seanceWhere: any = seanceId
      ? { id: seanceId, id_club: clubId }
      : { id_club: clubId };

    const seances = await this.prisma.seances.findMany({
      where: seanceWhere,
      select: { id: true, titre: true, date_seance: true },
    });

    const seanceIds = seances.map((s) => s.id);

    if (seanceIds.length === 0) {
      return { feedbacks: [], summary: [] };
    }

    const prisma: any = this.prisma as any;

    const feedbacks = await prisma.seance_feedbacks.findMany({
      where: { id_seance: { in: seanceIds } },
      include: {
        seance: { select: { id: true, titre: true, date_seance: true } },
        utilisateur: {
          select: {
            id: true,
            nom: true,
            prenom: true,
            photo_profil_url: true,
          },
        },
      },
      orderBy: { created_at: 'desc' },
      take,
    });

    // Calcul des moyennes par séance
    const bySeance = new Map<
      string,
      { count: number; sumCoach: number; sumActivities: number }
    >();

    for (const f of feedbacks) {
      const key = f.id_seance;
      const cur = bySeance.get(key) || {
        count: 0,
        sumCoach: 0,
        sumActivities: 0,
      };
      cur.count += 1;
      cur.sumCoach += f.note_coach || 0;
      cur.sumActivities += f.note_activites || 0;
      bySeance.set(key, cur);
    }

    const summary = Array.from(bySeance.entries()).map(([sid, v]) => ({
      seanceId: sid,
      average_coach: v.count ? Number((v.sumCoach / v.count).toFixed(2)) : 0,
      average_activities: v.count
        ? Number((v.sumActivities / v.count).toFixed(2))
        : 0,
      count: v.count,
    }));

    return { feedbacks, summary };
  }

  /**
   * Statistiques de présence : taux global + Maps par_jour et par_membre.
   * Promise.all → [membresActifs, presences]. taux_presence = presents/(presents+absents)*100.
   */
  async getStats(
    userId: string,
    clubId: string,
    startDate?: string,
    endDate?: string,
  ) {
    await this.assertCanManageClub(userId, clubId);

    const dateStart = startDate ? this.normalizeDate(startDate) : undefined;
    const dateEnd = endDate ? this.normalizeDate(endDate) : undefined;

    const [membresActifs, presences] = await Promise.all([
      this.prisma.inscriptions_clubs.findMany({
        where: { id_club: clubId, statut: 'ACCEPTE' },
        select: {
          id_utilisateur: true,
          utilisateur: {
            select: {
              nom: true,
              prenom: true,
            },
          },
        },
      }),
      this.prisma.presences_clubs.findMany({
        where: {
          id_club: clubId,
          date_presence:
            dateStart || dateEnd
              ? {
                  gte: dateStart,
                  lte: dateEnd,
                }
              : undefined,
        },
        select: {
          id_utilisateur: true,
          date_presence: true,
          statut: true,
        },
      }),
    ]);

    const presentCount = presences.filter(
      (item) => item.statut === 'PRESENT',
    ).length;
    const absentCount = presences.filter(
      (item) => item.statut === 'ABSENT',
    ).length;
    const markedCount = presentCount + absentCount;

    const byDate = new Map<string, { presents: number; absents: number }>();
    for (const item of presences) {
      const key = this.formatDate(item.date_presence);
      const current = byDate.get(key) || { presents: 0, absents: 0 };
      if (item.statut === 'PRESENT') {
        current.presents += 1;
      } else if (item.statut === 'ABSENT') {
        current.absents += 1;
      }
      byDate.set(key, current);
    }

    const byMemberMap = new Map<
      string,
      {
        id_utilisateur: string;
        nom_complet: string;
        presents: number;
        absents: number;
      }
    >();

    for (const member of membresActifs) {
      byMemberMap.set(member.id_utilisateur, {
        id_utilisateur: member.id_utilisateur,
        nom_complet: `${member.utilisateur.prenom} ${member.utilisateur.nom}`,
        presents: 0,
        absents: 0,
      });
    }

    for (const item of presences) {
      const current = byMemberMap.get(item.id_utilisateur);
      if (!current) continue;
      if (item.statut === 'PRESENT') current.presents += 1;
      if (item.statut === 'ABSENT') current.absents += 1;
    }

    const byMember = Array.from(byMemberMap.values())
      .map((item) => {
        const total = item.presents + item.absents;
        const tauxPresence =
          total > 0 ? Number(((item.presents / total) * 100).toFixed(2)) : 0;
        return {
          ...item,
          total,
          taux_presence: tauxPresence,
        };
      })
      .sort((a, b) => b.taux_presence - a.taux_presence);

    return {
      periode: {
        start_date: dateStart ? this.formatDate(dateStart) : null,
        end_date: dateEnd ? this.formatDate(dateEnd) : null,
      },
      totals: {
        membres_actifs: membresActifs.length,
        presents: presentCount,
        absents: absentCount,
        marquages: markedCount,
        taux_presence_global:
          markedCount > 0
            ? Number(((presentCount / markedCount) * 100).toFixed(2))
            : 0,
      },
      par_membre: byMember,
      par_jour: Array.from(byDate.entries())
        .map(([dateKey, value]) => ({
          date_presence: dateKey,
          presents: value.presents,
          absents: value.absents,
        }))
        .sort((a, b) => (a.date_presence < b.date_presence ? 1 : -1)),
    };
  }

  /**
   * Export CSV 26 colonnes des présences d'une journée/séance.
   * escapeCsv() appliqué sur chaque cellule. Retourne { fileName, csv, metadata, records }.
   * fileName = "YYYYMMDD_clubId.csv".
   */
  async exportDailyPresence(
    userId: string,
    clubId: string,
    date?: string,
    seanceId?: string,
  ) {
    await this.assertCanManageClub(userId, clubId);

    const seance = seanceId
      ? await this.prisma.seances.findUnique({
          where: { id: seanceId },
          select: {
            id: true,
            id_club: true,
            date_seance: true,
            titre: true,
          },
        })
      : null;

    if (seanceId && (!seance || seance.id_club !== clubId)) {
      throw new BadRequestException('Séance invalide pour ce club');
    }

    const datePresence = seance?.date_seance ?? this.normalizeDate(date);
    const dateLabel = this.formatDate(datePresence);

    const club = await this.prisma.clubs.findUnique({
      where: { id: clubId },
      select: {
        id: true,
        nom: true,
        categorie: true,
        locale_fixe: true,
        centre: {
          select: {
            id: true,
            nom: true,
            gouvernorat: true,
            delegation: true,
          },
        },
        responsable: {
          select: {
            id: true,
            nom: true,
            prenom: true,
            email: true,
          },
        },
      },
    });

    if (!club) {
      throw new NotFoundException('Club introuvable');
    }

    const inscriptions = await this.prisma.inscriptions_clubs.findMany({
      where: {
        id_club: clubId,
        statut: 'ACCEPTE',
      },
      include: {
        utilisateur: {
          select: {
            id: true,
            nom: true,
            prenom: true,
            email: true,
            role: true,
          },
        },
      },
      orderBy: {
        utilisateur: {
          nom: 'asc',
        },
      },
    });

    const presences = await this.prisma.presences_clubs.findMany({
      where: {
        id_club: clubId,
        ...(seanceId
          ? { id_seance: seanceId }
          : { date_presence: datePresence }),
      },
      include: {
        responsable: {
          select: {
            id: true,
            nom: true,
            prenom: true,
            email: true,
          },
        },
      },
    });

    const presenceMap = new Map(
      presences.map((item) => [item.id_utilisateur, item]),
    );

    const headers = [
      'date_presence',
      'id_club',
      'nom_club',
      'categorie_club',
      'local_club',
      'id_centre',
      'nom_centre',
      'gouvernorat_centre',
      'delegation_centre',
      'id_responsable_club',
      'nom_responsable_club',
      'prenom_responsable_club',
      'email_responsable_club',
      'id_utilisateur',
      'nom_utilisateur',
      'prenom_utilisateur',
      'email_utilisateur',
      'role_utilisateur',
      'statut_presence',
      'remarque',
      'marque_par_id',
      'marque_par_nom',
      'marque_par_prenom',
      'marque_par_email',
      'exported_at',
    ];

    const exportedAt = new Date().toISOString();

    const reportRows = inscriptions.map((item) => {
      const record = presenceMap.get(item.id_utilisateur);
      return {
        dateLabel,
        clubId: club.id,
        clubNom: club.nom,
        clubCategorie: club.categorie,
        clubLocal: club.locale_fixe,
        centreId: club.centre?.id ?? null,
        centreNom: club.centre?.nom ?? null,
        centreGouvernorat: club.centre?.gouvernorat ?? null,
        centreDelegation: club.centre?.delegation ?? null,
        responsableClubId: club.responsable?.id ?? null,
        responsableClubNom: club.responsable?.nom ?? null,
        responsableClubPrenom: club.responsable?.prenom ?? null,
        responsableClubEmail: club.responsable?.email ?? null,
        utilisateurId: item.utilisateur.id,
        utilisateurNom: item.utilisateur.nom,
        utilisateurPrenom: item.utilisateur.prenom,
        utilisateurEmail: item.utilisateur.email,
        utilisateurRole: item.utilisateur.role,
        statutPresence: record?.statut ?? 'NON_MARQUE',
        remarque: record?.remarque ?? '',
        marqueParId: record?.responsable?.id ?? '',
        marqueParNom: record?.responsable?.nom ?? '',
        marqueParPrenom: record?.responsable?.prenom ?? '',
        marqueParEmail: record?.responsable?.email ?? '',
        exportedAt,
      };
    });

    const rows = reportRows.map((row) =>
      [
        row.dateLabel,
        row.clubId,
        row.clubNom,
        row.clubCategorie,
        row.clubLocal,
        row.centreId,
        row.centreNom,
        row.centreGouvernorat,
        row.centreDelegation,
        row.responsableClubId,
        row.responsableClubNom,
        row.responsableClubPrenom,
        row.responsableClubEmail,
        row.utilisateurId,
        row.utilisateurNom,
        row.utilisateurPrenom,
        row.utilisateurEmail,
        row.utilisateurRole,
        row.statutPresence,
        row.remarque,
        row.marqueParId,
        row.marqueParNom,
        row.marqueParPrenom,
        row.marqueParEmail,
        row.exportedAt,
      ]
        .map((cell) => this.escapeCsv(cell))
        .join(','),
    );

    const csv = [headers.join(','), ...rows].join('\r\n');
    const clubSlug =
      club.nom
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'club';

    const sessionSlug = String(seance?.titre || 'seance')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    return {
      fileName: `presence-${clubSlug}-${sessionSlug || dateLabel}.csv`,
      csv,
      metadata: {
        datePresence: dateLabel,
        seance: seance
          ? {
              id: seance.id,
              titre: seance.titre,
              date_seance: this.formatDate(seance.date_seance),
            }
          : null,
        club: {
          id: club.id,
          nom: club.nom,
          categorie: club.categorie,
          local: club.locale_fixe,
        },
        centre: {
          id: club.centre?.id ?? null,
          nom: club.centre?.nom ?? null,
          gouvernorat: club.centre?.gouvernorat ?? null,
          delegation: club.centre?.delegation ?? null,
        },
      },
      records: reportRows,
    };
  }
}
