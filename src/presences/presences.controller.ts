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

/**
 * Couche HTTP du module presences.
 * Elle recoit les params de requete, applique l'authentification/role, puis delegue au service.
 */
@Controller('presences')
@UseGuards(AuthGuard('jwt'))
export class PresencesController {
  constructor(private readonly presencesService: PresencesService) {}

  // Renvoie la liste des clubs que l'utilisateur connecté peut gerer.
  @Get('my-clubs')
  @Roles('RESPONSABLE_CLUB', 'RESPONSABLE_CENTRE')
  async getMyClubs(@Request() req: any) {
    return await this.presencesService.getManageableClubs(req.user.userId);
  }

  // Crée une séance pour un club (ou la récupère si existe).
  @Post('seances')
  @Roles('RESPONSABLE_CLUB', 'RESPONSABLE_CENTRE')
  async createSeance(@Request() req: any, @Body() dto: CreateSeanceDto) {
    return await this.presencesService.createSeance(req.user.userId, dto);
  }

  // Liste des séances pour un club (optionnellement sur une date donnée)
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

  // Enregistre ou met a jour la presence d'un membre.
  @Post('mark')
  @Roles('RESPONSABLE_CLUB', 'RESPONSABLE_CENTRE')
  async markPresence(@Request() req: any, @Body() dto: MarkPresenceDto) {
    return await this.presencesService.markPresence(req.user.userId, dto);
  }

  // Renvoie les membres d'un club pour une date donnee avec leur statut du jour.
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

  // Renvoie l'historique des marquages de presence pour un club.
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

  // Calcule les statistiques de presence sur une periode.
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

  // Exporte la presence journaliere d'un club au format exploitable par le front.
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

  // Supprime un marquage de presence pour permettre de recommencer.
  @Post('unmark')
  @Roles('RESPONSABLE_CLUB', 'RESPONSABLE_CENTRE')
  async unmarkPresence(@Request() req: any, @Body() dto: UnmarkPresenceDto) {
    return await this.presencesService.unmarkPresence(req.user.userId, dto);
  }
}
