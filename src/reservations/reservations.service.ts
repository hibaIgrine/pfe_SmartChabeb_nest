/**
 * ============================================================
 * FICHIER : reservations.service.ts
 * RÔLE    : Logique métier des réservations de locaux.
 * ============================================================
 *
 * CONCEPT : CYCLE DE VIE D'UNE RÉSERVATION
 * ──────────────────────────────────────────
 *   EN_ATTENTE ──► VALIDEE  (admin / responsable centre)
 *              └──► REFUSEE (admin / responsable centre)
 *   EN_ATTENTE ou VALIDEE ──► ANNULEE (auteur ou admin)
 *
 * ALGORITHME ANTI-CONFLIT (checkAvailability) ← COEUR DU MODULE
 * ──────────────────────────────────────────────────────────────
 * Détecte si un créneau demandé chevauche une réservation existante
 * (EN_ATTENTE ou VALIDEE). 3 cas couverts via OR Prisma :
 *
 *   Cas 1 : La nouvelle commence PENDANT une existante
 *           existante.debut <= nouveau.debut < existante.fin
 *
 *   Cas 2 : La nouvelle finit PENDANT une existante
 *           existante.debut < nouveau.fin <= existante.fin
 *
 *   Cas 3 : La nouvelle ENGLOBE TOTALEMENT une existante
 *           nouveau.debut <= existante.debut ET existante.fin <= nouveau.fin
 *
 *   excludeId : lors d'une MODIFICATION, on s'exclut soi-même de la vérification
 *               pour ne pas déclencher un conflit avec sa propre réservation actuelle.
 *
 * RBAC DANS buildReservationScopeWhere :
 * ────────────────────────────────────────
 *   ADMIN              → pas de filtre (voit tout)
 *   RESPONSABLE_CENTRE → locaux de son centre, EXCLUANT les réservations automatiques :
 *                         "Réservation pour événement:..." et "Créneau club validé:..."
 *   RESPONSABLE_CLUB   → uniquement ses propres réservations
 *   Autres             → uniquement ses propres réservations
 *
 * HELPERS PRIVÉS :
 *   resolveUserOrFail()              → charge l'utilisateur ou lance 404
 *   ensureTimeRange()               → vérifie que heure_fin > heure_debut
 *   buildReservationScopeWhere()    → construit le filtre Prisma selon le rôle
 *   assertResponsableCanReserveLocal() → RESPONSABLE_CLUB ne peut réserver que
 *                                        les locaux du centre de ses propres clubs
 *
 * MÉTHODES PUBLIQUES :
 *   checkAvailability()       → algorithme anti-conflit (utilisé par d'autres modules)
 *   create()                  → créer une réservation
 *   findAll()                 → lister les réservations (filtré par rôle)
 *   updateStatus()            → valider / refuser / annuler
 *   getOccupiedSlots()        → créneaux pris pour un local à une date
 *   getLocalPlanning()        → planning complet d'un local
 *   getReservationStatsOverview() → statistiques d'occupation
 *   update()                  → modifier une réservation
 *   cancel()                  → annuler rapidement
 */

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  ConflictException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { NotificationsService } from 'src/notifications/notifications.service';
import { CreateReservationDto } from './dto/create-reservation.dto';

