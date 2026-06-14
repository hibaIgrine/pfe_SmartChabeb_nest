/**
 * ============================================================
 * FICHIER : clubs.controller.ts
 * RÔLE    : Routes HTTP pour la gestion des clubs.
 * ============================================================
 *
 * ⚠️  ORDRE DES ROUTES — RÈGLE CRITIQUE DE NESTJS ⚠️
 * NestJS résout les routes dans l'ordre où elles sont déclarées.
 * Une route statique comme GET /clubs/my-inscriptions DOIT être déclarée
 * AVANT la route dynamique GET /clubs/:id, sinon NestJS croit que
 * "my-inscriptions" est un ID et appelle la mauvaise méthode.
 *
 * ORDRE RESPECTÉ :
 *   1. Routes statiques avec chemins fixes (/my-inscriptions, /my-centre...)
 *   2. Routes générales sans paramètre (GET /)
 *   3. Routes avec sous-chemins spécifiques (/inscription/:id/...)
 *   4. Routes avec paramètre générique (:id) → EN DERNIER
 *
 * ROUTES EXPOSÉES :
 *   ── LECTURE (mon profil de club) ──────────────────────────
 *   GET /clubs/my-inscriptions        → mes clubs en tant que membre
 *   GET /clubs/my-staff-clubs         → clubs où je suis staff
 *   GET /clubs/my-centre              → clubs actifs de mon centre (avec mon statut)
 *   GET /clubs/my-centre/:id          → détails d'un club de mon centre
 *   GET /clubs                        → tous les clubs (filtre par id_centre possible)
 *   GET /clubs/:id                    → détails complets d'un club (public)
 *
 *   ── INSCRIPTION ──────────────────────────────────────────
 *   POST  /clubs/:id/apply                → postuler à un club
 *   PATCH /clubs/inscription/:id/status   → valider/refuser une candidature
 *   PATCH /clubs/inscription/:id/suspend  → suspendre un membre
 *   PATCH /clubs/inscription/:id/reactivate → réactiver un membre suspendu
 *   DELETE /clubs/inscription/:id         → supprimer une inscription (admin)
 *   DELETE /clubs/:id/leave               → quitter un club (membre)
 *
 *   ── ADMINISTRATION (ADMIN / RESPONSABLE_CENTRE) ──────────
 *   POST   /clubs                         → créer un club
 *   PATCH  /clubs/:id                     → modifier un club
 *   PATCH  /clubs/:id/activate            → réactiver un club désactivé
 *   PATCH  /clubs/:id/start               → valider le démarrage du club
 *   PATCH  /clubs/:id/assign-coach        → assigner un coach
 *   DELETE /clubs/:id                     → désactiver un club (soft delete)
 *
 *   ── STAFF DU CLUB ────────────────────────────────────────
 *   POST  /clubs/:id/staff                → ajouter un membre au staff
 *   PATCH /clubs/:id/staff/:staffId/deactivate → désactiver un staff
 *   PATCH /clubs/:id/staff/:staffId/reactivate → réactiver un staff
 */

import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common';
import { ClubsService } from './clubs.service';
import { Roles } from 'src/auth/roles.decorator';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from 'src/auth/roles.guard';

@Controller('clubs')
export class ClubsController {
  constructor(private readonly clubsService: ClubsService) {}

  // ─── GROUPE 1 : ROUTES STATIQUES (EN PREMIER — avant les :id) ────────────────

  /**
   * GET /clubs/my-inscriptions
   * Retourne tous les clubs auxquels l'utilisateur connecté est inscrit,
   * avec le statut de son inscription (EN_ATTENTE, ACCEPTE, REFUSE, LISTE_ATTENTE).
   * ⚠️ Doit être AVANT GET /clubs/:id pour que "my-inscriptions" ne soit pas
   * interprété comme un ID.
   */
  @Get('my-inscriptions')
  @UseGuards(AuthGuard('jwt'))
  async getMyInscriptions(@Request() req) {
    return await this.clubsService.findMyClubs(req.user.userId);
  }

  /**
   * GET /clubs/my-centre
   * Retourne tous les clubs ACTIFS du centre auquel l'utilisateur est rattaché.
   * Inclut pour chaque club : mon inscription personnelle (my_inscription),
   * le staff actif, le start_status (progression vers le démarrage).
   */
  @Get('my-centre')
  @UseGuards(AuthGuard('jwt'))
  async getMyCentreClubs(@Request() req) {
    return await this.clubsService.findClubsForUserCentre(req.user.userId);
  }

