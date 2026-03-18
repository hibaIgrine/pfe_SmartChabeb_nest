import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class ReservationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 🛡️ ALGORITHME ANTI-CONFLIT
   * Vérifie si un local est disponible pour une date et un créneau donné.
   * excludeId permet d'ignorer une réservation spécifique (utile pour la modification).
   */
  async checkAvailability(
    localId: string,
    date: string,
    start: string,
    end: string,
    excludeId?: string,
  ): Promise<boolean> {
    const dateRes = new Date(date);
    const debut = new Date(`${date}T${start}`);
    const fin = new Date(`${date}T${end}`);

    const conflict = await this.prisma.reservations_locaux.findFirst({
      where: {
        id_local: localId,
        statut: { in: ['EN_ATTENTE', 'VALIDEE'] },
        date_reservation: dateRes,
        // 💡 Si on modifie, on ne se compare pas à soi-même
        id: excludeId ? { not: excludeId } : undefined,
        OR: [
          {
            // La nouvelle commence pendant une existante
            heure_debut: { lte: debut },
            heure_fin: { gt: debut },
          },
          {
            // La nouvelle finit pendant une existante
            heure_debut: { lt: fin },
            heure_fin: { gte: fin },
          },
          {
            // La nouvelle englobe totalement une existante
            heure_debut: { gte: debut },
            heure_fin: { lte: fin },
          },
        ],
      },
    });

    return !conflict;
  }

  /**
   * 📝 CRÉER UNE RÉSERVATION
   */
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

    const local = await this.prisma.locaux.findUnique({
      where: { id: dto.id_local },
    });

    if (!local) throw new NotFoundException("Le local spécifié n'existe pas.");

    // Calcul du prix
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

  /**
   * 📋 LISTER LES RÉSERVATIONS
   */
  async findAll(userId?: string, role?: string) {
    if (role === 'ADMIN') {
      return await this.prisma.reservations_locaux.findMany({
        include: {
          utilisateur: { select: { nom: true, prenom: true, email: true } },
          local: { include: { centre: true } },
        },
        orderBy: { date_creation: 'desc' },
      });
    }
    return await this.prisma.reservations_locaux.findMany({
      where: { id_utilisateur: userId },
      include: { local: true },
      orderBy: { date_creation: 'desc' },
    });
  }

  /**
   * ✅ VALIDER / REFUSER (Admin)
   */
  async updateStatus(id: string, statut: string) {
    const resToUpdate = await this.prisma.reservations_locaux.findUnique({
      where: { id },
    });

    if (!resToUpdate) throw new NotFoundException('Réservation introuvable');

    if (statut === 'VALIDEE') {
      // On convertit les Date de la BDD en string pour l'algo de check
      const dateStr = resToUpdate.date_reservation.toISOString().split('T')[0];
      const startStr = resToUpdate.heure_debut.toTimeString().split(' ')[0];
      const endStr = resToUpdate.heure_fin.toTimeString().split(' ')[0];

      const isAvailable = await this.checkAvailability(
        resToUpdate.id_local,
        dateStr,
        startStr,
        endStr,
        id, // Exclure soi-même
      );

      if (!isAvailable) {
        throw new ConflictException(
          'Action impossible : Ce créneau est désormais occupé par une autre validation.',
        );
      }
    }

    return await this.prisma.reservations_locaux.update({
      where: { id },
      data: { statut },
    });
  }

  /**
   * 📅 VOIR LES OCCUPATIONS (Pour le front)
   */
  async getOccupiedSlots(localId: string, date: string) {
    return await this.prisma.reservations_locaux.findMany({
      where: {
        id_local: localId,
        date_reservation: new Date(date),
        statut: { in: ['EN_ATTENTE', 'VALIDEE'] },
      },
      select: { heure_debut: true, heure_fin: true, objet: true },
      orderBy: { heure_debut: 'asc' },
    });
  }

  /**
   * 🔄 MODIFIER UNE RÉSERVATION (User)
   */
  async update(id: string, dto: any) {
    const isAvailable = await this.checkAvailability(
      dto.id_local,
      dto.date_reservation,
      dto.heure_debut,
      dto.heure_fin,
      id, // 💡 Important pour ne pas bloquer sa propre modification
    );

    if (!isAvailable) {
      throw new ConflictException('Ce nouveau créneau est déjà occupé.');
    }

    const local = await this.prisma.locaux.findUnique({
      where: { id: dto.id_local },
    });
    if (!local) throw new NotFoundException('Local introuvable');

    // Recalcul du prix en cas de changement d'heures
    const hDebut = new Date(`${dto.date_reservation}T${dto.heure_debut}`);
    const hFin = new Date(`${dto.date_reservation}T${dto.heure_fin}`);
    const dureeHeures = (hFin.getTime() - hDebut.getTime()) / (1000 * 60 * 60);
    const prixTotal = local.prix_heure
      ? Number(local.prix_heure) * dureeHeures
      : 0;

    return await this.prisma.reservations_locaux.update({
      where: { id },
      data: {
        date_reservation: new Date(dto.date_reservation),
        heure_debut: hDebut,
        heure_fin: hFin,
        objet: dto.objet,
        prix_total: prixTotal,
        statut: 'EN_ATTENTE', // Repasse en attente pour re-validation admin
      },
    });
  }

  /**
   * ❌ ANNULER (User)
   */
  async cancel(id: string) {
    return await this.prisma.reservations_locaux.update({
      where: { id },
      data: { statut: 'ANNULEE' },
    });
  }
}
