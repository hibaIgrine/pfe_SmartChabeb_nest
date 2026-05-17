import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateClubTaskDto } from './dto/create-club-task.dto';
import { UpdateClubTaskDto } from './dto/update-club-task.dto';

@Injectable()
export class ClubTasksService {
  constructor(private readonly prisma: PrismaService) {}

  private async getTaskOrThrow(taskId: string, clubId: string) {
    const task = await this.prisma.club_taches.findFirst({
      where: { id: taskId, id_club: clubId },
    });

    if (!task) {
      throw new NotFoundException('Tache introuvable');
    }

    return task;
  }

  private normalizePriority(value: string): 'HAUTE' | 'MOYENNE' | 'FAIBLE' {
    const normalized = (value || '').toUpperCase().trim();

    if (!['HAUTE', 'MOYENNE', 'FAIBLE'].includes(normalized)) {
      throw new BadRequestException(
        'La priorite doit etre HAUTE, MOYENNE ou FAIBLE',
      );
    }

    return normalized as 'HAUTE' | 'MOYENNE' | 'FAIBLE';
  }

  private normalizeDateLimite(value: string): Date {
    if (!value || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}/.test(value)) {
      throw new BadRequestException(
        'date_limite doit etre une date valide au format ISO',
      );
    }

    const parsedDate = new Date(value);
    if (Number.isNaN(parsedDate.getTime())) {
      throw new BadRequestException('date_limite invalide');
    }

