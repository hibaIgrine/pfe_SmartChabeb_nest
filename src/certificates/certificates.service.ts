import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
// Use global fetch (Node 18+). If not available, install a polyfill like node-fetch.
declare const fetch: any;

@Injectable()
export class CertificatesService {
  private readonly CERTIFICATE_SERVICE_URL = 'http://localhost:5000';

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Génère un certificat pour un participant à un événement
   * @param eventId ID de l'événement
   * @param userId ID de l'utilisateur
   * @returns Buffer du fichier PNG
   */
  async generateParticipantCertificate(eventId: string, userId: string) {
    // 1. Vérifier que l'événement existe et est terminé
    const event = await this.prisma.events.findUnique({
      where: { id: eventId },
      include: {
        club: {
          select: { nom: true, id_centre: true },
        },
        local: {
          include: {
            centre: {
              select: { nom: true },
            },
          },
        },
      },
    });

    if (!event) {
      throw new BadRequestException('Événement introuvable');
    }

    const now = new Date();
    const eventEndTime = new Date(event.end_time);
    if (now < eventEndTime) {
      throw new BadRequestException(
        "Le certificat ne peut être généré que après la fin de l'événement",
      );
    }

    // 2. Vérifier que l'utilisateur est présent à cet événement
    const participant = await this.prisma.event_participants.findFirst({
      where: {
        event_id: eventId,
        user_id: userId,
      },
      include: {
        user: {
          select: { nom: true, prenom: true },
        },
      },
    });

    if (!participant) {
      throw new BadRequestException("Vous n'êtes pas inscrit à cet événement");
    }

    if (participant.status !== 'CONFIRME') {
      throw new BadRequestException(
        'Seuls les participants confirmés peuvent recevoir un certificat',
      );
    }

    if (!participant.checkin) {
      throw new BadRequestException(
        'Vous devez être marqué présent pour recevoir un certificat',
      );
    }

    // 3. Préparer les données pour Flask
    const firstName = participant.user.prenom?.trim() || '';
    const lastName = participant.user.nom?.trim() || '';
    const fullName = `${firstName} ${lastName}`.trim();
    const clubName = event.club?.nom || 'Smart-Chabeb';
    const centerName = event.local?.centre?.nom || 'Maison de Jeunes';
    const eventDate = new Date(event.date_event).toLocaleDateString('fr-FR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const payload = {
      prenom: firstName,
      nom: lastName,
      nom_complet: fullName,
      nom_etudiant: fullName,
      nom_club: clubName,
      nom_centre: centerName,
      maison_jeune: centerName,
      nom_evenement: event.nom,
      date_event: eventDate,
      date: eventDate,
    };

    // 4. Appeler le service Flask
    try {
      const resp = await fetch(
        `${this.CERTIFICATE_SERVICE_URL}/generate-certificate-binary`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );

      const contentType = String(resp.headers?.get?.('content-type') ?? '');
      if (!resp.ok) {
        const errorBody = await resp.text();
        throw new InternalServerErrorException(
          `Le service Flask a répondu avec le statut ${resp.status}. ${errorBody.slice(0, 300)}`,
        );
      }

      if (!contentType.includes('application/json')) {
        const responseText = await resp.text();
        throw new InternalServerErrorException(
          `Réponse inattendue du service Flask: ${contentType || 'type inconnu'}. ${responseText.slice(0, 300)}`,
        );
      }

      const responseData = await resp.json();

      if (!responseData?.image) {
        throw new InternalServerErrorException(
          'Le service Flask a répondu sans image de certificat.',
        );
      }

      return {
        success: true,
        image: responseData.image,
        filename: responseData.nom_fichier,
        eventName: event.nom,
        participantName: fullName,
      };
    } catch (error: any) {
      console.error('Erreur appel Flask:', error?.message ?? error);
      if (error instanceof InternalServerErrorException) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Erreur lors de la génération du certificat. Assurez-vous que le service Flask est actif (http://localhost:5000)',
      );
    }
  }

  /**
   * Récupère la liste des événements passés où l'utilisateur était présent
   */
  async getUserAttendanceHistory(userId: string) {
    const now = new Date();

    const attendedEvents = await this.prisma.event_participants.findMany({
      where: {
        user_id: userId,
        status: 'CONFIRME',
        checkin: true,
        event: {
          end_time: {
            lt: now,
          },
        },
      },
      include: {
        event: {
          select: {
            id: true,
            nom: true,
            date_event: true,
            start_time: true,
            end_time: true,
            club: {
              select: { nom: true },
            },
            local: {
              include: {
                centre: {
                  select: { nom: true },
                },
              },
            },
          },
        },
      },
      orderBy: {
        event: {
          date_event: 'desc',
        },
      },
    });

    return attendedEvents.map((participation) => ({
      eventId: participation.event.id,
      eventName: participation.event.nom,
      clubName: participation.event.club?.nom || 'Smart-Chabeb',
      centerName: participation.event.local?.centre?.nom || 'Maison de Jeunes',
      date: participation.event.date_event,
      status: participation.status,
      present: participation.checkin,
      pointsAwarded: participation.points_awarded,
    }));
  }
}
