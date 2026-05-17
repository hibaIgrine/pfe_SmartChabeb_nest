import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateClubTaskDto } from './dto/create-club-task.dto';
import { UpdateClubTaskDto } from './dto/update-club-task.dto';
import { UpdateClubTaskStatusDto } from './dto/update-club-task-status.dto';

type TaskStatus =
  | 'EN_ATTENTE'
  | 'EN_COURS'
  | 'TERMINE'
  | 'VALIDEE'
  | 'REFUSE'
  | 'ANNULE';

@Injectable()
export class ClubTasksService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly taskInclude = {
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
  };

  private async getTaskOrThrow(taskId: string, clubId: string) {
    const task = await this.prisma.club_taches.findFirst({
      where: { id: taskId, id_club: clubId },
    });

    if (!task) {
      throw new NotFoundException('Tache introuvable');
    }

    return task;
  }

  private async getTaskWithRelationsOrThrow(taskId: string, clubId: string) {
    const task = await this.prisma.club_taches.findFirst({
      where: { id: taskId, id_club: clubId },
      include: this.taskInclude,
    });

    if (!task) {
      throw new NotFoundException('Tache introuvable');
    }

    return {
      ...task,
      statut: this.normalizeStoredStatus(task.statut),
    };
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

  private normalizeStoredStatus(value: string | null | undefined): TaskStatus {
    const normalized = (value || '').toUpperCase().trim();

    if (normalized === 'A_FAIRE') {
      return 'EN_ATTENTE';
    }

    if (
      ![
        'EN_ATTENTE',
        'EN_COURS',
        'TERMINE',
        'VALIDEE',
        'REFUSE',
        'ANNULE',
      ].includes(normalized)
    ) {
      return 'EN_ATTENTE';
    }

    return normalized as TaskStatus;
  }

  private normalizeTaskStatus(value: string): TaskStatus {
    const normalized = this.normalizeStoredStatus(value);

    if (
      ![
        'EN_ATTENTE',
        'EN_COURS',
        'TERMINE',
        'VALIDEE',
        'REFUSE',
        'ANNULE',
      ].includes(normalized)
    ) {
      throw new BadRequestException('Statut de tache invalide');
    }

    return normalized;
  }

  private assertStatusTransition(params: {
    currentStatus: TaskStatus;
    nextStatus: TaskStatus;
    role: string;
  }) {
    const current = this.normalizeTaskStatus(params.currentStatus);
    const next = this.normalizeTaskStatus(params.nextStatus);
    const role = (params.role || '').toUpperCase();

    if (current === next) {
      return;
    }

    const isManager =
      role === 'RESPONSABLE_CLUB' ||
      role === 'RESPONSABLE_CENTRE' ||
      role === 'ADMIN';

    if (isManager) {
      if (current !== 'TERMINE' || !['VALIDEE', 'REFUSE'].includes(next)) {
        throw new BadRequestException(
          'Le responsable ne peut valider ou refuser qu une tache terminee',
        );
      }
      return;
    }

    if (next === 'EN_COURS') {
      if (current !== 'EN_ATTENTE') {
        throw new BadRequestException(
          'Une tache ne peut passer en cours que depuis le statut en attente',
        );
      }
      return;
    }

    if (next === 'TERMINE') {
      if (current !== 'EN_COURS') {
        throw new BadRequestException(
          'Une tache ne peut etre terminee que depuis le statut en cours',
        );
      }
      return;
    }

    if (next === 'ANNULE') {
      if (!['EN_ATTENTE', 'EN_COURS'].includes(current)) {
        throw new BadRequestException(
          'Une tache ne peut etre annulee que depuis les statuts en attente ou en cours',
        );
      }
      return;
    }

    throw new BadRequestException('Transition de statut non autorisee');
  }

  private async getTaskByClubAndUser(
    taskId: string,
    clubId: string,
    userId: string,
  ) {
    const task = await this.prisma.club_taches.findFirst({
      where: {
        id: taskId,
        id_club: clubId,
        affectations: {
          some: { id_utilisateur: userId },
        },
      },
      include: this.taskInclude,
    });

    if (!task) {
      throw new NotFoundException('Tache introuvable');
    }

    return {
      ...task,
      statut: this.normalizeStoredStatus(task.statut),
    };
  }

  private async getTaskForStatusChange(taskId: string, clubId: string) {
    return await this.prisma.club_taches.findFirst({
      where: { id: taskId, id_club: clubId },
    });
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

    const tasks = await this.prisma.club_taches.findMany({
      where: { id_club: clubId },
      include: this.taskInclude,
      orderBy: [{ date_limite: 'asc' }, { created_at: 'desc' }],
    });

    return tasks.map((task) => ({
      ...task,
      statut: this.normalizeStoredStatus(task.statut),
    }));
  }

  async findAssignedTasks(userId: string, clubId: string) {
    const assignedInClub = await this.prisma.club_staff.findFirst({
      where: { id_club: clubId, id_utilisateur: userId, is_active: true },
    });

    const isManager = await this.prisma.utilisateurs.findFirst({
      where: {
        id: userId,
        role: { in: ['RESPONSABLE_CLUB', 'RESPONSABLE_CENTRE', 'ADMIN'] },
      },
      select: { id: true },
    });

    if (!assignedInClub && !isManager) {
      throw new ForbiddenException(
        'Vous ne pouvez consulter que les taches de votre club',
      );
    }

    const tasks = await this.prisma.club_taches.findMany({
      where: {
        id_club: clubId,
        affectations: {
          some: { id_utilisateur: userId },
        },
      },
      include: this.taskInclude,
      orderBy: [{ date_limite: 'asc' }, { created_at: 'desc' }],
    });

    return tasks.map((task) => ({
      ...task,
      statut: this.normalizeStoredStatus(task.statut),
    }));
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
        statut: 'EN_ATTENTE',
      },
      include: this.taskInclude,
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

    await this.prisma.club_tache_affectations.deleteMany({
      where: { id_tache: taskId },
    });

    const utilisateurs = Array.isArray(affectationData.utilisateurs)
      ? affectationData.utilisateurs
      : [];

    if (utilisateurs.length === 0) {
      return { message: 'Aucune affectation ajoutee' };
    }

    return await this.prisma.club_tache_affectations.createMany({
      data: utilisateurs.map((utilisateurId) => ({
        id_tache: taskId,
        id_utilisateur: utilisateurId,
      })),
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

    const affectationsActuelles =
      await this.prisma.club_tache_affectations.findMany({
        where: { id_tache: taskId },
      });

    const idsActuels = affectationsActuelles.map((a) => a.id_utilisateur);
    const idsNouveaux = Array.isArray(affectationData.utilisateurs)
      ? affectationData.utilisateurs
      : [];
    const idsASupprimer = idsActuels.filter((id) => !idsNouveaux.includes(id));

    if (idsASupprimer.length > 0) {
      await this.prisma.club_tache_affectations.deleteMany({
        where: {
          id_tache: taskId,
          id_utilisateur: { in: idsASupprimer },
        },
      });
    }

    const idsAAjouter = idsNouveaux.filter((id) => !idsActuels.includes(id));
    if (idsAAjouter.length > 0) {
      await this.prisma.club_tache_affectations.createMany({
        data: idsAAjouter.map((utilisateurId) => ({
          id_tache: taskId,
          id_utilisateur: utilisateurId,
        })),
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

    return await this.getTaskWithRelationsOrThrow(taskId, clubId);
  }

  async updateStatus(
    userId: string,
    role: string,
    clubId: string,
    taskId: string,
    dto: UpdateClubTaskStatusDto,
  ) {
    const currentUser = await this.prisma.utilisateurs.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (!currentUser) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    const effectiveRole = (role || currentUser.role || '').toUpperCase();
    const isManager = [
      'RESPONSABLE_CLUB',
      'RESPONSABLE_CENTRE',
      'ADMIN',
    ].includes(effectiveRole);

    const task = isManager
      ? await this.getTaskForStatusChange(taskId, clubId)
      : await this.getTaskByClubAndUser(taskId, clubId, userId);

    if (!task) {
      throw new NotFoundException('Tache introuvable');
    }

    const nextStatus = this.normalizeTaskStatus(dto.statut);
    const currentStatus = this.normalizeStoredStatus(task.statut);

    this.assertStatusTransition({
      currentStatus,
      nextStatus,
      role: effectiveRole,
    });

    const updated = await this.prisma.club_taches.update({
      where: { id: taskId },
      data: { statut: nextStatus },
      include: this.taskInclude,
    });

    return {
      ...updated,
      statut: this.normalizeStoredStatus(updated.statut),
    };
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