    return parsedDate;
  }

  private async assertCanManageClub(userId: string, clubId: string) {
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
        'Seuls les responsables du club ou du centre peuvent gerer les taches',
      );
    }

    const club = await this.prisma.clubs.findUnique({
      where: { id: clubId },
      select: { id: true, id_coach: true, id_centre: true },
    });

    if (!club) {
      throw new NotFoundException('Club introuvable');
    }

    if (user.role === 'RESPONSABLE_CLUB' && club.id_coach !== userId) {
      throw new ForbiddenException(
        'Vous ne pouvez gerer que les taches de votre club',
      );
    }

    if (
      user.role === 'RESPONSABLE_CENTRE' &&
      (!user.id_centre || club.id_centre !== user.id_centre)
    ) {
      throw new ForbiddenException(
        'Vous ne pouvez gerer que les taches des clubs de votre centre',
      );
    }
  }

  async findAll(userId: string, clubId: string) {
    await this.assertCanManageClub(userId, clubId);

    return await this.prisma.club_taches.findMany({
      where: { id_club: clubId },
      include: {
        createur: {
          select: {
            id: true,
            nom: true,
            prenom: true,
            photo_profil_url: true,
          },
        },
        affectations: {
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
      },
      orderBy: [{ date_limite: 'asc' }, { created_at: 'desc' }],
    });
  }

  async create(userId: string, clubId: string, dto: CreateClubTaskDto) {
    await this.assertCanManageClub(userId, clubId);

    const titre = dto.titre.trim();
    const description = dto.description?.trim() || null;
    const priorite = this.normalizePriority(dto.priorite);
    const dateLimite = this.normalizeDateLimite(dto.date_limite);
    const typeTache = dto.type_tache.trim();

    if (!titre) {
      throw new BadRequestException('Le titre est obligatoire');
    }

    if (!typeTache) {
      throw new BadRequestException('Le type de tache est obligatoire');
    }

    return await this.prisma.club_taches.create({
      data: {
        id_club: clubId,
        id_createur: userId,
        titre,
        description,
        priorite,
        date_limite: dateLimite,
        type_tache: typeTache,
      },
      include: {
        createur: {
          select: {
            id: true,
            nom: true,
            prenom: true,
            photo_profil_url: true,
          },
        },
      },
    });
  }

  async affecterTask(
    userId: string,
    clubId: string,
    taskId: string,
    affectationData: { utilisateurs: string[] },
  ) {
    await this.assertCanManageClub(userId, clubId);

    await this.getTaskOrThrow(taskId, clubId);

    // Supprimer les affectations existantes
    await this.prisma.club_tache_affectations.deleteMany({
      where: { id_tache: taskId },
    });

    // Créer les nouvelles affectations
    const affectations = affectationData.utilisateurs.map((utilisateurId) => ({
      id_tache: taskId,
      id_utilisateur: utilisateurId,
    }));

    return await this.prisma.club_tache_affectations.createMany({
      data: affectations,
    });
  }

  async reaffecterTask(
    userId: string,
    clubId: string,
    taskId: string,
    affectationData: { utilisateurs: string[] },
  ) {
    await this.assertCanManageClub(userId, clubId);

    await this.getTaskOrThrow(taskId, clubId);

    // Récupérer les affectations actuelles
    const affectationsActuelles =
      await this.prisma.club_tache_affectations.findMany({
        where: { id_tache: taskId },
      });

    // Supprimer les affectations qui ne sont plus dans la nouvelle liste
    const idsActuels = affectationsActuelles.map((a) => a.id_utilisateur);
    const idsNouveaux = affectationData.utilisateurs;
    const idsASupprimer = idsActuels.filter((id) => !idsNouveaux.includes(id));

    if (idsASupprimer.length > 0) {
      await this.prisma.club_tache_affectations.deleteMany({
        where: {
          id_tache: taskId,
          id_utilisateur: { in: idsASupprimer },
        },
      });
    }

    // Ajouter les nouvelles affectations
    const idsAAjouter = idsNouveaux.filter((id) => !idsActuels.includes(id));
    if (idsAAjouter.length > 0) {
      const nouvellesAffectations = idsAAjouter.map((utilisateurId) => ({
        id_tache: taskId,
        id_utilisateur: utilisateurId,
      }));

      await this.prisma.club_tache_affectations.createMany({
        data: nouvellesAffectations,
      });
    }

    return { message: 'Tâche réaffectée avec succès' };
  }

  async update(
    userId: string,
    clubId: string,
    taskId: string,
    dto: UpdateClubTaskDto,
  ) {
    await this.assertCanManageClub(userId, clubId);
    await this.getTaskOrThrow(taskId, clubId);

    const data: {
      titre?: string;
      description?: string | null;
      priorite?: 'HAUTE' | 'MOYENNE' | 'FAIBLE';
      date_limite?: Date;
      type_tache?: string;
    } = {};

    if (dto.titre !== undefined) {
      const titre = dto.titre.trim();
      if (!titre) {
        throw new BadRequestException('Le titre est obligatoire');
      }
      data.titre = titre;
    }

    if (dto.description !== undefined) {
      data.description = dto.description.trim() || null;
    }

    if (dto.priorite !== undefined) {
      data.priorite = this.normalizePriority(dto.priorite);
    }

    if (dto.date_limite !== undefined) {
      data.date_limite = this.normalizeDateLimite(dto.date_limite);
    }

    if (dto.type_tache !== undefined) {
      const typeTache = dto.type_tache.trim();
      if (!typeTache) {
        throw new BadRequestException('Le type de tache est obligatoire');
      }
      data.type_tache = typeTache;
    }

    if (Object.keys(data).length > 0) {
      await this.prisma.club_taches.update({
        where: { id: taskId },
        data,
      });
    }

    if (dto.utilisateurs !== undefined) {
      await this.affecterTask(userId, clubId, taskId, {
        utilisateurs: dto.utilisateurs,
      });
    }

    return await this.prisma.club_taches.findUnique({
      where: { id: taskId },
      include: {
        createur: {
          select: {
            id: true,
            nom: true,
            prenom: true,
            photo_profil_url: true,
          },
        },
        affectations: {
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
      },
    });
  }

  async remove(userId: string, clubId: string, taskId: string) {
    await this.assertCanManageClub(userId, clubId);
    await this.getTaskOrThrow(taskId, clubId);

    await this.prisma.club_taches.delete({
      where: { id: taskId },
    });

    return { message: 'Tache supprimee avec succes' };
  }

  async getClubStaff(userId: string, clubId: string) {
    await this.assertCanManageClub(userId, clubId);

    return await this.prisma.club_staff.findMany({
      where: {
        id_club: clubId,
        is_active: true,
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
    });
  }
}
