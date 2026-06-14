/**
 * ============================================================
 * FICHIER : certificates.controller.ts
 * RÔLE    : Routes HTTP pour la génération et la consultation des certificats.
 * ============================================================
 *
 * BASE URL : /certificates
 * Tout le controller est protégé par @UseGuards(AuthGuard('jwt')) → JWT obligatoire.
 *
 * ROUTES EXPOSÉES :
 *
 *   GET /certificates/event/:eventId                         [JWT requis]
 *     → Génère le certificat SVG pour l'utilisateur courant et l'événement donné.
 *     → Conditions requises (BadRequestException sinon) :
 *         - L'événement est terminé (end_time < now).
 *         - L'utilisateur est inscrit avec status='CONFIRME'.
 *         - L'utilisateur a été marqué présent (checkin=true).
 *     → Appelle le micro-service Flask (http://localhost:5000/generate-certificate-binary).
 *     → Retourne : { success, image: "data:image/svg+xml;base64,...", filename, eventName, participantName }
 *     → Le frontend peut afficher l'image directement via une balise <img src=...>
 *       ou déclencher un téléchargement du SVG.
 *
 *   GET /certificates/my-attendance                          [JWT requis]
 *     → Liste tous les événements passés où l'utilisateur a participé et était présent.
 *     → Filtre : event.end_time < now, status='CONFIRME', checkin=true.
 *     → Retourne : [{ eventId, eventName, clubName, centerName, date, status, present, pointsAwarded }]
 *     → Utilisé par le frontend pour afficher la liste des certificats disponibles au téléchargement.
 */

import { Controller, Get, Param, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CertificatesService } from './certificates.service';

@Controller('certificates')
@UseGuards(AuthGuard('jwt'))
export class CertificatesController {
  constructor(private readonly certificatesService: CertificatesService) {}

  /**
   * Génère le certificat de participation pour un événement
   * GET /certificates/event/:eventId
   */
  @Get('event/:eventId')
  async generateCertificate(
    @Request() req: any,
    @Param('eventId') eventId: string,
  ) {
    return this.certificatesService.generateParticipantCertificate(
      eventId,
      req.user.userId,
    );
  }

  /**
   * Récupère l'historique de présence de l'utilisateur
   * GET /certificates/my-attendance
   */
  @Get('my-attendance')
  async getMyAttendanceHistory(@Request() req: any) {
    return this.certificatesService.getUserAttendanceHistory(req.user.userId);
  }
}
