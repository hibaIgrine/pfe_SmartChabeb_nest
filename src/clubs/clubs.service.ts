import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { NotificationsService } from 'src/notifications/notifications.service';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class ClubsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

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

  async create(data: any) {
    return await this.prisma.$transaction(async (tx) => {
      let finalLogoUrl = data.logo_url
        ? this.saveBase64Image(data.logo_url)
        : undefined;
      let finalPlanning =
        typeof data.planning === 'string'
          ? { texte: data.planning }
          : data.planning;

      const nouveauClub = await tx.clubs.create({
        data: {
          nom: data.nom,
          description: data.description,
          categorie: data.categorie,
          id_centre: data.id_centre, // 💡 id_salle -> id_centre
          id_coach: data.id_coach || undefined,
          planning: finalPlanning,
          logo_url: finalLogoUrl,
          capacite: data.capacite ? parseInt(data.capacite) : null,
          locale_fixe: data.locale_fixe, // 💡 Mis à jour
        },
      });

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
    return await this.prisma.clubs.findMany({
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
        _count: { select: { inscriptions: true } },
      },
      orderBy: { nom: 'asc' },
    });
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

    return {
      ...club,
      staff,
      inscriptions,
    };
  }

  async update(id: string, data: any) {
    let finalLogoUrl = data.logo_url;
    if (finalLogoUrl && finalLogoUrl.startsWith('data:image')) {
      finalLogoUrl = this.saveBase64Image(finalLogoUrl);
    }

    let finalPlanning = data.planning;
    if (finalPlanning && typeof finalPlanning === 'string') {
      finalPlanning = { texte: finalPlanning };
    }

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
        locale_fixe: data.locale_fixe,
      },
    });
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
          capacite: true,
          _count: {
            select: { inscriptions: { where: { statut: 'ACCEPTE' } } },
          },
        },
      });

      if (!club) throw new NotFoundException('Club introuvable');

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
