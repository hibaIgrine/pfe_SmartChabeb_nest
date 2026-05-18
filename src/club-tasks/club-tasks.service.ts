import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { NotificationsService } from 'src/notifications/notifications.service';
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  private readonly taskInclude = {
    club: {
      select: {
        id: true,
        nom: true,
      },
    },
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
    commentaires: {
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

  private async getUserFullName(userId: string) {
    const user = await this.prisma.utilisateurs.findUnique({
      where: { id: userId },
      select: { nom: true, prenom: true },
    });

    if (!user) {
      return 'Utilisateur inconnu';
    }

    return `${user.prenom} ${user.nom}`.trim();
  }

  private async safeCreateTaskNotification(
    payload: Parameters<NotificationsService['createClubTaskNotification']>[0],
  ) {
    try {
      await this.notificationsService.createClubTaskNotification(payload);
    } catch (err) {
      console.error('Erreur creation notification tache :', err);
    }
  }

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
    const taskBefore = await this.getTaskWithRelationsOrThrow(taskId, clubId);
    const existingAssigneeIds = taskBefore.affectations.map(
      (affectation) => affectation.utilisateur.id,
    );

    await this.prisma.club_tache_affectations.deleteMany({
      where: { id_tache: taskId },
    });

    const utilisateurs = Array.isArray(affectationData.utilisateurs)
      ? affectationData.utilisateurs
      : [];

    if (utilisateurs.length === 0) {
      return { message: 'Aucune affectation ajoutee' };
    }

    await this.prisma.club_tache_affectations.createMany({
      data: utilisateurs.map((utilisateurId) => ({
        id_tache: taskId,
        id_utilisateur: utilisateurId,
      })),
    });

    const refreshedTask = await this.getTaskWithRelationsOrThrow(
      taskId,
      clubId,
    );
    const actorName = await this.getUserFullName(userId);
    const currentAssignees = refreshedTask.affectations.map((affectation) => ({
      id: affectation.utilisateur.id,
      name: `${affectation.utilisateur.prenom} ${affectation.utilisateur.nom}`.trim(),
    }));
    const assigneeNames = currentAssignees
      .map((assignee) => assignee.name)
      .join(', ');
    const isInitialAssignment = existingAssigneeIds.length === 0;
    const creatorId = refreshedTask.createur?.id;
    const creatorShouldReceive =
      creatorId &&
      !currentAssignees.some((assignee) => assignee.id === creatorId);
    const title = isInitialAssignment
      ? 'Nouvelle tache affectee'
      : 'Affectation de tache mise a jour';
    const message = isInitialAssignment
      ? `La tache ${refreshedTask.titre}${refreshedTask.club?.nom ? ` (${refreshedTask.club.nom})` : ''} a ete affectee a ${assigneeNames} par ${actorName}.`
      : `L'affectation de la tache ${refreshedTask.titre}${refreshedTask.club?.nom ? ` (${refreshedTask.club.nom})` : ''} a ete mise a jour par ${actorName}. Nouveaux membres affectes: ${assigneeNames}.`;

    await Promise.all(
      currentAssignees.map((assignee) =>
        this.safeCreateTaskNotification({
          utilisateurId: assignee.id,
          type: 'TASK_ASSIGNED',
          titre: title,
          message,
          data: {
            taskId: refreshedTask.id,
            taskTitle: refreshedTask.titre,
            clubId: refreshedTask.club?.id ?? clubId,
            clubNom: refreshedTask.club?.nom ?? null,
            assignedById: userId,
            assignedByNomComplet: actorName,
            dateLimite: refreshedTask.date_limite.toISOString(),
          },
        }),
      ),
    );

    if (creatorShouldReceive && creatorId) {
      await this.safeCreateTaskNotification({
        utilisateurId: creatorId,
        type: 'TASK_ASSIGNED',
        titre: title,
        message,
        data: {
          taskId: refreshedTask.id,
          taskTitle: refreshedTask.titre,
          clubId: refreshedTask.club?.id ?? clubId,
          clubNom: refreshedTask.club?.nom ?? null,
          assignedById: userId,
          assignedByNomComplet: actorName,
          dateLimite: refreshedTask.date_limite.toISOString(),
        },
      });
    }

    return { message: 'Tâche affectée avec succès' };
  }

  async reaffecterTask(
    userId: string,
    clubId: string,
    taskId: string,
    affectationData: { utilisateurs: string[] },
  ) {
    return await this.affecterTask(userId, clubId, taskId, affectationData);
  }

  async update(
    userId: string,
    clubId: string,
    taskId: string,
    dto: UpdateClubTaskDto,
  ) {
    await this.assertCanManageClub(userId, clubId);
    const taskBefore = await this.getTaskWithRelationsOrThrow(taskId, clubId);

    const data: {
      titre?: string;
      description?: string | null;
      priorite?: 'HAUTE' | 'MOYENNE' | 'FAIBLE';
      date_limite?: Date;
      type_tache?: string;
    } = {};
    const changes: string[] = [];

    if (dto.titre !== undefined) {
      const titre = dto.titre.trim();
      if (!titre) {
        throw new BadRequestException('Le titre est obligatoire');
      }
      data.titre = titre;
      if (titre !== taskBefore.titre) {
        changes.push('titre');
      }
    }

    if (dto.description !== undefined) {
      const description = dto.description.trim() || null;
      data.description = description;
      const previousDescription = taskBefore.description || null;
      if (description !== previousDescription) {
        changes.push('description');
      }
    }

    if (dto.priorite !== undefined) {
      const priorite = this.normalizePriority(dto.priorite);
      data.priorite = priorite;
      if (priorite !== taskBefore.priorite) {
        changes.push('priorite');
      }
    }

    if (dto.date_limite !== undefined) {
      const dateLimite = this.normalizeDateLimite(dto.date_limite);
      data.date_limite = dateLimite;
      if (dateLimite.getTime() !== taskBefore.date_limite.getTime()) {
        changes.push('date limite');
      }
    }

    if (dto.type_tache !== undefined) {
      const typeTache = dto.type_tache.trim();
      if (!typeTache) {
        throw new BadRequestException('Le type de tache est obligatoire');
      }
      data.type_tache = typeTache;
      if (typeTache !== taskBefore.type_tache) {
        changes.push('type de tache');
      }
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

      const updatedTask = await this.getTaskWithRelationsOrThrow(
        taskId,
        clubId,
      );
      const actorName = await this.getUserFullName(userId);
      const recipientMap = new Map<string, string>();

      if (updatedTask.createur?.id) {
        recipientMap.set(
          updatedTask.createur.id,
          `${updatedTask.createur.prenom} ${updatedTask.createur.nom}`.trim(),
        );
      }

      updatedTask.affectations.forEach((affectation) => {
        recipientMap.set(
          affectation.utilisateur.id,
          `${affectation.utilisateur.prenom} ${affectation.utilisateur.nom}`.trim(),
        );
      });

      if (changes.length > 0) {
        const changeLabel = changes.join(', ');
        await Promise.all(
          Array.from(recipientMap.entries()).map(([recipientId]) =>
            this.safeCreateTaskNotification({
              utilisateurId: recipientId,
              type: 'TASK_UPDATED',
              titre: 'Tache modifiee',
              message: `La tache ${updatedTask.titre}${updatedTask.club?.nom ? ` (${updatedTask.club.nom})` : ''} a ete modifiee: ${changeLabel}.`,
              data: {
                taskId: updatedTask.id,
                taskTitle: updatedTask.titre,
                clubId: updatedTask.club?.id ?? clubId,
                clubNom: updatedTask.club?.nom ?? null,
                changes,
                updatedById: userId,
                updatedByNomComplet: actorName,
                dateLimite: updatedTask.date_limite.toISOString(),
              },
            }),
          ),
        );
      }

      return updatedTask;
    }

    const updatedTask = await this.getTaskWithRelationsOrThrow(taskId, clubId);
    const actorName = await this.getUserFullName(userId);

    if (changes.length > 0) {
      const recipientMap = new Map<string, string>();

      if (updatedTask.createur?.id) {
        recipientMap.set(
          updatedTask.createur.id,
          `${updatedTask.createur.prenom} ${updatedTask.createur.nom}`.trim(),
        );
      }

      updatedTask.affectations.forEach((affectation) => {
        recipientMap.set(
          affectation.utilisateur.id,
          `${affectation.utilisateur.prenom} ${affectation.utilisateur.nom}`.trim(),
        );
      });

      const changeLabel = changes.join(', ');
      await Promise.all(
        Array.from(recipientMap.entries()).map(([recipientId]) =>
          this.safeCreateTaskNotification({
            utilisateurId: recipientId,
            type: 'TASK_UPDATED',
            titre: 'Tache modifiee',
            message: `La tache ${updatedTask.titre}${updatedTask.club?.nom ? ` (${updatedTask.club.nom})` : ''} a ete modifiee: ${changeLabel}.`,
            data: {
              taskId: updatedTask.id,
              taskTitle: updatedTask.titre,
              clubId: updatedTask.club?.id ?? clubId,
              clubNom: updatedTask.club?.nom ?? null,
              changes,
              updatedById: userId,
              updatedByNomComplet: actorName,
              dateLimite: updatedTask.date_limite.toISOString(),
            },
          }),
        ),
      );
    }

    return updatedTask;
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

    if (nextStatus === 'TERMINE') {
      const actorName = await this.getUserFullName(userId);
      const recipients = new Map<string, string>();

      if (updated.createur?.id && updated.createur.id !== userId) {
        recipients.set(
          updated.createur.id,
          `${updated.createur.prenom} ${updated.createur.nom}`.trim(),
        );
      }

      updated.affectations.forEach((affectation) => {
        const assigneeId = affectation.utilisateur.id;
        if (assigneeId !== userId) {
          recipients.set(
            assigneeId,
            `${affectation.utilisateur.prenom} ${affectation.utilisateur.nom}`.trim(),
          );
        }
      });

      await Promise.all(
        Array.from(recipients.entries()).map(([recipientId]) =>
          this.safeCreateTaskNotification({
            utilisateurId: recipientId,
            type: 'TASK_COMPLETED',
            titre: 'Tache terminee',
            message: `La tache ${updated.titre}${updated.club?.nom ? ` (${updated.club.nom})` : ''} a ete marquee terminee par ${actorName}.`,
            data: {
              taskId: updated.id,
              taskTitle: updated.titre,
              clubId: updated.club?.id ?? clubId,
              clubNom: updated.club?.nom ?? null,
              completedById: userId,
              completedByNomComplet: actorName,
              dateLimite: updated.date_limite.toISOString(),
            },
          }),
        ),
      );
    }

    // If a manager validated or refused a task (transition TERMINE -> VALIDEE|REFUSE),
    // notify all assigned staff about the decision.
    if (isManager && (nextStatus === 'VALIDEE' || nextStatus === 'REFUSE')) {
      const actorName = await this.getUserFullName(userId);
      const decision = nextStatus === 'VALIDEE' ? 'validee' : 'refusee';

      const assigneeRecipients: Array<{ id: string; name: string }> = [];
      updated.affectations.forEach((affectation) => {
        const assigneeId = affectation.utilisateur.id;
        if (assigneeId !== userId) {
          assigneeRecipients.push({
            id: assigneeId,
            name: `${affectation.utilisateur.prenom} ${affectation.utilisateur.nom}`.trim(),
          });
        }
      });

      if (assigneeRecipients.length > 0) {
        const title =
          nextStatus === 'VALIDEE' ? 'Tache validee' : 'Tache refusee';
        const message =
          nextStatus === 'VALIDEE'
            ? `La tache ${updated.titre}${updated.club?.nom ? ` (${updated.club.nom})` : ''} a ete validee par ${actorName}.`
            : `La tache ${updated.titre}${updated.club?.nom ? ` (${updated.club.nom})` : ''} a ete refusee par ${actorName}.`;

        await Promise.all(
          assigneeRecipients.map((recipient) =>
            this.safeCreateTaskNotification({
              utilisateurId: recipient.id,
              type: 'TASK_UPDATED',
              titre: title,
              message,
              data: {
                taskId: updated.id,
                taskTitle: updated.titre,
                clubId: updated.club?.id ?? clubId,
                clubNom: updated.club?.nom ?? null,
                decision: nextStatus,
                decidedById: userId,
                decidedByNomComplet: actorName,
                dateLimite: updated.date_limite.toISOString(),
              },
            }),
          ),
        );
      }
    }

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

  // Comments
  async listComments(userId: string, clubId: string, taskId: string) {
    // allow if user is manager or assigned in club
    const isManager = await this.prisma.utilisateurs.findFirst({
      where: {
        id: userId,
        role: { in: ['RESPONSABLE_CLUB', 'RESPONSABLE_CENTRE', 'ADMIN'] },
      },
      select: { id: true },
    });

    const assigned = await this.prisma.club_tache_affectations.findFirst({
      where: { id_tache: taskId, id_utilisateur: userId },
      select: { id: true },
    });

    if (!isManager && !assigned) {
      // still allow creator of the task
      const task = await this.prisma.club_taches.findFirst({
        where: { id: taskId, id_createur: userId, id_club: clubId },
        select: { id: true },
      });
      if (!task)
        throw new ForbiddenException(
          'Acces refuse aux commentaires de la tache',
        );
    }

    return (this.prisma as any).club_tache_commentaires.findMany({
      where: { id_tache: taskId },
      include: {
        utilisateur: {
          select: { id: true, nom: true, prenom: true, photo_profil_url: true },
        },
      },
      orderBy: { created_at: 'asc' },
    });
  }

  async createComment(
    userId: string,
    clubId: string,
    taskId: string,
    message: string,
  ) {
    if (!message || !message.trim()) {
      throw new BadRequestException('Le message est obligatoire');
    }

    // verify user can comment: manager or assigned or creator
    const isManager = await this.prisma.utilisateurs.findFirst({
      where: {
        id: userId,
        role: { in: ['RESPONSABLE_CLUB', 'RESPONSABLE_CENTRE', 'ADMIN'] },
      },
      select: { id: true },
    });

    const assigned = await this.prisma.club_tache_affectations.findFirst({
      where: { id_tache: taskId, id_utilisateur: userId },
      select: { id: true },
    });

    const isCreator = await this.prisma.club_taches.findFirst({
      where: { id: taskId, id_createur: userId, id_club: clubId },
      select: { id: true },
    });

    if (!isManager && !assigned && !isCreator) {
      throw new ForbiddenException('Vous ne pouvez pas commenter cette tache');
    }

    const created = await (this.prisma as any).club_tache_commentaires.create({
      data: {
        id_tache: taskId,
        id_utilisateur: userId,
        message: message.trim(),
      },
      include: {
        utilisateur: {
          select: { id: true, nom: true, prenom: true, photo_profil_url: true },
        },
      },
    });

    // Optionally notify other participants (assigned + createur except sender)
    try {
      const task = await this.getTaskWithRelationsOrThrow(taskId, clubId);
      const actorName = await this.getUserFullName(userId);
      const recipients = new Map<string, string>();
      if (task.createur?.id && task.createur.id !== userId) {
        recipients.set(
          task.createur.id,
          `${task.createur.prenom} ${task.createur.nom}`.trim(),
        );
      }
      task.affectations.forEach((a) => {
        if (a.utilisateur.id !== userId) {
          recipients.set(
            a.utilisateur.id,
            `${a.utilisateur.prenom} ${a.utilisateur.nom}`.trim(),
          );
        }
      });

      if (recipients.size > 0) {
        const title = 'Nouveau commentaire sur la tache';
        const messageText = `${actorName} a ajoute un commentaire sur la tache ${task.titre}.`;
        await Promise.all(
          Array.from(recipients.keys()).map((recipientId) =>
            this.safeCreateTaskNotification({
              utilisateurId: recipientId,
              type: 'TASK_UPDATED',
              titre: title,
              message: messageText,
              data: {
                taskId: task.id,
                taskTitle: task.titre,
                clubId: task.club?.id ?? clubId,
                clubNom: task.club?.nom ?? null,
                commentAuthorId: userId,
                commentAuthorNomComplet: actorName,
              },
            }),
          ),
        );
      }
    } catch (err) {
      console.error('Erreur notification commentaire:', err);
    }

    return created;
  }
}
