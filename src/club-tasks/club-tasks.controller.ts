/**
 * ============================================================
 * FICHIER : club-tasks.controller.ts
 * RÔLE    : Routes HTTP pour la gestion des tâches d'un club.
 * ============================================================
 *
 * BASE URL : /clubs/:clubId/tasks
 * Tout le controller est sous AuthGuard('jwt') → JWT obligatoire.
 *
 * ROUTES EXPOSÉES :
 *   ── LECTURE ─────────────────────────────────────────────────
 *   GET  /clubs/:clubId/tasks           → toutes les tâches du club   [RESPONSABLE uniquement]
 *   GET  /clubs/:clubId/tasks/staff     → staff assignable du club     [RESPONSABLE uniquement]
 *   GET  /clubs/:clubId/tasks/assigned  → mes tâches dans ce club      [tout membre assigné]
 *   GET  /clubs/:clubId/tasks/:taskId/comments → commentaires d'une tâche [membre ou responsable]
 *
 *   ── CRÉATION / AFFECTATION ──────────────────────────────────
 *   POST /clubs/:clubId/tasks                        → créer une tâche     [RESPONSABLE]
 *   POST /clubs/:clubId/tasks/:taskId/affecter       → affecter des membres [RESPONSABLE]
 *   POST /clubs/:clubId/tasks/:taskId/comments       → commenter une tâche  [assigné/créateur/responsable]
 *
 *   ── MODIFICATION ────────────────────────────────────────────
 *   PATCH /clubs/:clubId/tasks/:taskId/reaffecter    → réaffecter (alias POST affecter)
 *   PATCH /clubs/:clubId/tasks/:taskId/status        → changer le statut    [selon rôle]
 *   POST  /clubs/:clubId/tasks/:taskId/status        → idem (compatibilité Flutter)
 *   PATCH /clubs/:clubId/tasks/:taskId               → modifier la tâche    [RESPONSABLE]
 *   DELETE /clubs/:clubId/tasks/:taskId              → supprimer une tâche  [RESPONSABLE]
 *
 * NOTE : updateStatus existe en PATCH et POST car certaines versions de l'app Flutter
 * envoient POST au lieu de PATCH pour les changements de statut.
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
  Patch,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from 'src/auth/roles.decorator';
import { RolesGuard } from 'src/auth/roles.guard';
import { ClubTasksService } from './club-tasks.service';
import { CreateClubTaskDto } from './dto/create-club-task.dto';
import { UpdateClubTaskDto } from './dto/update-club-task.dto';
import { UpdateClubTaskStatusDto } from './dto/update-club-task-status.dto';

@Controller('clubs/:clubId/tasks')
@UseGuards(AuthGuard('jwt'))
export class ClubTasksController {
  constructor(private readonly clubTasksService: ClubTasksService) {}

  /**
   * GET /clubs/:clubId/tasks
   * Retourne toutes les tâches du club avec leurs affectations, commentaires et preuves.
   * Réservé aux responsables : vérifie via assertCanManageClub que l'utilisateur est
   * bien le coach du club (RESPONSABLE_CLUB) ou le responsable du centre (RESPONSABLE_CENTRE).
   */
  @Get()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('RESPONSABLE_CLUB', 'RESPONSABLE_CENTRE', 'ADMIN')
  async findAll(@Param('clubId') clubId: string, @Request() req: any) {
    return await this.clubTasksService.findAll(req.user.userId, clubId);
  }

  /**
   * POST /clubs/:clubId/tasks
   * Crée une nouvelle tâche dans le club.
   * Champs requis : titre, priorité (HAUTE/MOYENNE/FAIBLE), date_limite, type_tache.
   * La tâche démarre automatiquement en statut EN_ATTENTE.
   */
  @Post()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('RESPONSABLE_CLUB')
  async create(
    @Param('clubId') clubId: string,
    @Request() req: any,
    @Body() dto: CreateClubTaskDto,
  ) {
    return await this.clubTasksService.create(req.user.userId, clubId, dto);
  }

  /**
   * POST /clubs/:clubId/tasks/:taskId/affecter
   * Affecte une liste de membres à une tâche (remplace l'affectation existante).
   * Body : { utilisateurs: string[] }  → liste d'UUID des membres à affecter.
   * Envoie une notification push à chaque membre affecté.
   * Si la liste est vide → supprime toutes les affectations existantes.
   */
  @Post(':taskId/affecter')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('RESPONSABLE_CLUB')
  async affecterTask(
    @Param('clubId') clubId: string,
    @Param('taskId') taskId: string,
    @Request() req: any,
    @Body() affectationData: { utilisateurs: string[] },
  ) {
    return await this.clubTasksService.affecterTask(
      req.user.userId,
      clubId,
      taskId,
      affectationData,
    );
  }

  /**
   * PATCH /clubs/:clubId/tasks/:taskId/reaffecter
   * Alias de POST affecter — même comportement (réaffectation complète).
   * Exposé en PATCH pour respecter la sémantique REST.
   */
  @Patch(':taskId/reaffecter')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('RESPONSABLE_CLUB')
  async reaffecterTask(
    @Param('clubId') clubId: string,
    @Param('taskId') taskId: string,
    @Request() req: any,
    @Body() affectationData: { utilisateurs: string[] },
  ) {
    return await this.clubTasksService.reaffecterTask(
      req.user.userId,
      clubId,
      taskId,
      affectationData,
    );
  }

  /**
   * GET /clubs/:clubId/tasks/staff
   * Retourne le staff actif du club (is_active = true) pour le sélecteur d'affectation.
   * Utilisé dans le formulaire Flutter "Affecter cette tâche à...".
   */
  @Get('staff')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('RESPONSABLE_CLUB', 'RESPONSABLE_CENTRE', 'ADMIN')
  async getClubStaff(@Param('clubId') clubId: string, @Request() req: any) {
    return await this.clubTasksService.getClubStaff(req.user.userId, clubId);
  }

  /**
   * GET /clubs/:clubId/tasks/assigned
   * Retourne les tâches du club où L'UTILISATEUR CONNECTÉ est affecté.
   * Accessible à tout membre assigné (pas besoin d'être responsable).
   * Vérifie quand même que l'utilisateur appartient bien au staff du club.
   */
  @Get('assigned')
  async findAssigned(@Param('clubId') clubId: string, @Request() req: any) {
    return await this.clubTasksService.findAssignedTasks(
      req.user.userId,
      clubId,
    );
  }

  /**
   * PATCH /clubs/:clubId/tasks/:taskId/status
   * Change le statut d'une tâche selon la machine d'états :
   *   EN_ATTENTE → EN_COURS     (par un membre affecté)
   *   EN_COURS   → TERMINE      (par un membre affecté, avec preuves obligatoires)
   *   TERMINE    → VALIDEE      (par le coach du club uniquement)
   *   TERMINE    → REFUSE       (par le coach du club uniquement)
   *   EN_ATTENTE/EN_COURS → ANNULE  (par le responsable)
   *
   * Body : { statut: string, proofs?: [{ url, type?, filename? }] }
   * Les preuves sont obligatoires uniquement pour la transition → TERMINE.
   */
  @Patch(':taskId/status')
  async updateStatus(
    @Param('clubId') clubId: string,
    @Param('taskId') taskId: string,
    @Request() req: any,
    @Body() dto: UpdateClubTaskStatusDto,
  ) {
    return await this.clubTasksService.updateStatus(
      req.user.userId,
      req.user.role,
      clubId,
      taskId,
      dto,
    );
  }

  /**
   * POST /clubs/:clubId/tasks/:taskId/status
   * Identique à PATCH status — exposé en POST pour la compatibilité
   * avec les anciennes versions de l'app Flutter qui utilisent POST.
   */
  @Post(':taskId/status')
  async updateStatusPost(
    @Param('clubId') clubId: string,
    @Param('taskId') taskId: string,
    @Request() req: any,
    @Body() dto: UpdateClubTaskStatusDto,
  ) {
    return await this.clubTasksService.updateStatus(
      req.user.userId,
      req.user.role,
      clubId,
      taskId,
      dto,
    );
  }

  /**
   * PATCH /clubs/:clubId/tasks/:taskId
   * Modifie les champs d'une tâche existante : titre, description, priorité, date_limite, type_tache.
   * Si utilisateurs est fourni dans le body → réaffecte également la tâche.
   * Envoie une notification de modification à tous les membres concernés (créateur + assignés).
   */
  @Patch(':taskId')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('RESPONSABLE_CLUB', 'RESPONSABLE_CENTRE', 'ADMIN')
  async update(
    @Param('clubId') clubId: string,
    @Param('taskId') taskId: string,
    @Request() req: any,
    @Body() dto: UpdateClubTaskDto,
  ) {
    return await this.clubTasksService.update(
      req.user.userId,
      clubId,
      taskId,
      dto,
    );
  }

  /**
   * DELETE /clubs/:clubId/tasks/:taskId
   * Supprime définitivement une tâche (hard delete).
   * Les affectations, preuves et commentaires sont supprimés en cascade (Prisma schema).
   */
  @Delete(':taskId')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('RESPONSABLE_CLUB', 'RESPONSABLE_CENTRE', 'ADMIN')
  async remove(
    @Param('clubId') clubId: string,
    @Param('taskId') taskId: string,
    @Request() req: any,
  ) {
    return await this.clubTasksService.remove(req.user.userId, clubId, taskId);
  }

  /**
   * GET /clubs/:clubId/tasks/:taskId/comments
   * Liste les commentaires d'une tâche triés par date ASC (chronologique).
   * Accessible aux responsables, aux membres affectés, et au créateur de la tâche.
   */
  @Get(':taskId/comments')
  async listComments(
    @Param('clubId') clubId: string,
    @Param('taskId') taskId: string,
    @Request() req: any,
  ) {
    return await this.clubTasksService.listComments(
      req.user.userId,
      clubId,
      taskId,
    );
  }

  /**
   * POST /clubs/:clubId/tasks/:taskId/comments
   * Ajoute un commentaire sur une tâche.
   * Body : { message: string }
   * Accessible aux responsables, membres affectés et créateur.
   * Envoie une notification aux autres participants (sauf l'auteur du commentaire).
   */
  @Post(':taskId/comments')
  async createComment(
    @Param('clubId') clubId: string,
    @Param('taskId') taskId: string,
    @Request() req: any,
    @Body() body: { message: string },
  ) {
    return await this.clubTasksService.createComment(
      req.user.userId,
      clubId,
      taskId,
      body.message,
    );
  }
}
