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

  // Echappe une valeur avant export CSV pour eviter de casser les colonnes.
  private escapeCsv(value: unknown): string {
    const raw = value === null || value === undefined ? '' : String(value);
    if (/[",\n\r]/.test(raw)) {
      return `"${raw.replace(/"/g, '""')}"`;
    }
    return raw;
  }

  // Normalise une date texte au format UTC YYYY-MM-DD.
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

  // Convertit une date JS en chaine YYYY-MM-DD.
  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  // Verifie que l'utilisateur a le droit de gerer les presences de ce club.
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

    if (user.role === 'RESPONSABLE_CLUB' && club.id_coach !== userId) {
      throw new ForbiddenException(
        'Vous ne pouvez gerer que les presences de votre club',
      );
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

  // Retourne les clubs que cet utilisateur a le droit de gerer.
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

  // Marque la presence d'un membre pour une date donnee.
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

    return await this.prisma.presences_clubs.upsert({
      where: {
        id_club_id_utilisateur_date_presence: {
          id_club: dto.id_club,
          id_utilisateur: dto.id_utilisateur,
          date_presence: datePresence,
        },
      },
      update: {
        statut,
        remarque: dto.remarque?.trim() || null,
        id_responsable: responsableId,
      },
      create: {
        id_club: dto.id_club,
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

  // Construit la liste des membres d'un club avec leur statut pour une date.
  async getMembersForDate(userId: string, clubId: string, date?: string) {
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
            date_presence: datePresence,
          },
          select: {
            id_utilisateur: true,
            statut: true,
            remarque: true,
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

  // Recupere l'historique complet des presences avec filtre par dates et membre.
  async getHistory(
    userId: string,
    clubId: string,
    memberId?: string,
    startDate?: string,
    endDate?: string,
    limit = 100,
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
        date_presence:
          dateStart || dateEnd
            ? {
                gte: dateStart,
                lte: dateEnd,
              }
            : undefined,
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

  // Calcule les statistiques de presence globales et par membre.
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

  // Prepare les donnees du jour pour un export de presence.
  async exportDailyPresence(userId: string, clubId: string, date?: string) {
    await this.assertCanManageClub(userId, clubId);

    const datePresence = this.normalizeDate(date);
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
        date_presence: datePresence,
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

    return {
      fileName: `presence-${clubSlug}-${dateLabel}.csv`,
      csv,
      metadata: {
        datePresence: dateLabel,
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
