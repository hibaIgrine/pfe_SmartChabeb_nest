/**
 * ============================================================
 * FICHIER : club-creation-requests.controller.ts
 * RÔLE    : Routes HTTP pour les demandes de création de club.
 * ============================================================
 *
 * BASE URL : /club-creation-requests
 * Tout le controller est sous AuthGuard('jwt').
 *
 * ROUTES :
 *   ── ADHÉRENT ─────────────────────────────────────────────
 *   POST /club-creation-requests
 *     → Soumettre une demande de création de club.
 *     → Réservé aux ADHERENTS uniquement (vérifié dans le service).
 *     → Upload de 3 fichiers via Multer :
 *         cv          → CV du demandeur (1 fichier max)
 *         attestation → Attestation de compétence (1 fichier max)
 *         logo        → Logo souhaité pour le club (1 fichier max)
 *     → Stockage dans ./uploads/ avec nom aléatoire (hex 24 chars + extension).
 *
 *   GET /club-creation-requests/mine
 *     → Mes propres demandes soumises (historique).
 *
 *   GET /club-creation-requests/categories
 *     → Liste déduplicée des catégories utilisées dans les demandes ET les clubs existants.
 *     → Public (pas de RolesGuard) → utile pour peupler les menus déroulants Flutter.
 *
 *   ── ADMIN / RESPONSABLE_CENTRE ───────────────────────────
 *   GET  /club-creation-requests?statut=EN_ATTENTE
 *     → Toutes les demandes, filtrables par statut.
 *     → RESPONSABLE_CENTRE : voit uniquement les demandes de son centre.
 *     → ADMIN : voit toutes les demandes.
 *
 *   PATCH /club-creation-requests/:id/status
 *     → Accepter ou refuser une demande.
 *     → Si ACCEPTEE : crée le club officiel + réservations récurrentes + promeut l'adhérent.
 *     → RESPONSABLE_CENTRE : ne peut traiter que les demandes de son centre.
 *
 * NOTE SUR MULTER (FileFieldsInterceptor) :
 *   Intercepteur NestJS qui parse le multipart/form-data et place les fichiers
 *   dans req.files (typé comme { cv?, attestation?, logo? }).
 *   Le filename est généré aléatoirement pour éviter les conflits et les path traversal.
 */

import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Query,
  Param,
  Request,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { Roles } from 'src/auth/roles.decorator';
import { RolesGuard } from 'src/auth/roles.guard';
import { ClubCreationRequestsService } from './club-creation-requests.service';
import { CreateClubCreationRequestDto } from './dto/create-club-creation-request.dto';
import { UpdateClubCreationRequestStatusDto } from './dto/update-club-creation-request-status.dto';

@Controller('club-creation-requests')
@UseGuards(AuthGuard('jwt'))
export class ClubCreationRequestsController {
  constructor(
    private readonly clubCreationRequestsService: ClubCreationRequestsService,
  ) {}

  /**
   * POST /club-creation-requests
   * Soumettre une demande de création de club (ADHERENT uniquement).
   *
   * FileFieldsInterceptor gère 3 champs fichiers :
   *   - cv          : obligatoire recommandé (CV du demandeur)
   *   - attestation : preuve de compétence dans la catégorie
   *   - logo        : image de logo souhaitée pour le club
   *
   * Le service vérifie :
   *   1. Rôle = ADHERENT (les responsables ne peuvent pas soumettre)
   *   2. Le local appartient au même centre que le demandeur
   *   3. Le créneau souhaité est disponible dans le local
   */
  @Post()
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'cv',          maxCount: 1 },
        { name: 'attestation', maxCount: 1 },
        { name: 'logo',        maxCount: 1 },
      ],
      {
        storage: diskStorage({
          destination: './uploads',
          filename: (req, file, cb) => {
            // Nom aléatoire : 24 caractères hexadécimaux + extension originale
            const randomName = Array(24)
              .fill(null)
              .map(() => Math.round(Math.random() * 16).toString(16))
              .join('');
            cb(null, `${randomName}${extname(file.originalname)}`);
          },
        }),
      },
    ),
  )
  create(
    @Request() req: any,
    @Body() dto: CreateClubCreationRequestDto,
    @UploadedFiles()
    files: {
      cv?: Express.Multer.File[];
      attestation?: Express.Multer.File[];
      logo?: Express.Multer.File[];
    },
  ) {
    return this.clubCreationRequestsService.create(
      req.user.userId,
      req.user.role,
      dto,
      files,
    );
  }

  /**
   * GET /club-creation-requests/mine
   * Retourne les demandes soumises par l'utilisateur connecté.
   * Triées par date de création DESC (la plus récente en premier).
   * Inclut le local souhaité pour chaque demande.
   */
  @Get('mine')
  findMine(@Request() req: any) {
    return this.clubCreationRequestsService.findMine(req.user.userId);
  }

  /**
   * GET /club-creation-requests/categories
   * Retourne la liste de toutes les catégories utilisées :
   *   - dans les demandes de création (demandes_creation_clubs.categorie)
   *   - dans les clubs existants (clubs.categorie)
   * Résultat : Set déduplicé + trié alphabétiquement (locale 'fr', insensible à la casse).
   * Utilisé pour peupler le menu déroulant "Catégorie" dans le formulaire Flutter.
   */
  @Get('categories')
  findCategories() {
    return this.clubCreationRequestsService.findCategories();
  }

  /**
   * GET /club-creation-requests?statut=EN_ATTENTE
   * Liste toutes les demandes (admin) ou celles du centre (responsable).
   * Filtre optionnel par statut (EN_ATTENTE, ACCEPTEE, REFUSEE).
   * Réservé à ADMIN et RESPONSABLE_CENTRE.
   */
  @Get()
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'RESPONSABLE_CENTRE')
  findAll(@Request() req: any, @Query('statut') statut?: string) {
    return this.clubCreationRequestsService.findAll(
      req.user.userId,
      req.user.role,
      statut,
    );
  }

  /**
   * PATCH /club-creation-requests/:id/status
   * Accepter ou refuser une demande de création de club.
   * Body : { statut: 'ACCEPTEE' | 'REFUSEE', commentaire_decision?: string }
   *
   * Si ACCEPTÉE → pipeline complet dans une $transaction :
   *   vérifie 52 créneaux disponibles → crée les réservations → crée le club → promeut l'adhérent
   *
   * RESPONSABLE_CENTRE ne peut traiter que les demandes de son centre.
   */
  @Patch(':id/status')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'RESPONSABLE_CENTRE')
  updateStatus(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateClubCreationRequestStatusDto,
  ) {
    return this.clubCreationRequestsService.updateStatus(
      id,
      req.user.userId,
      req.user.role,
      dto,
    );
  }
}
