import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class ReservationsService {
  constructor(private readonly prisma: PrismaService) {}

  // 🛡️ ALGORITHME : Vérifier si un créneau est libre
  async checkAvailability(
    localId: string,
    date: string,
    start: string,
    end: string,
  ): Promise<boolean> {
    const dateRes = new Date(date);
    const debut = new Date(`${date}T${start}`);
    const fin = new Date(`${date}T${end}`);

    const conflict = await this.prisma.reservations_locaux.findFirst({
      where: {
        id_local: localId,
        statut: { in: ['EN_ATTENTE', 'VALIDEE'] }, // On bloque si une demande est déjà là
        date_reservation: dateRes,
        OR: [
          {
            // Cas 1 : La nouvelle résa commence PENDANT une résa existante
            heure_debut: { lte: debut },
            heure_fin: { gt: debut },
          },
          {
            // Cas 2 : La nouvelle résa finit PENDANT une résa existante
            heure_debut: { lt: fin },
            heure_fin: { gte: fin },
          },
          {
            // Cas 3 : La nouvelle résa ENGLOBE une résa existante
            heure_debut: { gte: debut },
            heure_fin: { lte: fin },
          },
        ],
      },
    });

    return !conflict;
  }

  // 📝 CRÉER UNE RÉSERVATION
  async create(userId: string, dto: any) {
    const isAvailable = await this.checkAvailability(
      dto.id_local,
      dto.date_reservation,
      dto.heure_debut,
      dto.heure_fin,
    );

    if (!isAvailable) {
      throw new ConflictException(
        'Ce créneau horaire est déjà réservé ou en attente de validation.',
      );
    }

    // Calcul du prix total (Durée en heures * prix_heure du local)
    const local = await this.prisma.locaux.findUnique({
      where: { id: dto.id_local },
    });
    if (!local) {
      throw new NotFoundException("Le local spécifié n'existe pas.");
    }
    const hDebut = new Date(`${dto.date_reservation}T${dto.heure_debut}`);
    const hFin = new Date(`${dto.date_reservation}T${dto.heure_fin}`);
    const dureeHeures = (hFin.getTime() - hDebut.getTime()) / (1000 * 60 * 60);
    const prixTotal = local.prix_heure
      ? Number(local.prix_heure) * dureeHeures
      : 0;

    return await this.prisma.reservations_locaux.create({
      data: {
        date_reservation: new Date(dto.date_reservation),
        heure_debut: hDebut,
        heure_fin: hFin,
        objet: dto.objet,
        id_utilisateur: userId,
        id_local: dto.id_local,
        prix_total: prixTotal,
        statut: 'EN_ATTENTE',
      },
    });
  }

  // 📋 LISTER (Admin voit tout, User voit les siennes)
  async findAll(userId?: string, role?: string) {
    if (role === 'ADMIN') {
      return await this.prisma.reservations_locaux.findMany({
        include: { utilisateur: true, local: { include: { centre: true } } },
        orderBy: { date_creation: 'desc' },
      });
    }
    return await this.prisma.reservations_locaux.findMany({
      where: { id_utilisateur: userId },
      include: { local: true },
      orderBy: { date_creation: 'desc' },
    });
  }

  // ✅ VALIDER / REFUSER (Admin)
  async updateStatus(id: string, statut: string) {
    // 1. Récupérer les détails de la réservation qu'on veut valider
    const resToUpdate = await this.prisma.reservations_locaux.findUnique({
      where: { id },
    });

    if (!resToUpdate) throw new NotFoundException('Réservation introuvable');

    // 2. Si l'admin veut VALIDER, on vérifie les conflits RÉELS
    if (statut === 'VALIDEE') {
      const conflict = await this.prisma.reservations_locaux.findFirst({
        where: {
          id_local: resToUpdate.id_local,
          statut: 'VALIDEE', // On ne compare qu'avec celles déjà officiellement validées
          date_reservation: resToUpdate.date_reservation,
          id: { not: id }, // 💡 IMPORTANT : Ne pas se comparer soi-même
          OR: [
            {
              // Le début de la nouvelle est pendant une existante
              heure_debut: { lte: resToUpdate.heure_debut },
              heure_fin: { gt: resToUpdate.heure_debut },
            },
            {
              // La fin de la nouvelle est pendant une existante
              heure_debut: { lt: resToUpdate.heure_fin },
              heure_fin: { gte: resToUpdate.heure_fin },
            },
            {
              // La nouvelle englobe totalement une existante
              heure_debut: { gte: resToUpdate.heure_debut },
              heure_fin: { lte: resToUpdate.heure_fin },
            },
          ],
        },
      });

      if (conflict) {
        throw new ConflictException(
          'Action impossible : Ce créneau horaire est déjà occupé par une réservation validée.',
        );
      }
    }

    // 3. Si pas de conflit ou si c'est un REFUS, on met à jour
    return await this.prisma.reservations_locaux.update({
      where: { id },
      data: { statut },
    });
  }
}
