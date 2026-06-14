import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from 'src/auth/roles.decorator';
import { PresencesService } from './presences.service';
import { MarkPresenceDto } from './dto/mark-presence.dto';
import { CreateSeanceDto } from './dto/create-seance.dto';
import { UnmarkPresenceDto } from './dto/unmark-presence.dto';
import { CreateSeanceFeedbackDto } from './dto/create-seance-feedback.dto';

/**
 * ============================================================
 * FICHIER : presences.controller.ts
 * RÔLE    : Routes HTTP pour la gestion des présences aux séances de clubs.
 * ============================================================
 *
 * BASE URL : /presences
 * Tout le controller est protégé par @UseGuards(AuthGuard('jwt')) → JWT obligatoire.
 * Chaque route utilise @Roles() pour restreindre l'accès selon le rôle.
 *
 * ROUTES EXPOSÉES :
 *
 *   GET /presences/my-clubs                     [RESP_CLUB, RESP_CENTRE]
 *     → Liste les clubs que l'utilisateur peut gérer (son club ou tous les clubs de son centre).
 *
 *   POST /presences/seances                     [RESP_CLUB, RESP_CENTRE]
 *     → Crée une séance pour un club (idempotent — retourne l'existante si déjà créée).
 *     → Body : CreateSeanceDto { id_club, date_seance?, titre?, heure_debut?, heure_fin? }
 *
 *   GET /presences/clubs/:clubId/seances        [RESP_CLUB, RESP_CENTRE]
 *     → Liste les séances d'un club, avec filtre optionnel par date (query: date=YYYY-MM-DD).
 *
 *   POST /presences/mark                        [RESP_CLUB, RESP_CENTRE]
 *     → Marque ou met à jour la présence d'un membre (PRESENT | ABSENT).
 *     → Crée automatiquement la séance si absente pour la date donnée.
 *     → Upsert sur (id_club, id_utilisateur, id_seance).
 *
 *   GET /presences/:clubId/members              [RESP_CLUB, RESP_CENTRE]
 *     → Liste les membres actifs du club avec leur statut pour une date/séance donnée.
 *     → Query : date (YYYY-MM-DD), seanceId (UUID) — optionnels.
 *
 *   GET /presences/:clubId/history              [RESP_CLUB, RESP_CENTRE]
 *     → Historique des présences d'un club, filtrables par memberId, dates, séance.
 *     → Query : memberId, startDate, endDate, limit (défaut 100, max 200), seanceId.
 *
 *   GET /presences/:clubId/stats                [RESP_CLUB, RESP_CENTRE]
 *     → Statistiques : taux_presence global, répartition par jour et par membre.
 *     → Query : startDate, endDate (optionnels).
 *
 *   GET /presences/adherent/seances             [ADHERENT]
 *     → Séances passées où l'adhérent était PRESENT, avec indication si feedback déjà soumis.
 *
 *   POST /presences/adherent/seances/:seanceId/feedback  [ADHERENT]
 *     → Soumet ou met à jour le feedback d'une séance (note_coach, note_activites, commentaire).
 *     → Conditions : être PRESENT à la séance + séance passée.
 *
 *   GET /presences/clubs/:clubId/feedbacks      [RESP_CLUB, RESP_CENTRE]
 *     → Feedbacks des adhérents pour les séances d'un club.
 *     → Inclut moyenne note_coach et note_activites par séance.
 *     → Query : limit (défaut 100), seanceId.
 *
 *   GET /presences/:clubId/export               [RESP_CLUB, RESP_CENTRE]
 *     → Export CSV des présences d'une journée/séance (26 colonnes).
 *     → Retourne { fileName, csv, metadata, records }.
 *     → Query : date (YYYY-MM-DD), seanceId.
 *
 *   POST /presences/unmark                      [RESP_CLUB, RESP_CENTRE]
 *     → Supprime un marquage de présence (deleteMany) → le membre revient à NON_MARQUE.
 *
 * NOTE : RolesGuard est implicitement appliqué — @Roles() suffit (pas besoin de @UseGuards(RolesGuard)).
 */
@Controller('presences')
@UseGuards(AuthGuard('jwt'))
export class PresencesController {
  constructor(private readonly presencesService: PresencesService) {}

  /** GET /presences/my-clubs — Clubs gérables : pour RESP_CLUB (son club) ou RESP_CENTRE (son centre). */
  @Get('my-clubs')
  @Roles('RESPONSABLE_CLUB', 'RESPONSABLE_CENTRE')
  async getMyClubs(@Request() req: any) {
    return await this.presencesService.getManageableClubs(req.user.userId);
  }

  /** POST /presences/seances — Crée une séance (ou récupère l'existante pour ce club+date). */
  @Post('seances')
  @Roles('RESPONSABLE_CLUB', 'RESPONSABLE_CENTRE')
  async createSeance(@Request() req: any, @Body() dto: CreateSeanceDto) {
    return await this.presencesService.createSeance(req.user.userId, dto);
  }

