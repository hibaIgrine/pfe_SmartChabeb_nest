/**
 * ============================================================
 * FICHIER : club-tasks.service.ts
 * RÔLE    : Logique métier de la gestion des tâches de club.
 * ============================================================
 *
 * CONCEPT : MACHINE D'ÉTATS DES TÂCHES
 * ─────────────────────────────────────
 *   EN_ATTENTE ──► EN_COURS ──► TERMINE ──► VALIDEE
 *                                       └──► REFUSE
 *   Depuis EN_ATTENTE ou EN_COURS ──► ANNULE
 *
 * ACTEURS ET DROITS :
 *   - Membre affecté     : peut passer EN_ATTENTE→EN_COURS, EN_COURS→TERMINE (avec preuves)
 *   - Coach du club      : peut VALIDER ou REFUSER une tâche TERMINÉE, et ANNULER
 *   - RESPONSABLE_CENTRE : peut gérer les tâches de tous les clubs de son centre
 *   - ADMIN              : accès total
 *
 * PREUVES D'ACHÈVEMENT :
 *   Quand un membre marque une tâche TERMINÉE, il DOIT fournir au moins une preuve
 *   (photo ou document) stockée dans la table club_tache_preuves.
 *   La création de la preuve et la mise à jour du statut se font dans une $transaction.
 *
 * NOTIFICATIONS PUSH (via NotificationsService) :
 *   - Lors d'une affectation     → notif TASK_ASSIGNED à chaque assigné (+ créateur)
 *   - Lors d'une modification    → notif TASK_UPDATED  à créateur + assignés
 *   - Lors de TERMINE            → notif TASK_COMPLETED au créateur + co-assignés
 *   - Lors de VALIDEE / REFUSE   → notif TASK_UPDATED  aux assignés
 *   - Lors d'un nouveau commentaire → notif TASK_UPDATED aux participants sauf l'auteur
 *
 * HELPERS PRIVÉS :
 *   getUserFullName()           → prénom + nom pour les messages de notif
 *   safeCreateTaskNotification() → wrapper try/catch autour de NotificationsService
 *   getTaskOrThrow()            → findFirst(id+clubId) ou NotFoundException
 *   getTaskWithRelationsOrThrow() → idem avec taskInclude + normalizeStoredStatus
 *   normalizePriority()         → valide HAUTE/MOYENNE/FAIBLE
 *   normalizeDateLimite()       → valide et parse la date ISO
 *   normalizeStoredStatus()     → A_FAIRE → EN_ATTENTE (compatibilité ancienne BDD)
 *   normalizeTaskStatus()       → valide la valeur de statut
 *   assertStatusTransition()    → machine d'états : valide la transition selon rôle
 *   getTaskByClubAndUser()      → tâche accessible uniquement si assigné
 *   getTaskForStatusChange()    → tâche brute sans vérification d'affectation
 *   assertCanManageClub()       → vérifie que l'user est bien coach du club ou resp. centre
 *
 * MÉTHODES PUBLIQUES :
 *   findAll()                   → toutes les tâches du club (responsables)
 *   findAssignedTasks()         → mes tâches dans un club
 *   findAssignedTasksAcrossClubs() → mes tâches dans TOUS les clubs
 *   create()                    → créer une tâche
 *   affecterTask()              → affecter (remplace les affectations existantes)
 *   reaffecterTask()            → alias d'affecterTask
 *   update()                    → modifier une tâche (+ réaffectation optionnelle)
 *   updateStatus()              → changer le statut (avec validation machine d'états)
 *   remove()                    → supprimer une tâche
 *   getClubStaff()              → staff actif du club (pour le sélecteur)
 *   listComments()              → commentaires d'une tâche
 *   createComment()             → ajouter un commentaire
 */

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