@Injectable()
export class ReservationsService {
  /** Logger NestJS natif — utilisé dans findAll pour déboguer les problèmes de scope. */
  private readonly logger = new Logger(ReservationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ─── HELPERS PRIVÉS ──────────────────────────────────────────────────────────

  /** Charge un utilisateur par son ID ou lance NotFoundException. */
  private async resolveUserOrFail(userId: string) {
    const user = await this.prisma.utilisateurs.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    return user;
  }

  /**
   * VALIDER L'ORDRE TEMPOREL
   * Vérifie que heure_fin est strictement après heure_debut.
   * Lance BadRequestException si heure_fin <= heure_debut.
   */
  private ensureTimeRange(startDateTime: Date, endDateTime: Date) {
    if (endDateTime <= startDateTime) {
      throw new BadRequestException(
        'heure_fin doit etre strictement superieure a heure_debut',
      );
    }
  }

  /**
   * CONSTRUIRE LE FILTRE DE SCOPE SELON LE RÔLE
   * Retourne un objet Prisma WhereInput adapté au rôle de l'utilisateur.
   *
   * ADMIN :
   *   → {} (pas de filtre, voit tout)
   *
   * RESPONSABLE_CENTRE :
   *   → local.id_centre = son centre
   *   → Exclut les réservations automatiques de clubs et événements
   *     (objet ne commence pas par "Réservation pour événement:" ni "Créneau club validé:")
   *   Ces exclusions évitent de polluer la liste avec 52×N réservations récurrentes.
   *
   * RESPONSABLE_CLUB :
   *   → id_utilisateur = userId (ses propres réservations seulement)
   *   Note : pas de portée élargie au club pour éviter de montrer les créneaux des autres clubs.
   *
   * Autres :
   *   → id_utilisateur = userId (ses propres réservations)
   */
  private async buildReservationScopeWhere(
    userId: string,
    role?: string,
  ): Promise<Prisma.reservations_locauxWhereInput> {
    if (role === 'ADMIN') return {};

    if (role === 'RESPONSABLE_CENTRE') {
      const requester = await this.prisma.utilisateurs.findUnique({
        where: { id: userId },
        select: { id_centre: true },
      });
      if (!requester?.id_centre) return { id: { in: [] } }; // Pas de centre → rien

      return {
        local: { id_centre: requester.id_centre },
        AND: [
          { NOT: { objet: { startsWith: 'Réservation pour événement:' } } },
          { NOT: { objet: { startsWith: 'Créneau club validé:' } } },
        ],
      };
    }

    // RESPONSABLE_CLUB et tous les autres → uniquement leurs propres réservations
    return { id_utilisateur: userId };
  }

  /**
   * VÉRIFIER QU'UN RESPONSABLE DE CLUB PEUT RÉSERVER CE LOCAL
   * Un RESPONSABLE_CLUB ne peut réserver que les locaux du centre où ses clubs actifs sont rattachés.
   * Requête imbriquée : clubs dont id_coach = userId ET actif, dans un centre qui possède ce local.
   * Lance ForbiddenException si aucun club actif géré par cet utilisateur n'est dans le bon centre.
   */
  private async assertResponsableCanReserveLocal(userId: string, localId: string): Promise<void> {
    const managedClub = await this.prisma.clubs.findFirst({
      where: {
        id_coach:  userId,
        est_actif: true,
        centre: { locaux: { some: { id: localId } } },
      },
      select: { id: true },
    });
    if (!managedClub) {
      throw new ForbiddenException('Vous ne pouvez reserver que les locaux du centre de vos clubs');
    }
  }

  // ─── ALGORITHME ANTI-CONFLIT ──────────────────────────────────────────────────

  /**
   * VÉRIFIER LA DISPONIBILITÉ D'UN LOCAL POUR UN CRÉNEAU
   * Méthode publique — utilisée aussi par les modules clubs et club-creation-requests.
   *
   * Paramètres :
   *   localId   → UUID du local à vérifier
   *   date      → 'YYYY-MM-DD'
   *   start     → 'HH:mm' ou 'HH:mm:ss'
   *   end       → 'HH:mm' ou 'HH:mm:ss'
   *   excludeId → UUID d'une réservation à ignorer (pour la modification : on s'exclut soi-même)
   *
   * Algorithme : cherche un CONFLIT parmi les réservations EN_ATTENTE ou VALIDEE du même local.
   * Un conflit existe si l'une des 3 conditions est vraie :
   *
   *   OR[0] : existante.debut <= nouveau.debut < existante.fin
   *           → La nouvelle commence PENDANT une existante
   *           WHERE heure_debut <= debut AND heure_fin > debut
   *
   *   OR[1] : existante.debut < nouveau.fin <= existante.fin
   *           → La nouvelle finit PENDANT une existante
   *           WHERE heure_debut < fin AND heure_fin >= fin
   *
   *   OR[2] : nouveau.debut <= existante.debut AND existante.fin <= nouveau.fin
   *           → La nouvelle ENGLOBE TOTALEMENT une existante
   *           WHERE heure_debut >= debut AND heure_fin <= fin
   *
   * Retourne true si LIBRE (aucun conflit), false si OCCUPÉ.
   */
  async checkAvailability(
    localId: string,
    date: string,
    start: string,
    end: string,
    excludeId?: string,
    excludeObjetStartsWith?: string,
  ): Promise<boolean> {
    const dateRes = new Date(date);
    const debut   = new Date(`${date}T${start}`);
    const fin     = new Date(`${date}T${end}`);

    const conflict = await this.prisma.reservations_locaux.findFirst({
      where: {
        id_local:         localId,
        statut:           { in: ['EN_ATTENTE', 'VALIDEE'] },
        date_reservation: dateRes,
        id: excludeId ? { not: excludeId } : undefined,
        // Exclure les réservations automatiques d'un club lors de sa modification
        NOT: excludeObjetStartsWith
          ? { objet: { startsWith: excludeObjetStartsWith } }
          : undefined,
        OR: [
          {
            // Cas 1 : La nouvelle commence PENDANT une existante
            heure_debut: { lte: debut },
            heure_fin:   { gt:  debut },
          },
          {
            // Cas 2 : La nouvelle finit PENDANT une existante
            heure_debut: { lt:  fin },
            heure_fin:   { gte: fin },
          },
          {
            // Cas 3 : La nouvelle ENGLOBE TOTALEMENT une existante
            heure_debut: { gte: debut },
            heure_fin:   { lte: fin },
          },
        ],
      },
    });

    return !conflict; // true = disponible (pas de conflit)
  }

  // ─── MÉTHODES PUBLIQUES ───────────────────────────────────────────────────────

  /**
   * CRÉER UNE RÉSERVATION
   *
   * Flux :
   *   1. Charger l'utilisateur (resolveUserOrFail)
   *   2. Si RESPONSABLE_CLUB → vérifier qu'il peut accéder à ce local
   *   3. Vérifier la disponibilité du créneau (checkAvailability)
   *   4. Charger le local (pour prix_heure)
   *   5. Valider que heure_fin > heure_debut (ensureTimeRange)
   *   6. Calculer le prix : local.prix_heure × durée en heures
   *   7. Insérer la réservation avec statut = 'EN_ATTENTE'
   *
   * Prix = 0 si le local n'a pas de prix_heure (gratuit).
   * Retourne la réservation créée (sans les relations).
   */
  async create(userId: string, dto: CreateReservationDto) {
    const user = await this.resolveUserOrFail(userId);

    if (user.role === 'RESPONSABLE_CLUB') {
      await this.assertResponsableCanReserveLocal(userId, dto.id_local);
    }

    const isAvailable = await this.checkAvailability(
      dto.id_local, dto.date_reservation, dto.heure_debut, dto.heure_fin,
    );
    if (!isAvailable) {
      throw new ConflictException('Ce créneau horaire est déjà réservé ou en attente de validation.');
    }

    const local = await this.prisma.locaux.findUnique({ where: { id: dto.id_local } });
    if (!local) throw new NotFoundException("Le local spécifié n'existe pas.");

    const hDebut = new Date(`${dto.date_reservation}T${dto.heure_debut}`);
    const hFin   = new Date(`${dto.date_reservation}T${dto.heure_fin}`);
    this.ensureTimeRange(hDebut, hFin);

    const dureeHeures = (hFin.getTime() - hDebut.getTime()) / (1000 * 60 * 60);
    const prixTotal   = local.prix_heure ? Number(local.prix_heure) * dureeHeures : 0;

    return await this.prisma.reservations_locaux.create({
      data: {
        date_reservation: new Date(dto.date_reservation),
        heure_debut:      hDebut,
        heure_fin:        hFin,
        objet:            dto.objet,
        id_utilisateur:   userId,
        id_local:         dto.id_local,
        prix_total:       prixTotal,
        statut:           'EN_ATTENTE',
      },
    });
  }

  /**
   * LISTER LES RÉSERVATIONS (filtré par rôle)
   * Utilise buildReservationScopeWhere pour adapter la portée au rôle.
   * Inclut : utilisateur, local (avec centre), paiements associés.
   * Triées par date_creation DESC (la plus récente en premier).
   *
   * Logger.log() active pour déboguer les problèmes de scope en développement.
   */
  async findAll(userId?: string, role?: string) {
    this.logger.log(`findAll called with userId: ${userId}, role: ${role}`);

    if (!userId) {
      this.logger.warn('No userId provided, returning empty array');
      return [];
    }

    const where = await this.buildReservationScopeWhere(userId, role);
    this.logger.log('Built where clause:', JSON.stringify(where, null, 2));

    const reservations = await this.prisma.reservations_locaux.findMany({
      where,
      include: {
        utilisateur: { select: { nom: true, prenom: true, email: true } },
        local:       { include: { centre: true } },
        payments: {
          select: { id: true, status: true, amount: true, created_at: true },
          orderBy: { created_at: 'desc' },
        },
      },
      orderBy: { date_creation: 'desc' },
    });

    this.logger.log(`Found ${reservations.length} reservations for user ${userId} with role ${role}`);
    return reservations;
  }

  /**
   * CHANGER LE STATUT D'UNE RÉSERVATION
   *
   * Statuts valides : EN_ATTENTE, VALIDEE, REFUSEE, ANNULEE
   *
   * Droits :
   *   ANNULEE  → l'auteur OU l'ADMIN
   *   VALIDEE / REFUSEE → ADMIN ou RESPONSABLE_CENTRE uniquement
   *
   * Sécurité supplémentaire pour VALIDEE :
   *   Re-vérifie la disponibilité au moment de la validation.
   *   En effet, entre la création (EN_ATTENTE) et la validation,
   *   un autre admin peut avoir validé un créneau concurrent.
   *   → excludeId = id de cette réservation (pour ne pas se comparer à soi-même)
   *
   * Notifications push après VALIDEE ou REFUSEE :
   *   Envoyées à l'auteur de la réservation avec les détails du local et des horaires.
   *   Dans try/catch séparé : l'échec de la notif ne doit pas annuler le changement de statut.
   */
  async updateStatus(
    id: string,
    statut: string,
    requesterId: string,
    requesterRole: string,
  ) {
    const resToUpdate = await this.prisma.reservations_locaux.findUnique({
      where: { id },
      include: { local: { select: { id: true, nom: true } } },
    });
    if (!resToUpdate) throw new NotFoundException('Réservation introuvable');

    const normalizedStatus = (statut ?? '').toUpperCase();
    if (!['EN_ATTENTE', 'VALIDEE', 'REFUSEE', 'ANNULEE'].includes(normalizedStatus)) {
      throw new BadRequestException('statut doit etre EN_ATTENTE, VALIDEE, REFUSEE ou ANNULEE');
    }

    await this.resolveUserOrFail(requesterId);

    // Vérification des droits selon le statut cible
    if (normalizedStatus === 'ANNULEE') {
      const isOwner = resToUpdate.id_utilisateur === requesterId;
      if (!isOwner && requesterRole !== 'ADMIN') {
        throw new ForbiddenException('Vous ne pouvez annuler que vos propres reservations');
      }
    } else if (requesterRole !== 'ADMIN' && requesterRole !== 'RESPONSABLE_CENTRE') {
      throw new ForbiddenException('Seul l admin ou le responsable de centre peuvent modifier le statut');
    }

    // Re-vérification de disponibilité avant validation
    if (normalizedStatus === 'VALIDEE') {
      const dateStr  = resToUpdate.date_reservation.toISOString().split('T')[0];
      const startStr = resToUpdate.heure_debut.toTimeString().split(' ')[0];
      const endStr   = resToUpdate.heure_fin.toTimeString().split(' ')[0];

      const isAvailable = await this.checkAvailability(
        resToUpdate.id_local, dateStr, startStr, endStr,
        id, // Exclure sa propre réservation de la vérification
      );
      if (!isAvailable) {
        throw new ConflictException('Action impossible : Ce créneau est désormais occupé par une autre validation.');
      }
    }

    const updated = await this.prisma.reservations_locaux.update({
      where: { id },
      data: { statut: normalizedStatus },
    });

    // Notification push (décision finale uniquement)
    if (normalizedStatus === 'VALIDEE' || normalizedStatus === 'REFUSEE') {
      try {
        await this.notificationsService.createReservationDecisionNotification({
          utilisateurId:   updated.id_utilisateur,
          reservationId:   updated.id,
          localId:         updated.id_local,
          localNom:        resToUpdate.local?.nom ?? 'local',
          dateReservation: updated.date_reservation,
          heureDebut:      updated.heure_debut,
          heureFin:        updated.heure_fin,
          statut:          normalizedStatus,
          adminId:         requesterId,
        });
      } catch (err) {
        console.error('Erreur creation notification reservation :', err);
      }
    }

    return updated;
  }

  /**
   * CRÉNEAUX OCCUPÉS D'UN LOCAL À UNE DATE
   * Retourne uniquement les réservations VALIDÉES (pas EN_ATTENTE).
   * Chaque slot : { heure_debut, heure_fin, objet }
   * Triées par heure_debut ASC (ordre chronologique de la journée).
   * Utilisé dans Flutter pour colorier le calendrier horaire.
   */
  async getOccupiedSlots(localId: string, date: string) {
    return await this.prisma.reservations_locaux.findMany({
      where: {
        id_local:         localId,
        date_reservation: new Date(date),
        statut:           'VALIDEE',
      },
      select: { heure_debut: true, heure_fin: true, objet: true },
      orderBy: { heure_debut: 'asc' },
    });
  }

  /**
   * PLANNING COMPLET D'UN LOCAL
   * Toutes les réservations VALIDÉES d'un local, passées et futures.
   * Inclut l'utilisateur (nom, prénom, email) et le local avec son centre.
   * Trié par date ASC puis heure_debut ASC (ordre chronologique global).
   * Utilisé pour afficher le calendrier mensuel dans Flutter.
   */
  async getLocalPlanning(localId: string) {
    return await this.prisma.reservations_locaux.findMany({
      where: { id_local: localId, statut: 'VALIDEE' },
      include: {
        utilisateur: { select: { nom: true, prenom: true, email: true } },
        local: {
          select: {
            id: true, nom: true, type: true, prix_heure: true,
            centre: { select: { id: true, nom: true } },
          },
        },
      },
      orderBy: [{ date_reservation: 'asc' }, { heure_debut: 'asc' }],
    });
  }

  /**
   * STATISTIQUES DE RÉSERVATION (vue dashboard)
   * Calcule 4 indicateurs clés adaptés au rôle :
   *
   *   reservationCount → nombre total de réservations (hors ANNULEE)
   *   mostUsedRoom     → local le plus réservé (VALIDEE) : { roomName, count }
   *   occupancyRate    → taux d'occupation du mois en cours (%)
   *   revenueTotal     → revenus totaux des réservations VALIDEE (somme prix_total)
   *
   * Calcul du taux d'occupation :
   *   occupiedHours = somme des durées des réservations VALIDEE du mois
   *   availableHours = nb_locaux × nb_jours_dans_le_mois × 14 heures ouvrables
   *   occupancyRate  = (occupiedHours / availableHours) × 100 (plafonné à 100%)
   *
   * Les 3 requêtes (allReservations, validReservations, locauxCount) sont
   * exécutées EN PARALLÈLE via Promise.all pour optimiser les performances.
   *
   * Scope des locaux comptés selon le rôle :
   *   ADMIN              → tous les locaux
   *   RESPONSABLE_CENTRE → locaux de son centre
   *   RESPONSABLE_CLUB   → locaux des centres de ses clubs actifs
   *   Autres             → locaux où l'utilisateur a des réservations
   */
  async getReservationStatsOverview(userId: string, role?: string) {
    const baseWhere = await this.buildReservationScopeWhere(userId, role);

    const [allReservations, validReservations, scopedLocauxCount] = await Promise.all([
      // Toutes les réservations non annulées (pour le compte total)
      this.prisma.reservations_locaux.findMany({
        where: { ...baseWhere, statut: { not: 'ANNULEE' } },
        select: {
          id: true, statut: true, prix_total: true,
          date_reservation: true, heure_debut: true, heure_fin: true,
          id_local: true, local: { select: { nom: true } },
        },
      }),
      // Uniquement les VALIDEE (pour revenus + taux d'occupation + local populaire)
      this.prisma.reservations_locaux.findMany({
        where: { ...baseWhere, statut: 'VALIDEE' },
        select: {
          id: true, prix_total: true,
          date_reservation: true, heure_debut: true, heure_fin: true,
          id_local: true, local: { select: { nom: true } },
        },
      }),
      // Nombre de locaux dans la portée (pour calculer l'heure disponible totale)
      this.prisma.locaux.count({
        where:
          role === 'ADMIN' ? {}
          : role === 'RESPONSABLE_CENTRE'
            ? { centre: { utilisateurs: { some: { id: userId } } } }
          : role === 'RESPONSABLE_CLUB'
            ? { centre: { clubs: { some: { id_coach: userId, est_actif: true } } } }
          : { reservations: { some: { id_utilisateur: userId } } },
      }),
    ]);

    const reservationCount = allReservations.length;

    // Revenus totaux : somme des prix_total des réservations VALIDEE
    const revenueTotal = validReservations.reduce((sum, r) => {
      return sum + (r.prix_total ? Number(r.prix_total) : 0);
    }, 0);

    // Local le plus utilisé : Map id_local → { roomName, count }
    const usedRoomsMap = new Map<string, { roomName: string; count: number }>();
    for (const r of validReservations) {
      const key      = r.id_local;
      const roomName = r.local?.nom ?? 'Local inconnu';
      const current  = usedRoomsMap.get(key);
      usedRoomsMap.set(key, { roomName, count: (current?.count ?? 0) + 1 });
    }
    const mostUsedRoom = [...usedRoomsMap.values()].sort((a, b) => b.count - a.count)[0]
      ?? { roomName: 'Aucune salle', count: 0 };

    // Taux d'occupation du mois en cours
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
    monthEnd.setHours(23, 59, 59, 999);

    const monthlyValidReservations = validReservations.filter((r) => {
      const date = new Date(r.date_reservation);
      return date >= monthStart && date <= monthEnd;
    });

    const occupiedHours = monthlyValidReservations.reduce((sum, r) => {
      const durationMs = r.heure_fin.getTime() - r.heure_debut.getTime();
      return sum + durationMs / (1000 * 60 * 60);
    }, 0);

    const daysInMonth      = monthEnd.getDate();
    const dailyOpenHours   = 14; // Hypothèse : 14h d'ouverture par jour
    const availableHours   = Math.max(1, scopedLocauxCount * daysInMonth * dailyOpenHours);
    const occupancyRate    = Number(Math.min(100, (occupiedHours / availableHours) * 100).toFixed(2));

    return {
      reservationCount,
      mostUsedRoom,
      occupancyRate,
      revenueTotal: Number(revenueTotal.toFixed(2)),
      monthContext: {
        month:       monthStart.getMonth() + 1,
        year:        monthStart.getFullYear(),
        localsCount: scopedLocauxCount,
      },
    };
  }

  /**
   * MODIFIER UNE RÉSERVATION
   * Seul l'auteur ou un ADMIN peut modifier.
   * Si RESPONSABLE_CLUB → re-vérifie qu'il peut accéder au nouveau local.
   *
   * Vérification anti-conflit avec excludeId = id (ne se compare pas à soi-même).
   * Recalcule le prix depuis la nouvelle durée + le prix_heure du local.
   * Repasse en EN_ATTENTE après modification → re-validation admin requise.
   */
  async update(userId: string, id: string, dto: CreateReservationDto) {
    const existing = await this.prisma.reservations_locaux.findUnique({
      where: { id },
      select: { id: true, id_utilisateur: true, statut: true },
    });
    if (!existing) throw new NotFoundException('Reservation introuvable');

    const user    = await this.resolveUserOrFail(userId);
    const isOwner = existing.id_utilisateur === userId;
    if (!isOwner && user.role !== 'ADMIN') {
      throw new ForbiddenException('Vous ne pouvez modifier que vos propres reservations');
    }

    if (user.role === 'RESPONSABLE_CLUB') {
      await this.assertResponsableCanReserveLocal(userId, dto.id_local);
    }

    // excludeId = id : ne pas se comparer à sa propre réservation actuelle
    const isAvailable = await this.checkAvailability(
      dto.id_local, dto.date_reservation, dto.heure_debut, dto.heure_fin,
      id,
    );
    if (!isAvailable) throw new ConflictException('Ce nouveau créneau est déjà occupé.');

    const local = await this.prisma.locaux.findUnique({ where: { id: dto.id_local } });
    if (!local) throw new NotFoundException('Local introuvable');

    const hDebut = new Date(`${dto.date_reservation}T${dto.heure_debut}`);
    const hFin   = new Date(`${dto.date_reservation}T${dto.heure_fin}`);
    this.ensureTimeRange(hDebut, hFin);

    const dureeHeures = (hFin.getTime() - hDebut.getTime()) / (1000 * 60 * 60);
    const prixTotal   = local.prix_heure ? Number(local.prix_heure) * dureeHeures : 0;

    return await this.prisma.reservations_locaux.update({
      where: { id },
      data: {
        date_reservation: new Date(dto.date_reservation),
        heure_debut:      hDebut,
        heure_fin:        hFin,
        objet:            dto.objet,
        prix_total:       prixTotal,
        statut:           'EN_ATTENTE', // Repasse en attente → re-validation admin
      },
    });
  }

  /**
   * ANNULER UNE RÉSERVATION (action rapide)
   * Seul l'auteur ou l'ADMIN peut annuler.
   * Pas de re-vérification de disponibilité nécessaire (l'annulation libère le créneau).
   * Met statut = 'ANNULEE'.
   */
  async cancel(userId: string, id: string) {
    const existing = await this.prisma.reservations_locaux.findUnique({
      where: { id },
      select: { id: true, id_utilisateur: true },
    });
    if (!existing) throw new NotFoundException('Reservation introuvable');

    const user    = await this.resolveUserOrFail(userId);
    const isOwner = existing.id_utilisateur === userId;
    if (!isOwner && user.role !== 'ADMIN') {
      throw new ForbiddenException('Vous ne pouvez annuler que vos propres reservations');
    }

    return await this.prisma.reservations_locaux.update({
      where: { id },
      data: { statut: 'ANNULEE' },
    });
  }
}