  /** GET /presences/clubs/:clubId/seances — Séances du club, filtrables par date (query: date=YYYY-MM-DD). */
  @Get('clubs/:clubId/seances')
  @Roles('RESPONSABLE_CLUB', 'RESPONSABLE_CENTRE')
  async getSeancesForClub(
    @Request() req: any,
    @Param('clubId') clubId: string,
    @Query('date') date?: string,
  ) {
    return await this.presencesService.getSeancesForClub(
      req.user.userId,
      clubId,
      date,
    );
  }

  /** POST /presences/mark — Upsert présence (PRESENT|ABSENT). Crée la séance si absente. */
  @Post('mark')
  @Roles('RESPONSABLE_CLUB', 'RESPONSABLE_CENTRE')
  async markPresence(@Request() req: any, @Body() dto: MarkPresenceDto) {
    return await this.presencesService.markPresence(req.user.userId, dto);
  }

  /** GET /presences/:clubId/members — Membres actifs + leur statut (PRESENT|ABSENT|NON_MARQUE) pour la date/séance. */
  @Get(':clubId/members')
  @Roles('RESPONSABLE_CLUB', 'RESPONSABLE_CENTRE')
  async getMembers(
    @Request() req: any,
    @Param('clubId') clubId: string,
    @Query('date') date?: string,
    @Query('seanceId') seanceId?: string,
  ) {
    return await this.presencesService.getMembersForDate(
      req.user.userId,
      clubId,
      date,
      seanceId,
    );
  }

  /** GET /presences/:clubId/history — Historique filtrable (memberId, dates, séance). limit clampé 1-200. */
  @Get(':clubId/history')
  @Roles('RESPONSABLE_CLUB', 'RESPONSABLE_CENTRE')
  async getHistory(
    @Request() req: any,
    @Param('clubId') clubId: string,
    @Query('memberId') memberId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit?: string,
    @Query('seanceId') seanceId?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : 100;
    return await this.presencesService.getHistory(
      req.user.userId,
      clubId,
      memberId,
      startDate,
      endDate,
      parsedLimit,
      seanceId,
    );
  }

  /** GET /presences/:clubId/stats — taux_presence, par_jour et par_membre sur la période. */
  @Get(':clubId/stats')
  @Roles('RESPONSABLE_CLUB', 'RESPONSABLE_CENTRE')
  async getStats(
    @Request() req: any,
    @Param('clubId') clubId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return await this.presencesService.getStats(
      req.user.userId,
      clubId,
      startDate,
      endDate,
    );
  }

  /** GET /presences/adherent/seances — Séances passées où l'adhérent était PRESENT + indicateur feedback déjà soumis. */
  @Get('adherent/seances')
  @Roles('ADHERENT')
  async getMyFeedbackSeances(@Request() req: any) {
    return await this.presencesService.getMyFeedbackSeances(req.user.userId);
  }

  /** POST /presences/adherent/seances/:seanceId/feedback — Upsert feedback séance (note_coach, note_activites, commentaire). */
  @Post('adherent/seances/:seanceId/feedback')
  @Roles('ADHERENT')
  async submitSeanceFeedback(
    @Request() req: any,
    @Param('seanceId') seanceId: string,
    @Body() dto: CreateSeanceFeedbackDto,
  ) {
    return await this.presencesService.submitSeanceFeedback(
      req.user.userId,
      seanceId,
      dto,
    );
  }

  /** GET /presences/clubs/:clubId/feedbacks — Feedbacks des adhérents avec moyennes note_coach et note_activites par séance. */
  @Get('clubs/:clubId/feedbacks')
  @Roles('RESPONSABLE_CLUB', 'RESPONSABLE_CENTRE')
  async getClubFeedbacks(
    @Request() req: any,
    @Param('clubId') clubId: string,
    @Query('limit') limit?: string,
    @Query('seanceId') seanceId?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : 100;
    return await this.presencesService.getClubFeedbacks(
      req.user.userId,
      clubId,
      parsedLimit,
      seanceId,
    );
  }

  /** GET /presences/:clubId/export — CSV 26 colonnes. Retourne { fileName, csv, metadata, records }. */
  @Get(':clubId/export')
  @Roles('RESPONSABLE_CLUB', 'RESPONSABLE_CENTRE')
  async exportDaily(
    @Request() req: any,
    @Param('clubId') clubId: string,
    @Query('date') date: string | undefined,
    @Query('seanceId') seanceId?: string,
  ) {
    return await this.presencesService.exportDailyPresence(
      req.user.userId,
      clubId,
      date,
      seanceId,
    );
  }

  /** POST /presences/unmark — Supprime le marquage (deleteMany) → membre revient à NON_MARQUE. */
  @Post('unmark')
  @Roles('RESPONSABLE_CLUB', 'RESPONSABLE_CENTRE')
  async unmarkPresence(@Request() req: any, @Body() dto: UnmarkPresenceDto) {
    return await this.presencesService.unmarkPresence(req.user.userId, dto);
  }
}