  /**
   * GET /clubs/my-staff-clubs
   * Retourne les clubs où l'utilisateur connecté est membre du staff (is_active = true).
   * Utilisé pour la vue "Mes clubs gérés" dans l'app Flutter.
   */
  @Get('my-staff-clubs')
  @UseGuards(AuthGuard('jwt'))
  async getMyStaffClubs(@Request() req: any) {
    return await this.clubsService.findMyStaffClubs(req.user.userId);
  }

  /**
   * GET /clubs/my-centre/:id
   * Retourne les détails d'un club spécifique appartenant au centre de l'utilisateur.
   * Vérifie que le club est bien dans son centre (sécurité : pas d'accès cross-centre).
   * Inclut : staff, mon inscription, start_status.
   */
  @Get('my-centre/:id')
  @UseGuards(AuthGuard('jwt'))
  async getMyCentreClubDetails(@Param('id') id: string, @Request() req) {
    return await this.clubsService.findClubForUserCentre(req.user.userId, id);
  }

  // ─── GROUPE 2 : ROUTES GÉNÉRALES ─────────────────────────────────────────────

  /**
   * GET /clubs?id_salle=<uuid>
   * Retourne tous les clubs, avec filtre optionnel par centre (paramètre id_salle
   * hérite de l'ancienne terminologie mais correspond à id_centre).
   * Inclut : responsable, centre, inscriptions, _count ACCEPTÉ, start_status.
   * Route publique (pas de JWT requis).
   */
  @Get()
  findAll(@Query('id_salle') id_salle?: string) {
    return this.clubsService.findAll(id_salle);
  }

  // ─── GROUPE 3 : ROUTES /inscription/* (sous-chemins spécifiques) ─────────────

  /**
   * PATCH /clubs/inscription/:id/status
   * Change le statut d'une inscription (EN_ATTENTE → ACCEPTE ou REFUSE).
   * Si ACCEPTE et capacité dépassée → erreur 409.
   * Après décision → envoie une notification push au membre concerné.
   */
  @Patch('inscription/:id/status')
  @UseGuards(AuthGuard('jwt'))
  async updateInscriptionStatus(
    @Param('id') id: string,
    @Body('statut') statut: string,
    @Request() req: any,
  ) {
    return await this.clubsService.updateInscriptionStatus(id, statut, req.user.userId);
  }

  /**
   * PATCH /clubs/inscription/:id/suspend
   * Suspend temporairement un membre d'un club.
   * Enregistre : est_suspendu = true + date_fin_suspension + motif_suspension.
   * Body : { dateFin: 'YYYY-MM-DD', motif: string }
   */
  @Patch('inscription/:id/suspend')
  @UseGuards(AuthGuard('jwt'))
  async suspend(
    @Param('id') id: string,
    @Body() data: { dateFin: string; motif: string },
  ) {
    return await this.clubsService.suspendMember(id, data);
  }

  /**
   * PATCH /clubs/inscription/:id/reactivate
   * Réactive un membre suspendu : est_suspendu = false, efface la suspension.
   */
  @Patch('inscription/:id/reactivate')
  @UseGuards(AuthGuard('jwt'))
  async reactivate(@Param('id') id: string) {
    return await this.clubsService.reactivateMember(id);
  }

  /**
   * DELETE /clubs/inscription/:id
   * Supprime une inscription par son ID (action admin / responsable).
   * Si le club avait une liste d'attente, le premier de la liste passe automatiquement
   * en statut EN_ATTENTE (promotion de file d'attente).
   */
  @Delete('inscription/:id')
  @UseGuards(AuthGuard('jwt'))
  async removeInscription(@Param('id') id: string) {
    return await this.clubsService.removeInscription(id);
  }

  // ─── GROUPE 4 : ROUTES AVEC :id/*  (sous-routes d'un club spécifique) ────────

  /**
   * DELETE /clubs/:id/leave
   * L'utilisateur connecté quitte un club (supprime sa propre inscription).
   */
  @Delete(':id/leave')
  @UseGuards(AuthGuard('jwt'))
  async leaveClub(@Param('id') clubId: string, @Request() req: any) {
    return await this.clubsService.leaveClub(req.user.userId, clubId);
  }

  /**
   * POST /clubs/:id/staff
   * Ajoute un utilisateur au staff d'un club avec un rôle dans le club.
   * Si l'utilisateur est déjà dans le staff (même club) → on met à jour son rôle.
   * Le rôle est créé automatiquement dans club_roles s'il n'existe pas (upsert).
   */
  @Post(':id/staff')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN', 'RESPONSABLE_CENTRE', 'RESPONSABLE_CLUB')
  async addStaffToClub(
    @Param('id') clubId: string,
    @Body() body: { id_utilisateur: string; role_dans_club: string },
  ) {
    return await this.clubsService.addStaffToClub(clubId, body);
  }

