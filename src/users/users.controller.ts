/**
 * ============================================================
 * FICHIER : users.controller.ts
 * RÔLE    : Expose toutes les routes HTTP liées aux utilisateurs.
 * ============================================================
 *
 * Les routes sont organisées en 3 groupes :
 *
 * ── GROUPE 1 : PUBLIQUES (sans JWT) ──────────────────────────
 *   POST /users                → créer un compte (inscription)
 *   POST /users/check-email    → vérifier si un email est disponible
 *   POST /users/verify         → confirmer l'email avec le code OTP
 *   PATCH /users/update-profile → compléter le profil (genre, date de naissance)
 *   PATCH /users/me/assign-centre → lier l'utilisateur à un centre (onboarding)
 *
 * ── GROUPE 2 : PRIVÉES — MON PROFIL (JWT requis) ─────────────
 *   GET   /users/me/profile             → mon profil complet
 *   GET   /users/me/gamification        → mes points, badge, classement
 *   GET   /users/me/following           → les gens que je suis
 *   GET   /users/gamification/leaderboard → classement général
 *   GET   /users/:id/public-profile     → profil public d'un autre utilisateur
 *   POST  /users/:id/follow             → suivre un utilisateur
 *   DELETE /users/:id/follow            → ne plus suivre
 *   PATCH /users/:id                    → modifier profil + upload photo
 *
 * ── GROUPE 3 : ADMINISTRATIVES (JWT + rôle) ──────────────────
 *   GET   /users                         → liste tous les users (filtrée par rôle)
 *   GET   /users/:id                     → profil complet d'un user [ADMIN, COACH]
 *   GET   /users/staff-by-centre/:id     → staff d'un centre
 *   GET   /users/adherents-by-centre/:id → adhérents d'un centre
 *   PATCH /users/:id/role                → changer le rôle [ADMIN, RESPONSABLE_CENTRE]
 *   PATCH /users/:id/status              → activer/désactiver [ADMIN, RESPONSABLE_CENTRE]
 *   PATCH /users/:id/ban                 → bannir temporairement [ADMIN, RESPONSABLE_CENTRE]
 *   PATCH /users/:id/assign-centre       → assigner un responsable à un centre [ADMIN]
 *   DELETE /users/:id                    → désactiver un compte [ADMIN]
 *
 * UPLOAD DE PHOTO :
 *   La route PATCH /users/:id gère l'upload de fichier image via Multer.
 *   Le fichier est sauvegardé dans le dossier ./uploads/ avec un nom aléatoire.
 *   L'URL publique est construite avec API_URL (défini dans .env).
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
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { AuthGuard } from '@nestjs/passport';
import { VerifyUserDto } from './dto/verify-user.dto';
import { Roles } from 'src/auth/roles.decorator';
import { RolesGuard } from 'src/auth/roles.guard';
import { BanUserDto } from './dto/ban-user.dto';
import { ChangeRoleDto } from './dto/change-role.dto';
import { ChangeStatusDto } from './dto/change-status.dto';
import { AssignSalleByEmailDto } from './dto/assign-salle.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // ─── GROUPE 1 : ROUTES PUBLIQUES ─────────────────────────────────────────────

  /**
   * POST /users
   * Crée un compte utilisateur lors de l'inscription Flutter.
   * Utilise un upsert : si l'utilisateur a déjà été créé lors de la vérification OTP,
   * on met à jour ses informations. Sinon on crée un nouvel enregistrement.
   * Envoie aussi un email de bienvenue avec un code de vérification.
   */
  @Post()
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  /**
   * POST /users/check-email
   * Vérifie en temps réel si un email est déjà utilisé en BDD.
   * Utilisé dans le formulaire d'inscription Flutter pour feedback immédiat.
   * Retourne : { available: true } ou { available: false }
   */
  @Post('check-email')
  async checkEmail(@Body() body: { email: string }) {
    return this.usersService.checkEmailAvailable(body.email);
  }

  /**
   * POST /users/verify
   * Confirme l'email d'un utilisateur avec le code OTP reçu par email.
   * Met est_verifie = true et efface le code_verification en BDD.
   */
  @Post('verify')
  async verify(@Body() verifyUserDto: VerifyUserDto) {
    return await this.usersService.verifyEmail(
      verifyUserDto.email,
      verifyUserDto.code,
    );
  }

  /**
   * PATCH /users/update-profile
   * Étape 3 de l'onboarding Flutter : compléter le profil après inscription.
   * Met à jour genre et date_naissance (la date est convertie en ISO DateTime).
   * Pas de JWT requis → l'utilisateur n'est pas encore "connecté" au sens token.
   */
  @Patch('update-profile')
  async updateProfile(@Body() updateProfileDto: any) {
    return await this.usersService.updateProfile(
      updateProfileDto.email,
      updateProfileDto,
    );
  }

  // ─── GROUPE 2 : PROFIL PERSONNEL (JWT requis) ────────────────────────────────

  /**
   * GET /users/me/profile
   * Retourne le profil complet de l'utilisateur connecté :
   * données personnelles + centre + clubs inscrits + clubs dirigés.
   * req.user.userId est injecté par JwtStrategy.validate()
   */
  @Get('me/profile')
  @UseGuards(AuthGuard('jwt'))
  async getMyProfile(@Request() req: any) {
    return await this.usersService.findOne(req.user.userId);
  }

  /**
   * GET /users/me/gamification
   * Retourne le profil de gamification de l'utilisateur connecté :
   * points, badge actuel, prochain badge, progression %, rang dans le centre.
   */
  @Get('me/gamification')
  @UseGuards(AuthGuard('jwt'))
  async getMyGamification(@Request() req: any) {
    return await this.usersService.getGamificationProfile(req.user.userId);
  }

  /**
   * GET /users/me/following
   * Retourne la liste des utilisateurs que je suis (abonnements).
   * Triée par date de suivi décroissante (les plus récents en premier).
   */
  @Get('me/following')
  @UseGuards(AuthGuard('jwt'))
  async getMyFollowing(@Request() req: any) {
    return await this.usersService.findFollowingUsers(req.user.userId);
  }

  /**
   * GET /users/:id/public-profile
   * Retourne le profil public d'un autre utilisateur (ou le sien).
   * Inclut : stats (followers, following, posts), badge, centre.
   * Indique aussi si le viewer suit déjà cet utilisateur (isFollowing).
   */
  @Get(':id/public-profile')
  @UseGuards(AuthGuard('jwt'))
  async getPublicProfile(@Param('id') id: string, @Request() req: any) {
    return await this.usersService.findPublicProfile(id, req.user.userId);
  }

  /**
   * GET /users/:id/followers
   * Liste des utilisateurs qui suivent cet utilisateur.
   */
  @Get(':id/followers')
  @UseGuards(AuthGuard('jwt'))
  async getUserFollowers(@Param('id') id: string) {
    return await this.usersService.findFollowersOfUser(id);
  }

  /**
   * GET /users/:id/following
   * Liste des utilisateurs que cet utilisateur suit.
   */
  @Get(':id/following')
  @UseGuards(AuthGuard('jwt'))
  async getUserFollowing(@Param('id') id: string) {
    return await this.usersService.findFollowingOfUser(id);
  }

  /**
   * POST /users/:id/follow
   * Suivre un utilisateur. Utilise un upsert → idempotent (pas d'erreur si déjà suivi).
   * Impossible de se suivre soi-même (vérifié dans le service).
   */
  @Post(':id/follow')
  @UseGuards(AuthGuard('jwt'))
  async followUser(@Param('id') id: string, @Request() req: any) {
    return await this.usersService.followUser(req.user.userId, id);
  }

  /**
   * DELETE /users/:id/follow
   * Arrêter de suivre un utilisateur (désabonnement).
   * Utilise deleteMany → pas d'erreur si la relation n'existait pas.
   */
  @Delete(':id/follow')
  @UseGuards(AuthGuard('jwt'))
  async unfollowUser(@Param('id') id: string, @Request() req: any) {
    return await this.usersService.unfollowUser(req.user.userId, id);
  }

  /**
   * GET /users/gamification/leaderboard
   * Classement des utilisateurs par points.
   * - ADMIN → voit tous les utilisateurs (limit 1000)
   * - Autres → voient seulement les top 10 de leur centre
   */
  @Get('gamification/leaderboard')
  @UseGuards(AuthGuard('jwt'))
  async getGamificationLeaderboard(@Request() req: any) {
    const role = req?.user?.role;
    const limit = role === 'ADMIN' ? 1000 : 10;
    return await this.usersService.getGamificationLeaderboard(
      req.user.userId,
      limit,
    );
  }

  /**
   * PATCH /users/me/assign-centre
   * Lie un utilisateur à un centre par email (onboarding, étape choix du centre).
   * Pas de JWT requis → utilisé avant que l'utilisateur ait son token.
   */
  @Patch('me/assign-centre')
  async assignCentreByEmail(@Body() body: any) {
    return await this.usersService.assignToCentreByEmail(
      body.email,
      body.id_centre,
    );
  }

  /**
   * PATCH /users/:id
   * Modifie le profil d'un utilisateur + gère l'upload optionnel d'une photo de profil.
   *
   * Upload (Multer) :
   *   - Le fichier est reçu via multipart/form-data (champ "file")
   *   - Sauvegardé dans ./uploads/ avec un nom hexadécimal aléatoire de 32 caractères
   *   - L'extension originale est conservée (ex: .jpg, .png)
   *   - L'URL finale est construite avec API_URL depuis .env
   *
   * Si le mot de passe est fourni, il est haché avant mise à jour en BDD.
   */
  @Patch(':id')
  @UseGuards(AuthGuard('jwt'))
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads',
        filename: (req, file, cb) => {
          // Nom aléatoire 32 caractères hex + extension originale du fichier
          const randomName = Array(32)
            .fill(null)
            .map(() => Math.round(Math.random() * 16).toString(16))
            .join('');
          return cb(null, `${randomName}${extname(file.originalname)}`);
        },
      }),
    }),
  )
  async update(
    @Param('id') id: string,
    @Body() updateUserDto: any,
    @UploadedFile() file: Express.Multer.File,
  ) {
    // Si une image a été uploadée, on construit son URL publique et on l'ajoute au DTO
    if (file) {
      updateUserDto.photo_profil_url = `${process.env.API_URL}/uploads/${file.filename}`;
    }
    return await this.usersService.update(id, updateUserDto);
  }

  // ─── GROUPE 3 : ROUTES ADMINISTRATIVES ───────────────────────────────────────

  /**
   * GET /users/staff-by-centre/:id_centre
   * Retourne tous les utilisateurs rattachés à un centre donné (staff + adhérents).
   * Utilisé par le dashboard admin pour visualiser les membres d'un centre.
   */
  @Get('staff-by-centre/:id_centre')
  @UseGuards(AuthGuard('jwt'))
  async getStaffByCentre(@Param('id_centre') id_centre: string) {
    return await this.usersService.findStaffByCentre(id_centre);
  }

  /**
   * GET /users/adherents-by-centre/:id_centre
   * Retourne uniquement les ADHÉRENTS d'un centre (rôle = 'ADHERENT').
   * Utile pour les coachs qui veulent voir leurs membres.
   */
  @Get('adherents-by-centre/:id_centre')
  @UseGuards(AuthGuard('jwt'))
  async getAdherentsByCentre(@Param('id_centre') id_centre: string) {
    return await this.usersService.findAdherentsByCentre(id_centre);
  }

  /**
   * GET /users
   * Retourne la liste des utilisateurs selon le rôle du demandeur :
   *   - ADMIN           → tous les utilisateurs (sauf CHATBOT)
   *   - RESPONSABLE_CENTRE → membres de son centre uniquement
   *   - COACH           → adhérents de son centre uniquement
   *   - GESTIONNAIRE    → idem ADMIN (pas encore différencié)
   * La logique de filtrage est dans usersService.findAll().
   */
  @Get()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN', 'COACH', 'GESTIONNAIRE', 'RESPONSABLE_CENTRE')
  findAll(@Request() req: any) {
    return this.usersService.findAll(req.user.userId, req.user.role);
  }

  /**
   * GET /users/:id
   * Retourne le profil complet d'un utilisateur par ID.
   * Accessible à l'ADMIN (vue globale) et au COACH (voir ses adhérents).
   */
  @Get(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN', 'COACH')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  /**
   * PATCH /users/:id/role
   * Change le rôle d'un utilisateur.
   * - ADMIN           → peut attribuer n'importe quel rôle
   * - RESPONSABLE_CENTRE → ne peut attribuer que ADHERENT ou RESPONSABLE_CLUB,
   *                        et uniquement pour les membres de son propre centre
   */
  @Patch(':id/role')
  @Roles('ADMIN', 'RESPONSABLE_CENTRE')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  async changeRole(@Param('id') id: string, @Body() body: ChangeRoleDto, @Request() req: any) {
    return await this.usersService.changeRole(id, body.role, req.user.userId, req.user.role);
  }

  /**
   * PATCH /users/:id/status
   * Active ou désactive un compte (compte_actif = true/false).
   * Le RESPONSABLE_CENTRE ne peut agir que sur les membres de son centre
   * et ne peut pas toucher aux ADMIN ou autres RESPONSABLE_CENTRE.
   */
  @Patch(':id/status')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN', 'RESPONSABLE_CENTRE')
  async changeStatus(@Param('id') id: string, @Body() body: ChangeStatusDto, @Request() req: any) {
    return await this.usersService.changeStatus(
      id,
      body.compte_actif,
      req.user.userId,
      req.user.role,
    );
  }

  /**
   * PATCH /users/:id/ban
   * Bannit temporairement un utilisateur pour un nombre de jours donné.
   * Calcule automatiquement date_fin_ban = aujourd'hui + days.
   * Mêmes restrictions de périmètre que changeStatus().
   */
  @Patch(':id/ban')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN', 'RESPONSABLE_CENTRE')
  async banUser(@Param('id') id: string, @Body() body: BanUserDto, @Request() req: any) {
    return await this.usersService.banUser(id, body.days, body.reason, req.user.userId, req.user.role);
  }

  /**
   * PATCH /users/:id/assign-centre
   * Nomme un utilisateur RESPONSABLE d'un centre donné.
   * Utilise une transaction Prisma pour :
   *   1. Rétrograder l'ancien responsable en ADHERENT
   *   2. Promouvoir le nouvel utilisateur en RESPONSABLE_CENTRE
   * Réservé à l'ADMIN uniquement.
   */
  @Patch(':id/assign-centre')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN')
  async assignCentreById(
    @Param('id') id: string,
    @Body('id_centre') id_centre: string,
  ) {
    return await this.usersService.assignResponsibleToCentre(id, id_centre);
  }

  /**
   * DELETE /users/:id
   * Désactive le compte d'un utilisateur (soft delete : compte_actif = false).
   * L'utilisateur ne peut plus se connecter mais ses données restent en BDD.
   * Réservé à l'ADMIN uniquement.
   */
  @Delete(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN')
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }
}