/** Statuts valides d'une tâche de club */
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

  /**
   * OBJET D'INCLUDE RÉUTILISABLE pour les requêtes Prisma.
   * Toujours inclus lors des lectures de tâches :
   *   - club           → nom du club pour les notifications
   *   - createur       → qui a créé la tâche
   *   - affectations   → liste des membres assignés (avec leur profil)
   *   - commentaires   → historique des échanges (avec auteur)
   *   - preuves        → photos/docs d'achèvement (avec auteur)
   */
  private readonly taskInclude = {
    club: {
      select: { id: true, nom: true, id_coach: true },
    },
    createur: {
      select: { id: true, nom: true, prenom: true, photo_profil_url: true },
    },
    affectations: {
      include: {
        utilisateur: {
          select: { id: true, nom: true, prenom: true, photo_profil_url: true },
        },
      },
    },
    commentaires: {
      include: {
        utilisateur: {
          select: { id: true, nom: true, prenom: true, photo_profil_url: true },
        },
      },
    },
    preuves: {
      include: {
        utilisateur: {
          select: { id: true, nom: true, prenom: true, photo_profil_url: true },
        },
      },
    },
  };

  // ─── HELPERS PRIVÉS ──────────────────────────────────────────────────────────

  /** Récupère le nom complet (prénom + nom) d'un utilisateur pour les messages de notification. */
  private async getUserFullName(userId: string) {
    const user = await this.prisma.utilisateurs.findUnique({
      where: { id: userId },
      select: { nom: true, prenom: true },
    });
    if (!user) return 'Utilisateur inconnu';
    return `${user.prenom} ${user.nom}`.trim();
  }

  /**
   * WRAPPER SÉCURISÉ pour les notifications.
   * Les erreurs de notifications ne doivent JAMAIS annuler l'opération principale.
   * → try/catch qui absorbe l'erreur et log en console.
   */
  private async safeCreateTaskNotification(
    payload: Parameters<NotificationsService['createClubTaskNotification']>[0],
  ) {
    try {
      await this.notificationsService.createClubTaskNotification(payload);
    } catch (err) {
      console.error('Erreur creation notification tache :', err);
    }
  }

  /** Charge une tâche (sans relations) — lance 404 si inexistante dans ce club. */
  private async getTaskOrThrow(taskId: string, clubId: string) {
    const task = await this.prisma.club_taches.findFirst({
      where: { id: taskId, id_club: clubId },
    });
    if (!task) throw new NotFoundException('Tache introuvable');
    return task;
  }

  /**
   * Charge une tâche AVEC toutes ses relations (taskInclude).
   * Normalise aussi le statut (A_FAIRE → EN_ATTENTE pour compatibilité BDD).
   */
  private async getTaskWithRelationsOrThrow(taskId: string, clubId: string) {
    const task = await this.prisma.club_taches.findFirst({
      where: { id: taskId, id_club: clubId },
      include: this.taskInclude,
    });
    if (!task) throw new NotFoundException('Tache introuvable');
    return { ...task, statut: this.normalizeStoredStatus(task.statut) };
  }

  /**
   * VALIDER LA PRIORITÉ
   * Accepte uniquement : HAUTE, MOYENNE, FAIBLE (en majuscules).
   * Lance BadRequestException si invalide.
   */
  private normalizePriority(value: string): 'HAUTE' | 'MOYENNE' | 'FAIBLE' {
    const normalized = (value || '').toUpperCase().trim();
    if (!['HAUTE', 'MOYENNE', 'FAIBLE'].includes(normalized)) {
      throw new BadRequestException(
        'La priorite doit etre HAUTE, MOYENNE ou FAIBLE',
      );
    }
    return normalized as 'HAUTE' | 'MOYENNE' | 'FAIBLE';
  }

  /**
   * VALIDER ET PARSER LA DATE LIMITE
   * Accepte les formats ISO (YYYY-MM-DD ou YYYY-MM-DDTHH:mm:ss).
   * Lance BadRequestException si le format est invalide.
   */
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

  /**
   * NORMALISER UN STATUT LU DEPUIS LA BDD
   * Compatibilité : l'ancien système stockait 'A_FAIRE' → on le convertit en 'EN_ATTENTE'.
   * Si le statut est inconnu → on retourne 'EN_ATTENTE' par défaut (évite les crashes).
   */
  private normalizeStoredStatus(value: string | null | undefined): TaskStatus {
    const normalized = (value || '').toUpperCase().trim();
    if (normalized === 'A_FAIRE') return 'EN_ATTENTE';
    if (!['EN_ATTENTE', 'EN_COURS', 'TERMINE', 'VALIDEE', 'REFUSE', 'ANNULE'].includes(normalized)) {
      return 'EN_ATTENTE';
    }
    return normalized as TaskStatus;
  }

  /**
   * VALIDER UN STATUT FOURNI PAR LE CLIENT
   * Contrairement à normalizeStoredStatus, ici une valeur invalide lance une exception.
   */
  private normalizeTaskStatus(value: string): TaskStatus {
    const normalized = this.normalizeStoredStatus(value);
    if (!['EN_ATTENTE', 'EN_COURS', 'TERMINE', 'VALIDEE', 'REFUSE', 'ANNULE'].includes(normalized)) {
      throw new BadRequestException('Statut de tache invalide');
    }
    return normalized;
  }

  /**
   * MACHINE D'ÉTATS : VALIDER UNE TRANSITION DE STATUT
   * Règles (appliquées dans cet ordre) :
   *
   *   même statut → pas de changement → OK silencieux
   *   → EN_COURS  : seulement depuis EN_ATTENTE  (membre affecté, vérifié dans updateStatus)
   *   → TERMINE   : seulement depuis EN_COURS    (membre affecté, preuves requises)
   *   → VALIDEE / REFUSE : seulement depuis TERMINE, et seulement par un responsable
   *   → ANNULE    : depuis EN_ATTENTE ou EN_COURS uniquement
   *
   * Lance BadRequestException ou ForbiddenException si la transition est illégale.
   */
  private assertStatusTransition(params: {
    currentStatus: TaskStatus;
    nextStatus: TaskStatus;
    role: string;
  }) {
    const current = this.normalizeTaskStatus(params.currentStatus);
    const next    = this.normalizeTaskStatus(params.nextStatus);
    const role    = (params.role || '').toUpperCase();
    if (current === next) return; // Pas de changement → toujours valide

    const isManager = ['RESPONSABLE_CLUB', 'RESPONSABLE_CENTRE', 'ADMIN'].includes(role);

    if (next === 'EN_COURS') {
      if (current !== 'EN_ATTENTE')
        throw new BadRequestException('Une tache ne peut passer en cours que depuis le statut en attente');
      return;
    }

    if (next === 'TERMINE') {
      if (current !== 'EN_COURS')
        throw new BadRequestException('Une tache ne peut etre terminee que depuis le statut en cours');
      return;
    }

    if (['VALIDEE', 'REFUSE'].includes(next)) {
      if (!isManager)
        throw new ForbiddenException('Seul un responsable peut valider ou refuser une tache');
      if (current !== 'TERMINE')
        throw new BadRequestException('Le responsable ne peut valider ou refuser qu une tache terminee');
      return;
    }

    if (next === 'ANNULE') {
      if (!['EN_ATTENTE', 'EN_COURS'].includes(current))
        throw new BadRequestException('Une tache ne peut etre annulee que depuis les statuts en attente ou en cours');
      return;
    }

    throw new BadRequestException('Transition de statut non autorisee');
  }

  /**
   * Charge une tâche en vérifiant que l'utilisateur est bien assigné à elle.
   * Utilisé pour les lectures "mes tâches" — interdit l'accès aux non-assignés.
   */
  private async getTaskByClubAndUser(taskId: string, clubId: string, userId: string) {
    const task = await this.prisma.club_taches.findFirst({
      where: {
        id: taskId,
        id_club: clubId,
        affectations: { some: { id_utilisateur: userId } },
      },
      include: this.taskInclude,
    });
    if (!task) throw new NotFoundException('Tache introuvable');
    return { ...task, statut: this.normalizeStoredStatus(task.statut) };
  }

  /** Charge une tâche brute pour les changements de statut (sans filtrage par assigné). */
  private async getTaskForStatusChange(taskId: string, clubId: string) {
    return await this.prisma.club_taches.findFirst({
      where: { id: taskId, id_club: clubId },
    });
  }

  /**
   * VÉRIFIER LE DROIT DE GÉRER UN CLUB
   * Règles :
   *   - RESPONSABLE_CLUB    → doit être le coach (id_coach) du club concerné
   *   - RESPONSABLE_CENTRE  → le club doit être dans son centre
   *   - Autre rôle          → ForbiddenException
   *
   * Lance NotFoundException si l'utilisateur ou le club n'existe pas.
   */
  private async assertCanManageClub(userId: string, clubId: string) {
    const user = await this.prisma.utilisateurs.findUnique({
      where: { id: userId },
      select: { role: true, id_centre: true },
    });
    if (!user) throw new NotFoundException('Utilisateur introuvable');

    if (user.role !== 'RESPONSABLE_CLUB' && user.role !== 'RESPONSABLE_CENTRE') {
      throw new ForbiddenException(
        'Seuls les responsables du club ou du centre peuvent gerer les taches',
      );
    }

    const club = await this.prisma.clubs.findUnique({
      where: { id: clubId },
      select: { id: true, id_coach: true, id_centre: true },
    });
    if (!club) throw new NotFoundException('Club introuvable');

    if (user.role === 'RESPONSABLE_CLUB' && club.id_coach !== userId) {
      throw new ForbiddenException('Vous ne pouvez gerer que les taches de votre club');
    }

    if (user.role === 'RESPONSABLE_CENTRE' && (!user.id_centre || club.id_centre !== user.id_centre)) {
      throw new ForbiddenException('Vous ne pouvez gerer que les taches des clubs de votre centre');
    }
  }

  // ─── MÉTHODES PUBLIQUES ───────────────────────────────────────────────────────

  /**
   * TOUTES LES TÂCHES DU CLUB
   * Réservé aux responsables (assertCanManageClub).
   * Triées par date_limite ASC puis created_at DESC.
   * Le statut est normalisé (A_FAIRE → EN_ATTENTE) pour chaque tâche.
   */
  async findAll(userId: string, clubId: string) {
    await this.assertCanManageClub(userId, clubId);
    const tasks = await this.prisma.club_taches.findMany({
      where: { id_club: clubId },
      include: this.taskInclude,
      orderBy: [{ date_limite: 'asc' }, { created_at: 'desc' }],
    });
    return tasks.map((task) => ({ ...task, statut: this.normalizeStoredStatus(task.statut) }));
  }

  /**
   * MES TÂCHES DANS UN CLUB PRÉCIS
   * Accessible aux membres assignés ET aux responsables (isManager bypass).
   * Filtre les tâches où l'utilisateur a une affectation (club_tache_affectations).
   */
  async findAssignedTasks(userId: string, clubId: string) {
    const assignedInClub = await this.prisma.club_staff.findFirst({
      where: { id_club: clubId, id_utilisateur: userId, is_active: true },
    });

    const isManager = await this.prisma.utilisateurs.findFirst({
      where: { id: userId, role: { in: ['RESPONSABLE_CLUB', 'RESPONSABLE_CENTRE', 'ADMIN'] } },
      select: { id: true },
    });

    if (!assignedInClub && !isManager) {
      throw new ForbiddenException('Vous ne pouvez consulter que les taches de votre club');
    }

    const tasks = await this.prisma.club_taches.findMany({
      where: { id_club: clubId, affectations: { some: { id_utilisateur: userId } } },
      include: this.taskInclude,
      orderBy: [{ date_limite: 'asc' }, { created_at: 'desc' }],
    });

    return tasks.map((task) => ({ ...task, statut: this.normalizeStoredStatus(task.statut) }));
  }

  /**
   * MES TÂCHES DANS TOUS LES CLUBS (vue globale)
   * Pas de filtre par club — retourne toutes les tâches assignées à cet utilisateur.
   * Utilisé par StaffTasksController GET /staff/tasks/assigned.
   */
  async findAssignedTasksAcrossClubs(userId: string) {
    const tasks = await this.prisma.club_taches.findMany({
      where: { affectations: { some: { id_utilisateur: userId } } },
      include: this.taskInclude,
      orderBy: [{ date_limite: 'asc' }, { created_at: 'desc' }],
    });
    return tasks.map((task) => ({ ...task, statut: this.normalizeStoredStatus(task.statut) }));
  }

  /**
   * CRÉER UNE TÂCHE
   * Réservé aux responsables (assertCanManageClub).
   * Normalise et valide tous les champs avant insertion.
   * La tâche est créée avec statut = 'EN_ATTENTE'.
   * Retourne la tâche avec toutes ses relations (taskInclude).
   */
  async create(userId: string, clubId: string, dto: CreateClubTaskDto) {
    await this.assertCanManageClub(userId, clubId);

    const titre       = dto.titre.trim();
    const description = dto.description?.trim() || null;
    const priorite    = this.normalizePriority(dto.priorite);
    const dateLimite  = this.normalizeDateLimite(dto.date_limite);
    const typeTache   = dto.type_tache.trim();

    if (!titre)     throw new BadRequestException('Le titre est obligatoire');
    if (!typeTache) throw new BadRequestException('Le type de tache est obligatoire');

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

  /**
   * AFFECTER DES MEMBRES À UNE TÂCHE
   * Remplace COMPLÈTEMENT les affectations existantes (deleteMany → createMany).
   * Si la liste utilisateurs est vide → toutes les affectations sont supprimées.
   *
   * Flux :
   *   1. Vérifier le droit de gérer le club
   *   2. Récupérer les affectations AVANT (pour savoir si c'est une première affectation)
   *   3. Supprimer toutes les affectations existantes
   *   4. Créer les nouvelles affectations
   *   5. Recharger la tâche (pour avoir les noms des assignés)
   *   6. Envoyer une notification TASK_ASSIGNED à chaque assigné
   *   7. Si le créateur n'est pas dans les assignés → aussi lui envoyer la notif
   *
   * Le message de notification diffère selon si c'est une 1ère affectation
   * ou une mise à jour d'affectation.
   */
  async affecterTask(
    userId: string,
    clubId: string,
    taskId: string,
    affectationData: { utilisateurs: string[] },
  ) {
    await this.assertCanManageClub(userId, clubId);
    const taskBefore = await this.getTaskWithRelationsOrThrow(taskId, clubId);
    const existingAssigneeIds = taskBefore.affectations.map((a) => a.utilisateur.id);

    // Remplacement complet
    await this.prisma.club_tache_affectations.deleteMany({ where: { id_tache: taskId } });

    const utilisateurs = Array.isArray(affectationData.utilisateurs)
      ? affectationData.utilisateurs : [];
    if (utilisateurs.length === 0) return { message: 'Aucune affectation ajoutee' };

    await this.prisma.club_tache_affectations.createMany({
      data: utilisateurs.map((utilisateurId) => ({ id_tache: taskId, id_utilisateur: utilisateurId })),
    });

    const refreshedTask = await this.getTaskWithRelationsOrThrow(taskId, clubId);
    const actorName = await this.getUserFullName(userId);
    const currentAssignees = refreshedTask.affectations.map((a) => ({
      id: a.utilisateur.id,
      name: `${a.utilisateur.prenom} ${a.utilisateur.nom}`.trim(),
    }));
    const assigneeNames = currentAssignees.map((a) => a.name).join(', ');
    const isInitialAssignment = existingAssigneeIds.length === 0;
    const creatorId = refreshedTask.createur?.id;
    const creatorShouldReceive = creatorId && !currentAssignees.some((a) => a.id === creatorId);

    const title   = isInitialAssignment ? 'Nouvelle tache affectee' : 'Affectation de tache mise a jour';
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

    // Notifier aussi le créateur s'il n'est pas dans les assignés
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

  /** RÉAFFECTER UNE TÂCHE — alias d'affecterTask (même comportement). */
  async reaffecterTask(
    userId: string,
    clubId: string,
    taskId: string,
    affectationData: { utilisateurs: string[] },
  ) {
    return await this.affecterTask(userId, clubId, taskId, affectationData);
  }

  /**
   * MODIFIER UNE TÂCHE
   * Permet de changer : titre, description, priorité, date_limite, type_tache.
   * Si dto.utilisateurs est fourni → réaffecte en même temps (appel à affecterTask).
   *
   * Suivi des changements (changes[]) :
   *   Identifie quels champs ont réellement changé pour construire le message de notif.
   *   Si aucun champ ne change → aucune notification envoyée.
   *
   * Destinataires des notifications : créateur + tous les assignés (Map pour dédupliquer).
   */
  async update(userId: string, clubId: string, taskId: string, dto: UpdateClubTaskDto) {
    await this.assertCanManageClub(userId, clubId);
    const taskBefore = await this.getTaskWithRelationsOrThrow(taskId, clubId);

    const data: {
      titre?: string; description?: string | null;
      priorite?: 'HAUTE' | 'MOYENNE' | 'FAIBLE'; date_limite?: Date; type_tache?: string;
    } = {};
    const changes: string[] = [];

    if (dto.titre !== undefined) {
      const titre = dto.titre.trim();
      if (!titre) throw new BadRequestException('Le titre est obligatoire');
      data.titre = titre;
      if (titre !== taskBefore.titre) changes.push('titre');
    }

    if (dto.description !== undefined) {
      const description = dto.description.trim() || null;
      data.description = description;
      if (description !== (taskBefore.description || null)) changes.push('description');
    }

    if (dto.priorite !== undefined) {
      const priorite = this.normalizePriority(dto.priorite);
      data.priorite = priorite;
      if (priorite !== taskBefore.priorite) changes.push('priorite');
    }

    if (dto.date_limite !== undefined) {
      const dateLimite = this.normalizeDateLimite(dto.date_limite);
      data.date_limite = dateLimite;
      if (dateLimite.getTime() !== taskBefore.date_limite.getTime()) changes.push('date limite');
    }

    if (dto.type_tache !== undefined) {
      const typeTache = dto.type_tache.trim();
      if (!typeTache) throw new BadRequestException('Le type de tache est obligatoire');
      data.type_tache = typeTache;
      if (typeTache !== taskBefore.type_tache) changes.push('type de tache');
    }

    if (Object.keys(data).length > 0) {
      await this.prisma.club_taches.update({ where: { id: taskId }, data });
    }

    // Si réaffectation incluse → déléguer à affecterTask (qui envoie ses propres notifs)
    if (dto.utilisateurs !== undefined) {
      await this.affecterTask(userId, clubId, taskId, { utilisateurs: dto.utilisateurs });

      const updatedTask = await this.getTaskWithRelationsOrThrow(taskId, clubId);
      const actorName = await this.getUserFullName(userId);
      const recipientMap = new Map<string, string>();

      if (updatedTask.createur?.id)
        recipientMap.set(updatedTask.createur.id, `${updatedTask.createur.prenom} ${updatedTask.createur.nom}`.trim());
      updatedTask.affectations.forEach((a) =>
        recipientMap.set(a.utilisateur.id, `${a.utilisateur.prenom} ${a.utilisateur.nom}`.trim()),
      );

      if (changes.length > 0) {
        await Promise.all(
          Array.from(recipientMap.entries()).map(([recipientId]) =>
            this.safeCreateTaskNotification({
              utilisateurId: recipientId,
              type: 'TASK_UPDATED',
              titre: 'Tache modifiee',
              message: `La tache ${updatedTask.titre}${updatedTask.club?.nom ? ` (${updatedTask.club.nom})` : ''} a ete modifiee: ${changes.join(', ')}.`,
              data: {
                taskId: updatedTask.id, taskTitle: updatedTask.titre,
                clubId: updatedTask.club?.id ?? clubId, clubNom: updatedTask.club?.nom ?? null,
                changes, updatedById: userId, updatedByNomComplet: actorName,
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
      if (updatedTask.createur?.id)
        recipientMap.set(updatedTask.createur.id, `${updatedTask.createur.prenom} ${updatedTask.createur.nom}`.trim());
      updatedTask.affectations.forEach((a) =>
        recipientMap.set(a.utilisateur.id, `${a.utilisateur.prenom} ${a.utilisateur.nom}`.trim()),
      );

      await Promise.all(
        Array.from(recipientMap.entries()).map(([recipientId]) =>
          this.safeCreateTaskNotification({
            utilisateurId: recipientId,
            type: 'TASK_UPDATED',
            titre: 'Tache modifiee',
            message: `La tache ${updatedTask.titre}${updatedTask.club?.nom ? ` (${updatedTask.club.nom})` : ''} a ete modifiee: ${changes.join(', ')}.`,
            data: {
              taskId: updatedTask.id, taskTitle: updatedTask.titre,
              clubId: updatedTask.club?.id ?? clubId, clubNom: updatedTask.club?.nom ?? null,
              changes, updatedById: userId, updatedByNomComplet: actorName,
              dateLimite: updatedTask.date_limite.toISOString(),
            },
          }),
        ),
      );
    }

    return updatedTask;
  }

  /**
   * CHANGER LE STATUT D'UNE TÂCHE
   * C'est la méthode la plus complexe — elle applique la machine d'états complète.
   *
   * Flux :
   *   1. Charger l'utilisateur → récupérer son rôle effectif
   *   2. Charger la tâche (sans vérification d'affectation ici)
   *   3. Normaliser currentStatus et nextStatus
   *   4. Valider la transition (assertStatusTransition)
   *   5. Si EN_COURS ou TERMINE → vérifier que l'utilisateur est bien assigné
   *   6. Si VALIDEE ou REFUSE   → vérifier que l'utilisateur est le coach du club
   *
   *   Cas TERMINE (dans $transaction) :
   *     a. Valider qu'au moins une preuve est fournie (url non vide)
   *     b. Créer les preuves dans club_tache_preuves
   *     c. Mettre à jour le statut
   *     → Atomique : si la création des preuves échoue, le statut reste EN_COURS
   *
   *   Notifications après mise à jour :
   *     - TERMINE  → notif TASK_COMPLETED au créateur + co-assignés (sauf l'auteur)
   *     - VALIDEE / REFUSE → notif TASK_UPDATED aux assignés (sauf le coach qui statue)
   */
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
    if (!currentUser) throw new NotFoundException('Utilisateur introuvable');

    const effectiveRole = (role || currentUser.role || '').toUpperCase();
    const task = await this.getTaskForStatusChange(taskId, clubId);
    if (!task) throw new NotFoundException('Tache introuvable');

    const nextStatus    = this.normalizeTaskStatus(dto.statut);
    const currentStatus = this.normalizeStoredStatus(task.statut);

    this.assertStatusTransition({ currentStatus, nextStatus, role: effectiveRole });

    // EN_COURS / TERMINE : seuls les membres affectés peuvent agir
    if (['EN_COURS', 'TERMINE'].includes(nextStatus)) {
      const assigned = await this.prisma.club_tache_affectations.findFirst({
        where: { id_tache: taskId, id_utilisateur: userId },
        select: { id: true },
      });
      if (!assigned)
        throw new ForbiddenException('Seuls les membres affectés à la tâche peuvent la commencer ou la terminer');
    }

    // VALIDEE / REFUSE : seul le coach du club peut statuer (sauf ADMIN)
    if (['VALIDEE', 'REFUSE'].includes(nextStatus)) {
      if (effectiveRole !== 'ADMIN') {
        const club = await this.prisma.clubs.findUnique({
          where: { id: clubId },
          select: { id_coach: true },
        });
        if (club?.id_coach !== userId)
          throw new ForbiddenException('Seul le responsable du club peut valider ou refuser une tâche');
      }
    }

    let updated: any = task;

    // TERMINE : créer les preuves d'achèvement dans une transaction atomique
    if (nextStatus === 'TERMINE') {
      const proofs = (dto as any).proofs as Array<{ url: string; type?: string; filename?: string }> | undefined;
      const validProofs = (proofs || []).filter(
        (proof) => typeof proof?.url === 'string' && proof.url.trim().length > 0,
      );

      console.log('[club-tasks][updateStatus]', {
        taskId, clubId, userId, role: effectiveRole, nextStatus,
        proofsReceived: Array.isArray(proofs) ? proofs.length : null,
        validProofs: validProofs.length,
        dtoKeys: dto ? Object.keys(dto as Record<string, any>) : [],
      });

      if (!validProofs.length)
        throw new BadRequestException('Une preuve (photo ou document) est requise pour marquer la tache comme terminee');
      if (proofs && validProofs.length !== proofs.length)
        throw new BadRequestException('Chaque preuve doit contenir une url valide');

      updated = await this.prisma.$transaction(async (tx) => {
        await tx.club_tache_preuves.createMany({
          data: validProofs.map((p) => ({
            id_tache: taskId, id_utilisateur: userId,
            url: p.url.trim(), type: p.type ?? null, filename: p.filename ?? null,
          })),
        });
        return await tx.club_taches.update({
          where: { id: taskId },
          data: { statut: nextStatus },
          include: this.taskInclude,
        });
      });
    } else {
      updated = await this.prisma.club_taches.update({
        where: { id: taskId },
        data: { statut: nextStatus },
        include: this.taskInclude,
      });
    }

    // Notification pour TERMINE
    if (nextStatus === 'TERMINE') {
      const actorName = await this.getUserFullName(userId);
      const recipients = new Map<string, string>();
      if (updated.createur?.id && updated.createur.id !== userId)
        recipients.set(updated.createur.id, `${updated.createur.prenom} ${updated.createur.nom}`.trim());
      updated.affectations.forEach((a) => {
        if (a.utilisateur.id !== userId)
          recipients.set(a.utilisateur.id, `${a.utilisateur.prenom} ${a.utilisateur.nom}`.trim());
      });

      await Promise.all(
        Array.from(recipients.entries()).map(([recipientId]) =>
          this.safeCreateTaskNotification({
            utilisateurId: recipientId,
            type: 'TASK_COMPLETED',
            titre: 'Tache terminee',
            message: `La tache ${updated.titre}${updated.club?.nom ? ` (${updated.club.nom})` : ''} a ete marquee terminee par ${actorName}.`,
            data: {
              taskId: updated.id, taskTitle: updated.titre,
              clubId: updated.club?.id ?? clubId, clubNom: updated.club?.nom ?? null,
              completedById: userId, completedByNomComplet: actorName,
              dateLimite: updated.date_limite.toISOString(),
            },
          }),
        ),
      );
    }

    // Notification pour VALIDEE / REFUSE
    if (nextStatus === 'VALIDEE' || nextStatus === 'REFUSE') {
      const actorName = await this.getUserFullName(userId);
      const assigneeRecipients: Array<{ id: string; name: string }> = [];
      updated.affectations.forEach((a) => {
        if (a.utilisateur.id !== userId)
          assigneeRecipients.push({ id: a.utilisateur.id, name: `${a.utilisateur.prenom} ${a.utilisateur.nom}`.trim() });
      });

      if (assigneeRecipients.length > 0) {
        const title   = nextStatus === 'VALIDEE' ? 'Tache validee' : 'Tache refusee';
        const message = nextStatus === 'VALIDEE'
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
                taskId: updated.id, taskTitle: updated.titre,
                clubId: updated.club?.id ?? clubId, clubNom: updated.club?.nom ?? null,
                decision: nextStatus, decidedById: userId, decidedByNomComplet: actorName,
                dateLimite: updated.date_limite.toISOString(),
              },
            }),
          ),
        );
      }
    }

    return { ...updated, statut: this.normalizeStoredStatus(updated.statut) };
  }

  /**
   * SUPPRIMER UNE TÂCHE
   * Hard delete — les affectations, preuves et commentaires sont supprimés en cascade.
   * Vérifie les droits (assertCanManageClub) et l'existence de la tâche.
   */
  async remove(userId: string, clubId: string, taskId: string) {
    await this.assertCanManageClub(userId, clubId);
    await this.getTaskOrThrow(taskId, clubId);
    await this.prisma.club_taches.delete({ where: { id: taskId } });
    return { message: 'Tache supprimee avec succes' };
  }

  /**
   * STAFF ASSIGNABLE DU CLUB
   * Retourne les membres actifs du staff (is_active = true) avec leur profil.
   * Utilisé pour alimenter le sélecteur "Affecter à..." dans le formulaire Flutter.
   */
  async getClubStaff(userId: string, clubId: string) {
    await this.assertCanManageClub(userId, clubId);
    return await this.prisma.club_staff.findMany({
      where: { id_club: clubId, is_active: true },
      include: {
        utilisateur: {
          select: { id: true, nom: true, prenom: true, photo_profil_url: true },
        },
      },
    });
  }

  /**
   * LISTER LES COMMENTAIRES D'UNE TÂCHE
   * Accès autorisé si l'utilisateur est : responsable OU assigné OU créateur de la tâche.
   * Triés par date ASC (ordre chronologique de conversation).
   */
  async listComments(userId: string, clubId: string, taskId: string) {
    const isManager = await this.prisma.utilisateurs.findFirst({
      where: { id: userId, role: { in: ['RESPONSABLE_CLUB', 'RESPONSABLE_CENTRE', 'ADMIN'] } },
      select: { id: true },
    });
    const assigned = await this.prisma.club_tache_affectations.findFirst({
      where: { id_tache: taskId, id_utilisateur: userId },
      select: { id: true },
    });

    if (!isManager && !assigned) {
      const task = await this.prisma.club_taches.findFirst({
        where: { id: taskId, id_createur: userId, id_club: clubId },
        select: { id: true },
      });
      if (!task) throw new ForbiddenException('Acces refuse aux commentaires de la tache');
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

  /**
   * AJOUTER UN COMMENTAIRE SUR UNE TÂCHE
   * Accès autorisé si : responsable OU assigné OU créateur.
   *
   * Après création du commentaire → notification push aux autres participants
   * (créateur + assignés, sauf l'auteur du commentaire lui-même).
   * Dans try/catch séparé : si la notif échoue, le commentaire est quand même créé.
   */
  async createComment(userId: string, clubId: string, taskId: string, message: string) {
    if (!message || !message.trim()) throw new BadRequestException('Le message est obligatoire');

    const isManager = await this.prisma.utilisateurs.findFirst({
      where: { id: userId, role: { in: ['RESPONSABLE_CLUB', 'RESPONSABLE_CENTRE', 'ADMIN'] } },
      select: { id: true },
    });
    const assigned  = await this.prisma.club_tache_affectations.findFirst({
      where: { id_tache: taskId, id_utilisateur: userId },
      select: { id: true },
    });
    const isCreator = await this.prisma.club_taches.findFirst({
      where: { id: taskId, id_createur: userId, id_club: clubId },
      select: { id: true },
    });

    if (!isManager && !assigned && !isCreator)
      throw new ForbiddenException('Vous ne pouvez pas commenter cette tache');

    const created = await (this.prisma as any).club_tache_commentaires.create({
      data: { id_tache: taskId, id_utilisateur: userId, message: message.trim() },
      include: {
        utilisateur: {
          select: { id: true, nom: true, prenom: true, photo_profil_url: true },
        },
      },
    });

    // Notifier les autres participants
    try {
      const task      = await this.getTaskWithRelationsOrThrow(taskId, clubId);
      const actorName = await this.getUserFullName(userId);
      const recipients = new Map<string, string>();
      if (task.createur?.id && task.createur.id !== userId)
        recipients.set(task.createur.id, `${task.createur.prenom} ${task.createur.nom}`.trim());
      task.affectations.forEach((a) => {
        if (a.utilisateur.id !== userId)
          recipients.set(a.utilisateur.id, `${a.utilisateur.prenom} ${a.utilisateur.nom}`.trim());
      });

      if (recipients.size > 0) {
        await Promise.all(
          Array.from(recipients.keys()).map((recipientId) =>
            this.safeCreateTaskNotification({
              utilisateurId: recipientId,
              type: 'TASK_UPDATED',
              titre: 'Nouveau commentaire sur la tache',
              message: `${actorName} a ajoute un commentaire sur la tache ${task.titre}.`,
              data: {
                taskId: task.id, taskTitle: task.titre,
                clubId: task.club?.id ?? clubId, clubNom: task.club?.nom ?? null,
                commentAuthorId: userId, commentAuthorNomComplet: actorName,
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