  /**
   * PATCH /clubs/:id/staff/:staffId/deactivate
   * Désactive un membre du staff (is_active = false) sans le supprimer.
   */
  @Patch(':id/staff/:staffId/deactivate')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN', 'RESPONSABLE_CENTRE', 'RESPONSABLE_CLUB')
  async deactivateStaff(
    @Param('id') clubId: string,
    @Param('staffId') staffId: string,
  ) {
    return await this.clubsService.deactivateStaff(clubId, staffId);
  }

  /**
   * PATCH /clubs/:id/staff/:staffId/reactivate
   * Réactive un membre du staff (is_active = true).
   */
  @Patch(':id/staff/:staffId/reactivate')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN', 'RESPONSABLE_CENTRE', 'RESPONSABLE_CLUB')
  async reactivateStaff(
    @Param('id') clubId: string,
    @Param('staffId') staffId: string,
  ) {
    return await this.clubsService.reactivateStaff(clubId, staffId);
  }

  // ─── GROUPE 5 : ROUTES GÉNÉRIQUES :id (EN DERNIER) ───────────────────────────

  /**
   * GET /clubs/:id
   * Retourne les détails complets d'un club : centre, responsable, staff, inscriptions.
   * Les utilisateurs staff et inscrits sont récupérés en une seule requête groupée
   * puis associés via une Map (optimisation : évite N+1 requêtes).
   * Valide que l'ID est un UUID avant d'interroger la BDD.
   */
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.clubsService.findOne(id);
  }

  /**
   * PATCH /clubs/:id/activate
   * Réactive un club désactivé (est_actif = true).
   */
  @Patch(':id/activate')
  activate(@Param('id') id: string) {
    return this.clubsService.activate(id);
  }

  /**
   * PATCH /clubs/:id/start
   * Valide le démarrage officiel d'un club (workflow de démarrage).
   * Vérifie que le nombre de participants ACCEPTÉS atteint le minimum requis.
   * Met is_started = true dans le planning JSON + enregistre qui a validé et quand.
   * Réservé à ADMIN et RESPONSABLE_CENTRE (qui ne peut valider que son propre centre).
   */
  @Patch(':id/start')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN', 'RESPONSABLE_CENTRE')
  validateStart(@Param('id') id: string, @Request() req: any) {
    return this.clubsService.validateClubStart(id, req.user.userId, req.user.role);
  }

  /**
   * PATCH /clubs/:id/assign-coach
   * Assigne ou retire un coach à un club (coachId = null pour retirer).
   * Réservé à ADMIN et RESPONSABLE_CENTRE.
   */
  @Patch(':id/assign-coach')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN', 'RESPONSABLE_CENTRE')
  async assignCoach(@Param('id') id: string, @Body('coachId') coachId: string | null) {
    return this.clubsService.assignCoach(id, coachId ?? null);
  }

  /**
   * PATCH /clubs/:id
   * Met à jour les informations d'un club existant.
   * Si le logo est envoyé en Base64 → il est converti en fichier et l'URL est mise à jour.
   * Le planning et le nom_dataset sont recalculés automatiquement.
   */
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.clubsService.update(id, body);
  }

  /**
   * DELETE /clubs/:id
   * Désactive un club (soft delete : est_actif = false).
   * Les données (inscriptions, staff, planning) sont conservées.
   */
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.clubsService.remove(id);
  }

  /**
   * POST /clubs/:id/apply
   * L'utilisateur connecté postule pour rejoindre un club.
   * Vérifie que l'utilisateur est dans le même centre que le club.
   * Si le club est plein → inscription en LISTE_ATTENTE.
   * Si une candidature existait et était REFUSÉE → elle est réouverte.
   */
  @Post(':id/apply')
  @UseGuards(AuthGuard('jwt'))
  async applyToClub(@Param('id') clubId: string, @Request() req: any) {
    return await this.clubsService.applyToClub(req.user.userId, clubId);
  }

  /**
   * POST /clubs
   * Crée un nouveau club.
   * - RESPONSABLE_CENTRE : le centre est automatiquement résolu (son propre centre)
   * - ADMIN : doit fournir id_centre dans le body
   * Crée aussi les réservations récurrentes du planning si un local est spécifié.
   * Tout se passe dans une transaction Prisma (atomicité).
   */
  @Post()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN', 'RESPONSABLE_CENTRE')
  async create(@Request() req: any, @Body() body: any) {
    return await this.clubsService.create(body, req.user.userId, req.user.role);
  }
}
