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
