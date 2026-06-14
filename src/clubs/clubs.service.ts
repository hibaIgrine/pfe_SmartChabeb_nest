/**
 * ============================================================
 * FICHIER : clubs.service.ts
 * RÔLE    : Logique métier complète pour la gestion des clubs.
 * ============================================================
 *
 * C'est le service le plus complexe du projet. Il gère :
 *
 * ── HELPERS PRIVÉS ───────────────────────────────────────────
 *   weekdayIndexes           → dictionnaire jour → index (0=dim, 1=lun...)
 *   resolveDatasetClubName() → déduit la catégorie standard du club (via regex)
 *   normalizePlanningObject()→ normalise le planning JSON (string ou objet)
 *   withStartWorkflow()      → enrichit le planning avec le workflow de démarrage
 *   getNextWeekdayDate()     → calcule la prochaine date d'un jour donné
 *   generateWeeklyDates()    → génère 52 dates hebdomadaires (1 an de créneaux)
 *   normalizePlanningSlots() → extrait et valide les créneaux horaires du planning
 *   buildRecurringReservations() → construit les objets de réservation hebdomadaires
 *   extractMinimumParticipants() → lit le minimum requis depuis le planning JSON
 *   buildStartStatus()       → calcule l'état de démarrage du club (dashboard)
 *   saveBase64Image()        → convertit une image Base64 en fichier sur disque
 *
 * ── CRUD CLUBS ───────────────────────────────────────────────
 *   create()                 → crée le club + réservations récurrentes + staff (transaction)
 *   findAll()                → liste tous les clubs avec start_status
 *   findClubsForUserCentre() → clubs de mon centre + mon statut d'inscription
 *   findClubForUserCentre()  → détails d'un club de mon centre
 *   findOne()                → détails complets (staff + inscriptions via Map)
 *   update()                 → met à jour le club (logo, planning, nom_dataset)
 *   assignCoach()            → assigne ou retire un coach
 *   remove() / activate()    → soft delete / réactivation
 *
 * ── WORKFLOW DE DÉMARRAGE ────────────────────────────────────
 *   validateClubStart()      → valide le démarrage si minimum de participants atteint
 *
 * ── INSCRIPTIONS & FILE D'ATTENTE ────────────────────────────
 *   applyToClub()            → postuler (LISTE_ATTENTE si plein)
 *   updateInscriptionStatus()→ accepter/refuser + notification push
 *   removeInscription()      → supprimer + promouvoir le suivant en file d'attente
 *   leaveClub()              → quitter un club
 *   findMyClubs()            → mes inscriptions personnelles
 *   findMyStaffClubs()       → clubs où je suis staff
 *
 * ── STAFF & SUSPENSION ───────────────────────────────────────
 *   addStaffToClub()         → ajouter/mettre à jour un membre du staff
 *   deactivateStaff()        → désactiver (soft)
 *   reactivateStaff()        → réactiver
 *   suspendMember()          → suspendre temporairement un membre inscrit
 *   reactivateMember()       → lever la suspension
 *   findStaffByCentre()      → staff d'un centre (coachs, animateurs...)
 */

import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { NotificationsService } from 'src/notifications/notifications.service';
import { ReservationsService } from 'src/reservations/reservations.service';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class ClubsService {
  /**
   * TABLE DE CORRESPONDANCE JOUR → INDEX (0 = dimanche, 6 = samedi)
   * Supporte les noms en anglais (majuscules) ET en français (avec majuscule).
   * Utilisé pour calculer la prochaine occurrence d'un jour de la semaine.
   */
  private readonly weekdayIndexes: Record<string, number> = {
    SUNDAY: 0, MONDAY: 1, TUESDAY: 2, WEDNESDAY: 3, THURSDAY: 4, FRIDAY: 5, SATURDAY: 6,
    Dimanche: 0, Lundi: 1, Mardi: 2, Mercredi: 3, Jeudi: 4, Vendredi: 5, Samedi: 6,
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService, // Notifications push
    private readonly reservationsService: ReservationsService,   // Vérification dispo locaux
  ) {}

  // ─── HELPERS PRIVÉS ──────────────────────────────────────────────────────────

  /**
   * RÉSOUDRE LE NOM DATASET DU CLUB (catégorie standardisée)
   * Utilisé pour classer les clubs dans des catégories fixes (pour les filtres et stats).
   *
   * Priorité :
   *   1. Si nom_dataset ou nom_dataset_value est fourni explicitement → on l'utilise
   *   2. Sinon → on applique des règles regex sur le nom + catégorie du club
   *      pour déduire automatiquement la catégorie standardisée
   *
   * Exemple : "Club foot du quartier" + "sport" → "Football"
   *            "Atelier guitare" + "musique"    → "Chant & Musique"
   *
   * Retourne null si aucune règle ne correspond (catégorie libre).
   */
  private resolveDatasetClubName(data: {
    nom?: string;
    categorie?: string;
    nom_dataset?: string;
    nom_dataset_value?: string;
  }): string | null {
    // Priorité 1 : valeur explicitement fournie
    const explicitValue = String(data.nom_dataset ?? data.nom_dataset_value ?? '').trim();
    if (explicitValue) return explicitValue;

    // Priorité 2 : déduction par regex sur nom + catégorie
    const source = `${data.nom ?? ''} ${data.categorie ?? ''}`.toLowerCase();

    const rules: Array<{ test: RegExp; value: string }> = [
      { test: /chant|musique|choral|chorale|instrument|guitare|piano|violon|oud|derbouka|solf[eè]ge/, value: 'Chant & Musique' },
      { test: /peinture|dessin|arts? plastiques|croquis|portrait|aquarelle|acrylique|calligraphie|illustration/, value: 'Peinture & Arts Plastiques' },
      { test: /photo|photographie|cadrage|retouche|studio|reportage/, value: 'Photo' },
      { test: /video|vid[eé]o|montage|tournage|cin[eé]ma|film/, value: 'Vidéo & Montage' },
      { test: /robot|robotique|arduino|iot|capteur|programmation|javascript|python|scratch|informatique|dev/, value: 'Robotique' },
      { test: /bureaut|excel|word|powerpoint|outlook|google docs|google workspace/, value: 'Bureautique' },
      { test: /football|foot/, value: 'Football' },
      { test: /basket|basketball/, value: 'Basketball' },
      { test: /handball|hand/, value: 'Handball' },
      { test: /volley|volleyball/, value: 'Volleyball' },
      { test: /ping|tennis de table/, value: 'Ping-Pong' },
      { test: /natation|swim/, value: 'Natation' },
      { test: /danse|dance|hip-hop|breakdance|chor[eé]graph/, value: 'Danse' },
      { test: /th[eé]a?tre|scene|spectacle|dramat/, value: 'Théâtre' },
      { test: /langue|anglais|fran[cç]ais|espagnol|italien|arabe|allemand|d[eé]bat/, value: 'Langues' },
      { test: /lecture|litt[eé]r|po[eé]sie|roman|biblioth/, value: 'Club Littéraire' },
      { test: /ecol|environnement|nature|climat|recycl/, value: 'Environnement' },
      { test: /cuisine|gastrono|patisse|pâtiss/, value: 'Cuisine' },
      { test: /echecs|chess|damier/, value: 'Échecs' },
      { test: /entrepren|business|startup|crowdfunding/, value: 'Entrepreneuriat' },
      { test: /citoyen|media|m[eé]dias|journal|podcast|radio/, value: 'Éducation aux Médias' },
      { test: /leadership|mentorat|coaching/, value: 'Leadership' },
    ];

    for (const rule of rules) {
      if (rule.test.test(source)) return rule.value;
    }
    return null; // Aucune catégorie standardisée trouvée
  }

  /**
   * NORMALISER LE PLANNING (JSON ou string → objet)
   * Le champ `planning` en BDD peut être stocké sous 3 formes :
   *   - null / undefined → retourne {}
   *   - string JSON valide → parsé et retourné comme objet
   *   - string non-JSON   → retourné comme { texte: "..." }
   *   - objet JavaScript  → retourné tel quel
   *
   * Utilisé par toutes les méthodes qui lisent le planning.
   */
  private normalizePlanningObject(planning: any): Record<string, any> {
    if (!planning) return {};
    if (typeof planning === 'string') {
      try {
        const parsed = JSON.parse(planning);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
        return { texte: planning };
      } catch {
        return { texte: planning };
      }
    }
    if (typeof planning === 'object' && !Array.isArray(planning)) return planning;
    return {};
  }

  /**
   * ENRICHIR LE PLANNING AVEC LE WORKFLOW DE DÉMARRAGE
   * Ajoute ou met à jour la section start_workflow dans le planning JSON.
   *
   * Structure ajoutée :
   *   start_workflow: {
   *     minimum_participants  : nombre min d'inscrits pour démarrer (défaut: 5)
   *     centre_validation_required: true (toujours requis)
   *     centre_validated      : si le responsable du centre a validé
   *     is_started            : si le club a officiellement démarré
   *     validated_by          : UUID du responsable qui a validé
   *     validated_at          : date de validation ISO
   *   }
   *
   * Priorité pour minimum_participants :
   *   1. Valeur fournie dans minimumParticipantsRaw (si > 1)
   *   2. Valeur existante dans le planning (si > 1)
   *   3. Défaut : 5
   */
  private withStartWorkflow(planning: any, minimumParticipantsRaw?: any): Record<string, any> {
    const base = this.normalizePlanningObject(planning);
    const currentWorkflow =
      base.start_workflow && typeof base.start_workflow === 'object' ? base.start_workflow : {};

    const parsedMinimum = Number(minimumParticipantsRaw);
    const existingMinimum = Number(currentWorkflow.minimum_participants);
    const minimumParticipants =
      Number.isFinite(parsedMinimum) && parsedMinimum > 1 ? Math.floor(parsedMinimum)
      : Number.isFinite(existingMinimum) && existingMinimum > 1 ? Math.floor(existingMinimum)
      : 5;

    return {
      ...base,
      start_workflow: {
        minimum_participants: minimumParticipants,
        centre_validation_required: true,
        centre_validated: Boolean(currentWorkflow.centre_validated),
        is_started: Boolean(currentWorkflow.is_started),
        validated_by: currentWorkflow.validated_by ?? null,
        validated_at: currentWorkflow.validated_at ?? null,
      },
    };
  }

  /**
   * PROCHAINE DATE D'UN JOUR DE LA SEMAINE
   * Calcule la date de la prochaine occurrence du jour donné.
   * Si aujourd'hui est ce jour → on prend la semaine suivante (daysUntilTarget = 7).
   * Exemple : si aujourd'hui est mercredi et dayLabel = 'MONDAY' → lundi prochain.
   */
  private getNextWeekdayDate(dayLabel: string): Date {
    const targetIndex = this.weekdayIndexes[dayLabel];
    if (targetIndex === undefined) throw new BadRequestException(`Jour invalide: ${dayLabel}`);

    const nextDate = new Date();
    const currentIndex = nextDate.getDay();
    let daysUntilTarget = (targetIndex - currentIndex + 7) % 7;
    if (daysUntilTarget === 0) daysUntilTarget = 7; // Jamais aujourd'hui, toujours la prochaine
    nextDate.setDate(nextDate.getDate() + daysUntilTarget);
    return nextDate;
  }

  /** Formater une Date en 'YYYY-MM-DD' (sans l'heure) */
  private formatDateOnly(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  /**
   * GÉNÉRER 52 DATES HEBDOMADAIRES (1 an de créneaux)
   * À partir d'une date de départ, génère des dates espacées de 7 jours.
   * 52 occurrences = 52 semaines = 1 an de réservations récurrentes.
   */
  private generateWeeklyDates(startDate: Date, occurrences = 52): Date[] {
    const dates: Date[] = [];
    for (let i = 0; i < occurrences; i++) {
      const current = new Date(startDate);
      current.setDate(startDate.getDate() + i * 7);
      dates.push(current);
    }
    return dates;
  }

  /**
   * EXTRAIRE ET VALIDER LES CRÉNEAUX DU PLANNING
   * Lit le tableau `slots` du planning JSON et filtre les créneaux incomplets.
   * Un créneau valide doit avoir : day, startTime, endTime (tous non vides).
   *
   * Format attendu : { day: 'MONDAY', startTime: '09:00', endTime: '11:00' }
   */
  private normalizePlanningSlots(planning: any) {
    const normalized = this.normalizePlanningObject(planning);
    const slots = Array.isArray(normalized.slots) ? normalized.slots : [];
    return slots
      .map((slot: any) => ({
        day: (slot?.day ?? '').toString().trim(),
        startTime: (slot?.startTime ?? '').toString().trim(),
        endTime: (slot?.endTime ?? '').toString().trim(),
      }))
      .filter((slot: { day: string; startTime: string; endTime: string }) =>
        Boolean(slot.day && slot.startTime && slot.endTime),
      );
  }

  /**
   * CONSTRUIRE LES RÉSERVATIONS RÉCURRENTES D'UN CLUB
   * Pour chaque créneau du planning, génère 52 objets de réservation (1 par semaine).
   *
   * Logique :
   *   1. Pour chaque slot (jour + heure début + heure fin)
   *   2. Calcule la prochaine date de ce jour (getNextWeekdayDate)
   *   3. Génère 52 dates hebdomadaires à partir de là
   *   4. Pour chaque date → crée un objet réservation avec le prix calculé
   *
   * Normalisation des heures : '09:00' → '09:00:00' (format PostgreSQL Time)
   * Le prix est calculé : prixHeure × durée en heures.
   * Statut = 'VALIDEE' d'office (réservations bloquées pour le club).
   */
  private buildRecurringReservations(params: {
    planning: any;
    localId: string;
    clubName: string;
    userId: string;
    prixHeure?: number | null;
  }) {
    const slots = this.normalizePlanningSlots(params.planning);
    if (slots.length === 0) return [];

    return slots.flatMap((slot) => {
      const startDate = this.getNextWeekdayDate(slot.day);
      const dates = this.generateWeeklyDates(startDate, 52);
      const startHour = slot.startTime.length === 5 ? `${slot.startTime}:00` : slot.startTime;
      const endHour   = slot.endTime.length   === 5 ? `${slot.endTime}:00`   : slot.endTime;
      const durationHours =
        (new Date(`1970-01-01T${endHour}`).getTime() - new Date(`1970-01-01T${startHour}`).getTime()) /
        (1000 * 60 * 60);
      const prixTotal = params.prixHeure ? params.prixHeure * durationHours : 0;

      return dates.map((dateItem) => {
        const dateStr = this.formatDateOnly(dateItem);
        return {
          date_reservation: new Date(dateStr),
          heure_debut: new Date(`${dateStr}T${startHour}`),
          heure_fin:   new Date(`${dateStr}T${endHour}`),
          objet: `Créneau club validé: ${params.clubName}`,
          statut: 'VALIDEE',
          prix_total: prixTotal,
          id_local: params.localId,
          id_utilisateur: params.userId,
        };
      });
    });
  }

  /**
   * EXTRAIRE LE MINIMUM DE PARTICIPANTS DU PLANNING
   * Lit start_workflow.minimum_participants depuis le planning JSON.
   * Si absent ou invalide → retourne 5 (valeur par défaut).
   */
  private extractMinimumParticipants(club: { planning: any }): number {
    const planning = this.normalizePlanningObject(club.planning);
    const raw = Number((planning.start_workflow as any)?.minimum_participants);
    if (Number.isFinite(raw) && raw > 1) return Math.floor(raw);
    return 5;
  }

  /**
   * CONSTRUIRE LE START STATUS D'UN CLUB (état de démarrage)
   * Retourne un objet qui résume la progression vers le démarrage du club.
   * Affiché dans le dashboard Flutter/Web pour les responsables.
   *
   * Champs retournés :
   *   minimum_participants   → seuil requis (depuis planning JSON)
   *   accepted_participants  → nombre réel d'inscrits ACCEPTÉS
   *   minimum_reached        → true si accepted >= minimum
   *   centre_validated       → true si le responsable a validé
   *   is_started             → true si le club a officiellement démarré
   *   ready_for_validation   → minimum atteint mais pas encore validé → à valider
   *   validated_by/at        → qui a validé et quand
   */
  private buildStartStatus(club: { planning: any; accepted_participants?: number }) {
    const planning = this.normalizePlanningObject(club.planning);
    const workflow = planning.start_workflow && typeof planning.start_workflow === 'object'
      ? planning.start_workflow : {};
    const minimum  = this.extractMinimumParticipants({ planning });
    const accepted = Number(club.accepted_participants ?? 0);
    return {
      minimum_participants: minimum,
      accepted_participants: accepted,
      minimum_reached: accepted >= minimum,
      centre_validation_required: true,
      centre_validated: Boolean(workflow.centre_validated),
      is_started: Boolean(workflow.is_started),
      ready_for_validation: accepted >= minimum && !workflow.centre_validated,
      validated_by: workflow.validated_by ?? null,
      validated_at: workflow.validated_at ?? null,
    };
  }

  // ─── GESTION DES IMAGES ──────────────────────────────────────────────────────

  /**
   * SAUVEGARDER UNE IMAGE BASE64 SUR DISQUE
   * Le frontend Flutter peut envoyer une image de logo en Base64 (data:image/png;base64,...).
   * Cette méthode la décode et l'enregistre dans ./uploads/ avec un nom unique.
   *
   * Flux :
   *   1. Vérifier que c'est bien une data URI Base64 (data:image/...)
   *   2. Extraire le type MIME (png, jpg...) et les données binaires
   *   3. Générer un nom de fichier unique : club-<timestamp>-<random>.<extension>
   *   4. Créer le dossier uploads/ s'il n'existe pas
   *   5. Écrire le fichier sur disque (fs.writeFileSync)
   *   6. Retourner l'URL relative : /uploads/<filename>
   *
   * Si ce n'est pas du Base64 (déjà une URL) → retourner tel quel.
   * En cas d'erreur → retourner '' (pas de logo).
   */
  private saveBase64Image(base64Data: string): string {
    if (!base64Data || !base64Data.startsWith('data:image')) return base64Data;
    try {
      const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (!matches || matches.length !== 3) throw new Error('Format Base64 invalide');
      const extension   = matches[1].split('/')[1] || 'png';
      const imageBuffer = Buffer.from(matches[2], 'base64');
      const filename    = `club-${Date.now()}-${Math.floor(Math.random() * 10000)}.${extension}`;
      const uploadDir   = path.join(process.cwd(), 'uploads');
      if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
      fs.writeFileSync(path.join(uploadDir, filename), imageBuffer);
      return `/uploads/${filename}`;
    } catch (err) {
      console.error('Erreur image Base64:', err);
      return '';
    }
  }

  // ─── CRUD CLUBS ──────────────────────────────────────────────────────────────

  /**
   * CRÉER UN CLUB (façade publique)
   * Délègue à createWithAccessControl pour gérer la résolution du centre selon le rôle.
   */
  async create(data: any, requesterId?: string, requesterRole?: string) {
    return this.createWithAccessControl(data, requesterId, requesterRole);
  }

  /**
   * CRÉER UN CLUB AVEC CONTRÔLE D'ACCÈS (logique principale)
   *
   * Flux complet (dans une transaction Prisma atomique) :
   *   1. Résoudre le centre :
   *      - RESPONSABLE_CENTRE → force son propre centre (sécurité cross-centre)
   *      - ADMIN → utilise l'id_centre du body
   *   2. Convertir le logo Base64 → fichier disque si besoin
   *   3. Construire le planning JSON avec start_workflow (withStartWorkflow)
   *   4. Déduire le nom_dataset par regex (resolveDatasetClubName)
   *   5. Si id_local fourni → générer 52 réservations récurrentes
   *   6. $transaction :
   *      a. Créer le club (clubs.create)
   *      b. Vérifier que le local appartient au même centre (sécurité)
   *      c. Vérifier la disponibilité de chaque créneau (checkAvailability)
   *      d. Insérer les réservations (reservations_locaux.createMany)
   *      e. Insérer le staff initial si fourni (club_staff.createMany)
   *         → chaque rôle est créé dans club_roles par upsert si inexistant
   *
   * Retourne : le club créé (sans les relations).
   */
  async createWithAccessControl(
    data: any,
    requesterId?: string,
    requesterRole?: string,
  ) {
    let resolvedCentreId = data.id_centre;

    if (requesterRole === 'RESPONSABLE_CENTRE') {
      if (!requesterId) {
        throw new BadRequestException('Utilisateur responsable introuvable');
      }

      const requester = await this.prisma.utilisateurs.findUnique({
        where: { id: requesterId },
        select: { id_centre: true, role: true },
      });

      if (!requester || !requester.id_centre) {
        throw new BadRequestException(
          'Aucun centre associe au responsable courant',
        );
      }

      resolvedCentreId = requester.id_centre;
    }

    if (!resolvedCentreId) {
      throw new BadRequestException('id_centre est obligatoire');
    }

    const resolvedLocalId = data.id_local || data.id_local_souhaite || null;
    const finalLogoUrl = data.logo_url
      ? this.saveBase64Image(data.logo_url)
      : undefined;
    const finalPlanning = this.withStartWorkflow(
      data.planning,
      data.minimum_participants,
    );
    const resolvedNomDataset = this.resolveDatasetClubName(data);
    const recurringReservations = resolvedLocalId
      ? this.buildRecurringReservations({
          planning: finalPlanning,
          localId: resolvedLocalId,
          clubName: data.nom,
          userId: data.id_coach || requesterId || resolvedLocalId,
          prixHeure: null,
        })
      : [];

    return await this.prisma.$transaction(async (tx) => {
      const nouveauClub = await tx.clubs.create({
        data: {
          nom: data.nom,
          nom_dataset: resolvedNomDataset,
          description: data.description,
          categorie: data.categorie,
          id_centre: resolvedCentreId,
          id_coach: data.id_coach || undefined,
          planning: finalPlanning,
          logo_url: finalLogoUrl,
          capacite: data.capacite ? parseInt(data.capacite) : null,
          locale_fixe: data.locale_fixe ?? data.locale ?? null,
        },
      });

      if (recurringReservations.length > 0) {
        const local = await tx.locaux.findUnique({
          where: { id: resolvedLocalId },
          select: { prix_heure: true, id_centre: true },
        });

        if (!local) {
          throw new BadRequestException('Local introuvable pour le club.');
        }

        if (local.id_centre !== resolvedCentreId) {
          throw new BadRequestException(
            'Le local selectionne ne correspond pas au centre du club.',
          );
        }

        const reservationsToCreate = recurringReservations.map(
          (reservation) => {
            const durationHours =
              (reservation.heure_fin.getTime() -
                reservation.heure_debut.getTime()) /
              (1000 * 60 * 60);
            const prixTotal = local.prix_heure
              ? Number(local.prix_heure) * durationHours
              : 0;

            return {
              ...reservation,
              prix_total: prixTotal,
            };
          },
        );

        const availabilityChecks = await Promise.all(
          reservationsToCreate.map((reservation) => {
            const dateStr = reservation.date_reservation
              .toISOString()
              .split('T')[0];
            const startTime = reservation.heure_debut
              .toTimeString()
              .split(' ')[0];
            const endTime = reservation.heure_fin.toTimeString().split(' ')[0];

            return this.reservationsService.checkAvailability(
              resolvedLocalId,
              dateStr,
              startTime,
              endTime,
            );
          }),
        );

        if (availabilityChecks.some((available) => !available)) {
          throw new BadRequestException(
            'Le local choisi est indisponible pour un des créneaux du planning.',
          );
        }

        const planningInsert = await tx.reservations_locaux.createMany({
          data: reservationsToCreate,
        });

        if (!planningInsert.count) {
          throw new BadRequestException(
            "Aucune réservation n'a pu être créée pour ce club.",
          );
        }
      }

      if (data.staff && Array.isArray(data.staff)) {
        const staffData = await Promise.all(
          data.staff.map(async (s: any) => {
            const roleName = (s.role_dans_club ?? '').toString().trim();
            if (!roleName) {
              throw new BadRequestException('Rôle club requis pour le staff.');
            }

            const clubRole = await tx.club_roles.upsert({
              where: { nom: roleName.toUpperCase() },
              update: { description: undefined },
              create: {
                nom: roleName.toUpperCase(),
                description: `Rôle club ${roleName.toUpperCase()}`,
              },
            });

            return {
              id_club: nouveauClub.id,
              id_utilisateur: s.id_utilisateur,
              role_dans_club: roleName.toUpperCase(),
              id_club_role: clubRole.id,
            };
          }),
        );

        await tx.club_staff.createMany({
          data: staffData,
        });
      }
      return nouveauClub;
    });
  }

  /**
   * LISTER TOUS LES CLUBS
   * Retourne tous les clubs avec leurs inscriptions et responsables.
   * Filtre optionnel par id_centre (ex: ?id_salle=uuid, paramètre hérité de l'ancienne API).
   *
   * Inclus dans chaque club :
   *   - responsable (nom + prénom du coach)
   *   - centre (nom + gouvernorat)
   *   - toutes les inscriptions avec l'utilisateur (id, nom, prénom, email, photo)
   *   - _count.inscriptions filtrées sur ACCEPTE (pour le start_status)
   *   - start_status calculé en temps réel (buildStartStatus)
   *
   * Route publique → aucune authentification requise.
   */
  async findAll(id_centre?: string) {
    const clubs = await this.prisma.clubs.findMany({
      where: id_centre ? { id_centre } : {}, // 💡 id_salle -> id_centre
      include: {
        responsable: { select: { nom: true, prenom: true } }, // 💡 coach -> responsable
        centre: { select: { nom: true, gouvernorat: true } }, // 💡 salles -> centre
        inscriptions: {
          include: {
            utilisateur: {
              select: {
                id: true,
                nom: true,
                prenom: true,
                email: true,
                photo_profil_url: true,
              },
            },
          },
          orderBy: { date_adhesion: 'desc' },
        },
        _count: {
          select: {
            inscriptions: {
              where: { statut: 'ACCEPTE' },
            },
          },
        },
      },
      orderBy: { nom: 'asc' },
    });

    return clubs.map((club) => ({
      ...club,
      start_status: this.buildStartStatus({
        planning: club.planning,
        accepted_participants: club._count.inscriptions,
      }),
    }));
  }

  /**
   * CLUBS DE MON CENTRE (vue membre)
   * Utilisé par GET /clubs/my-centre pour l'application Flutter.
   *
   * Logique :
   *   1. Récupérer l'utilisateur avec son centre associé
   *   2. Si aucun centre → retourner { centre: null, clubs: [] }
   *   3. Récupérer tous les clubs ACTIFS de ce centre
   *   4. Pour chaque club, inclure :
   *      - Le staff actif (is_active = true)
   *      - L'inscription de L'UTILISATEUR UNIQUEMENT (filtré par userId)
   *        → my_inscription = mon propre statut dans ce club (pas tous les membres)
   *      - Le start_status calculé
   *
   * Le filtrage des inscriptions sur userId est une optimisation :
   * on ne charge que sa propre inscription, pas toute la liste (qui peut être très longue).
   */
  async findClubsForUserCentre(userId: string) {
    const user = await this.prisma.utilisateurs.findUnique({
      where: { id: userId },
      select: {
        id_centre: true,
        centre: {
          select: {
            id: true,
            nom: true,
            gouvernorat: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    if (!user.id_centre) {
      return { centre: null, clubs: [] };
    }

    const clubs = await this.prisma.clubs.findMany({
      where: {
        id_centre: user.id_centre,
        est_actif: true,
      },
      include: {
        centre: {
          select: {
            id: true,
            nom: true,
            gouvernorat: true,
          },
        },
        responsable: {
          select: {
            id: true,
            nom: true,
            prenom: true,
            photo_profil_url: true,
          },
        },
        staff: {
          where: { is_active: true },
          include: {
            utilisateur: {
              select: {
                id: true,
                nom: true,
                prenom: true,
                photo_profil_url: true,
              },
            },
          },
        },
        inscriptions: {
          where: { id_utilisateur: userId },
          select: {
            id: true,
            statut: true,
            date_adhesion: true,
            est_suspendu: true,
            motif_suspension: true,
            date_fin_suspension: true,
          },
        },
        _count: {
          select: {
            inscriptions: {
              where: { statut: 'ACCEPTE' },
            },
          },
        },
      },
      orderBy: { nom: 'asc' },
    });

    return {
      centre: user.centre,
      clubs: clubs.map((club) => ({
        ...club,
        my_inscription: club.inscriptions[0] ?? null,
        start_status: this.buildStartStatus({
          planning: club.planning,
          accepted_participants: club._count.inscriptions,
        }),
      })),
    };
  }

  /**
   * DÉTAILS D'UN CLUB DE MON CENTRE (vue membre)
   * Utilisé par GET /clubs/my-centre/:id.
   *
   * Sécurité :
   *   - Valide que clubId est un UUID valide (regex) avant d'interroger la BDD
   *   - Le findFirst utilise id_centre: user.id_centre → empêche d'accéder à un
   *     club d'un autre centre même si on connaît son UUID (isolation cross-centre)
   *   - Si club inexistant ou pas dans son centre → 404 NotFoundException
   *
   * Retourne : { centre, club: { ...données, my_inscription, start_status } }
   */
  async findClubForUserCentre(userId: string, clubId: string) {
    if (!clubId || !/^[0-9a-fA-F-]{36}$/.test(clubId)) {
      throw new BadRequestException('Identifiant de club invalide');
    }

    const user = await this.prisma.utilisateurs.findUnique({
      where: { id: userId },
      select: {
        id_centre: true,
        centre: {
          select: {
            id: true,
            nom: true,
            gouvernorat: true,
            adresse: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    if (!user.id_centre) {
      throw new BadRequestException('Aucun centre associe a votre compte');
    }

    const club = await this.prisma.clubs.findFirst({
      where: {
        id: clubId,
        id_centre: user.id_centre,
        est_actif: true,
      },
      include: {
        centre: {
          select: {
            id: true,
            nom: true,
            gouvernorat: true,
            adresse: true,
          },
        },
        responsable: {
          select: {
            id: true,
            nom: true,
            prenom: true,
            photo_profil_url: true,
          },
        },
        staff: {
          where: { is_active: true },
          include: {
            utilisateur: {
              select: {
                id: true,
                nom: true,
                prenom: true,
                role: true,
                photo_profil_url: true,
              },
            },
          },
        },
        inscriptions: {
          where: { id_utilisateur: userId },
          select: {
            id: true,
            statut: true,
            date_adhesion: true,
            est_suspendu: true,
            motif_suspension: true,
            date_fin_suspension: true,
          },
        },
        _count: {
          select: {
            inscriptions: {
              where: { statut: 'ACCEPTE' },
            },
          },
        },
      },
    });

    if (!club) {
      throw new NotFoundException('Club introuvable dans votre centre');
    }

    return {
      centre: user.centre,
      club: {
        ...club,
        my_inscription: club.inscriptions[0] ?? null,
        start_status: this.buildStartStatus({
          planning: club.planning,
          accepted_participants: club._count.inscriptions,
        }),
      },
    };
  }

  /**
   * DÉTAILS COMPLETS D'UN CLUB (vue admin / publique)
   * Utilisé par GET /clubs/:id.
   *
   * Optimisation N+1 évitée via Map :
   *   Au lieu de faire un include profond (qui génère des JOINs lents sur les grandes tables),
   *   on récupère staff et inscriptions séparément, puis on construit une Map userId → user
   *   et on fait les jointures en mémoire.
   *
   * Flux :
   *   1. Valider UUID → charger le club (avec centre + responsable)
   *   2. Charger staffRows + inscriptionRows en PARALLÈLE (Promise.all)
   *   3. Extraire tous les userId uniques (Set pour dédupliquer)
   *   4. Charger tous ces utilisateurs en une seule requête (findMany where id IN [...])
   *   5. Construire usersMap (Map<id, user>) pour lookups O(1)
   *   6. Charger les club_roles des staff (même optimisation)
   *   7. Associer chaque staffRow/inscriptionRow à son utilisateur via la Map
   *   8. Filtrer ceux dont l'utilisateur n'existe plus (utilisateur !== null)
   *   9. Calculer acceptedParticipants (filter statut=ACCEPTE)
   *   10. Retourner avec start_status
   */
  async findOne(id: string) {
    if (!id || !/^[0-9a-fA-F-]{36}$/.test(id)) {
      throw new BadRequestException('Identifiant de club invalide');
    }

    const club = await this.prisma.clubs.findUnique({
      where: { id },
      include: {
        centre: { select: { id: true, nom: true } },
        responsable: { select: { id: true, nom: true, prenom: true } },
      },
    });

    if (!club) throw new NotFoundException('Club introuvable');

    const [staffRows, inscriptionRows] = await Promise.all([
      this.prisma.club_staff.findMany({ where: { id_club: id } }),
      this.prisma.inscriptions_clubs.findMany({
        where: { id_club: id },
        orderBy: { date_adhesion: 'desc' },
      }),
    ]);

    const userIds = Array.from(
      new Set([
        ...staffRows.map((s) => s.id_utilisateur),
        ...inscriptionRows.map((i) => i.id_utilisateur),
      ]),
    );

    const users = userIds.length
      ? await this.prisma.utilisateurs.findMany({
          where: { id: { in: userIds } },
          select: {
            id: true,
            nom: true,
            prenom: true,
            email: true,
            photo_profil_url: true,
          },
        })
      : [];

    const usersMap = new Map(users.map((user) => [user.id, user]));

    const clubRoleIds = Array.from(
      new Set(
        staffRows
          .map((item) => item.id_club_role)
          .filter((roleId): roleId is string => Boolean(roleId)),
      ),
    );

    const clubRoles = clubRoleIds.length
      ? await this.prisma.club_roles.findMany({
          where: { id: { in: clubRoleIds } },
          select: { id: true, nom: true, description: true },
        })
      : [];

    const clubRolesMap = new Map(clubRoles.map((role) => [role.id, role]));

    const staff = staffRows
      .map((item) => ({
        ...item,
        utilisateur: usersMap.get(item.id_utilisateur) ?? null,
        club_role: item.id_club_role
          ? (clubRolesMap.get(item.id_club_role) ?? null)
          : null,
      }))
      .filter((item) => item.utilisateur !== null);

    const inscriptions = inscriptionRows
      .map((item) => ({
        ...item,
        utilisateur: usersMap.get(item.id_utilisateur) ?? null,
      }))
      .filter((item) => item.utilisateur !== null);

    const acceptedParticipants = inscriptions.filter(
      (item) => item.statut === 'ACCEPTE',
    ).length;

    return {
      ...club,
      staff,
      inscriptions,
      start_status: this.buildStartStatus({
        planning: club.planning,
        accepted_participants: acceptedParticipants,
      }),
    };
  }

  /**
   * ASSIGNER / RETIRER UN COACH
   * Met à jour id_coach sur le club.
   * Si coachId = null → le club n'a plus de coach assigné.
   * Pas de vérification d'existence car null est valide (désassignation).
   */
  async assignCoach(clubId: string, coachId: string | null) {
    return await this.prisma.clubs.update({
      where: { id: clubId },
      data: { id_coach: coachId },
    });
  }

  /**
   * METTRE À JOUR UN CLUB
   * Permet de modifier n'importe quel champ du club.
   *
   * Cas spéciaux gérés :
   *   - logo_url en Base64 → converti en fichier disque (saveBase64Image)
   *   - planning → fusionné avec le workflow existant (withStartWorkflow préserve is_started)
   *     Si aucun planning envoyé → on garde le planning actuel de la BDD
   *   - nom_dataset → recalculé automatiquement par regex
   *     Si nom_dataset fourni explicitement → il prend la priorité
   *   - capacite → parsé en entier (parseInt) car peut arriver comme string
   *
   * Les champs undefined ne sont pas envoyés à Prisma (Prisma ignore les undefined).
   */
  async update(id: string, data: any) {
    let finalLogoUrl = data.logo_url;
    if (finalLogoUrl && finalLogoUrl.startsWith('data:image')) {
      finalLogoUrl = this.saveBase64Image(finalLogoUrl);
    }

    const current = await this.prisma.clubs.findUnique({
      where: { id },
      select: { planning: true, nom: true, categorie: true, nom_dataset: true },
    });

    let finalPlanning = this.withStartWorkflow(
      data.planning !== undefined ? data.planning : current?.planning,
      data.minimum_participants,
    );
    const resolvedNomDataset = this.resolveDatasetClubName({
      nom: data.nom ?? current?.nom,
      categorie: data.categorie ?? current?.categorie,
      nom_dataset: data.nom_dataset,
      nom_dataset_value: data.nom_dataset_value,
    });

    return await this.prisma.clubs.update({
      where: { id },
      data: {
        nom: data.nom,
        nom_dataset: resolvedNomDataset ?? undefined,
        description: data.description,
        categorie: data.categorie,
        id_centre: data.id_centre, // 💡 id_salle -> id_centre
        id_coach: data.id_coach || undefined,
        logo_url: finalLogoUrl !== undefined ? finalLogoUrl : undefined,
        planning: finalPlanning !== undefined ? finalPlanning : undefined,
        capacite: data.capacite ? parseInt(data.capacite) : undefined,
        locale_fixe:
          data.locale_fixe !== undefined ? data.locale_fixe : undefined,
      },
    });
  }

  /**
   * VALIDER LE DÉMARRAGE OFFICIEL D'UN CLUB
   * Appelé par PATCH /clubs/:id/start — étape finale du workflow de démarrage.
   *
   * Vérifications dans l'ordre :
   *   1. Le club existe (sinon 404)
   *   2. Le demandeur est ADMIN ou RESPONSABLE_CENTRE (sinon 400)
   *   3. Si RESPONSABLE_CENTRE → le club doit être dans SON centre (isolation)
   *   4. Le nombre d'inscrits ACCEPTÉS doit atteindre le minimum requis
   *      → `count(inscriptions where statut='ACCEPTE')` vs extractMinimumParticipants
   *      → Erreur 400 si insuffisant avec le seuil affiché
   *
   * Si toutes les vérifications passent :
   *   - Met centre_validated = true, is_started = true dans le planning JSON
   *   - Enregistre validated_by (requesterId) et validated_at (ISO timestamp)
   *   - Retourne le club mis à jour + le start_status recalculé
   */
  async validateClubStart(
    clubId: string,
    requesterId: string,
    requesterRole: string,
  ) {
    const club = await this.prisma.clubs.findUnique({
      where: { id: clubId },
      select: {
        id: true,
        nom: true,
        id_centre: true,
        planning: true,
      },
    });

    if (!club) {
      throw new NotFoundException('Club introuvable');
    }

    if (requesterRole !== 'ADMIN' && requesterRole !== 'RESPONSABLE_CENTRE') {
      throw new BadRequestException(
        'Validation réservée au responsable centre.',
      );
    }

    if (requesterRole === 'RESPONSABLE_CENTRE') {
      const requester = await this.prisma.utilisateurs.findUnique({
        where: { id: requesterId },
        select: { id_centre: true },
      });

      if (!requester?.id_centre || requester.id_centre !== club.id_centre) {
        throw new BadRequestException(
          'Vous ne pouvez valider que les clubs de votre centre.',
        );
      }
    }

    const acceptedParticipants = await this.prisma.inscriptions_clubs.count({
      where: {
        id_club: clubId,
        statut: 'ACCEPTE',
      },
    });

    const minimumParticipants = this.extractMinimumParticipants(club);

    if (acceptedParticipants < minimumParticipants) {
      throw new BadRequestException(
        `Le club doit atteindre au moins ${minimumParticipants} participants acceptés avant validation finale.`,
      );
    }

    const planning = this.withStartWorkflow(club.planning, minimumParticipants);
    const workflow =
      planning.start_workflow && typeof planning.start_workflow === 'object'
        ? planning.start_workflow
        : {};

    planning.start_workflow = {
      ...workflow,
      minimum_participants: minimumParticipants,
      centre_validation_required: true,
      centre_validated: true,
      is_started: true,
      validated_by: requesterId,
      validated_at: new Date().toISOString(),
    };

    const updated = await this.prisma.clubs.update({
      where: { id: clubId },
      data: {
        planning,
      },
      select: {
        id: true,
        nom: true,
        planning: true,
      },
    });

    return {
      ...updated,
      start_status: this.buildStartStatus({
        planning: updated.planning,
        accepted_participants: acceptedParticipants,
      }),
      message: 'Validation finale effectuée. Le club peut démarrer.',
    };
  }

  /**
   * AJOUTER UN MEMBRE AU STAFF D'UN CLUB
   * Gère l'idempotence : si l'utilisateur est déjà dans le staff → mise à jour du rôle.
   *
   * Flux :
   *   1. Vérifier que le club existe
   *   2. Normaliser le nom du rôle (uppercase + trim)
   *   3. Upsert dans club_roles : crée le rôle s'il n'existe pas, sinon ne fait rien
   *      (les rôles sont free-text : ENTRAINEUR, ANIMATEUR, ARBITRE, etc.)
   *   4. Chercher si un enregistrement club_staff existe pour (clubId, userId)
   *      → Clé composite unique : id_club_id_utilisateur
   *   5. Si existant → update (rôle + is_active = true)
   *   6. Si inexistant → create
   */
  async addStaffToClub(
    clubId: string,
    data: { id_utilisateur: string; role_dans_club: string },
  ) {
    const club = await this.prisma.clubs.findUnique({ where: { id: clubId } });
    if (!club) throw new NotFoundException('Club introuvable');

    const roleName = (data.role_dans_club ?? '').toString().trim();
    if (!roleName) {
      throw new BadRequestException('Rôle club requis.');
    }

    const clubRole = await this.prisma.club_roles.upsert({
      where: { nom: roleName.toUpperCase() },
      update: { description: undefined },
      create: {
        nom: roleName.toUpperCase(),
        description: `Rôle club ${roleName.toUpperCase()}`,
      },
    });

    const existingStaff = await this.prisma.club_staff.findUnique({
      where: {
        id_club_id_utilisateur: {
          id_club: clubId,
          id_utilisateur: data.id_utilisateur,
        },
      },
    });

    if (existingStaff) {
      return await this.prisma.club_staff.update({
        where: { id: existingStaff.id },
        data: {
          role_dans_club: roleName.toUpperCase(),
          id_club_role: clubRole.id,
          is_active: true,
        },
      });
    }

    return await this.prisma.club_staff.create({
      data: {
        id_club: clubId,
        id_utilisateur: data.id_utilisateur,
        role_dans_club: roleName.toUpperCase(),
        id_club_role: clubRole.id,
        is_active: true,
      },
    });
  }

  /**
   * DÉSACTIVER UN MEMBRE DU STAFF
   * Soft-désactivation : is_active = false (conserve l'historique).
   * Vérifie que l'entrée staff appartient bien au bon club (sécurité : pas de cross-club).
   */
  async deactivateStaff(clubId: string, staffId: string) {
    const staff = await this.prisma.club_staff.findFirst({
      where: { id: staffId, id_club: clubId },
    });

    if (!staff) {
      throw new NotFoundException('Staff introuvable pour ce club.');
    }

    return await this.prisma.club_staff.update({
      where: { id: staff.id },
      data: { is_active: false } as any,
    });
  }

  /** RÉACTIVER UN MEMBRE DU STAFF — inverse de deactivateStaff (is_active = true) */
  async reactivateStaff(clubId: string, staffId: string) {
    const staff = await this.prisma.club_staff.findFirst({
      where: { id: staffId, id_club: clubId },
    });

    if (!staff) {
      throw new NotFoundException('Staff introuvable pour ce club.');
    }

    return await this.prisma.club_staff.update({
      where: { id: staff.id },
      data: { is_active: true } as any,
    });
  }

  /**
   * DÉSACTIVER UN CLUB (soft delete)
   * est_actif = false — toutes les données (inscriptions, staff, planning) sont conservées.
   * Le club n'apparaît plus dans les listes publiques mais reste en BDD pour l'historique.
   */
  async remove(id: string) {
    const club = await this.prisma.clubs.findUnique({ where: { id } });
    if (!club) throw new NotFoundException('Club introuvable');
    return await this.prisma.clubs.update({
      where: { id },
      data: { est_actif: false },
    });
  }

  /** RÉACTIVER UN CLUB désactivé — est_actif = true (inverse de remove) */
  async activate(id: string) {
    const club = await this.prisma.clubs.findUnique({ where: { id } });
    if (!club) throw new NotFoundException('Club introuvable');
    return await this.prisma.clubs.update({
      where: { id },
      data: { est_actif: true },
    });
  }

  // ─── INSCRIPTIONS & FILE D'ATTENTE ───────────────────────────────────────────

  /**
   * POSTULER À UN CLUB (applyToClub)
   * L'utilisateur connecté soumet une demande d'adhésion au club.
   *
   * Exécuté dans une transaction Prisma pour atomicité :
   *
   * Vérifications :
   *   1. Club existe → sinon 404
   *   2. Utilisateur dans le même centre que le club → sinon 400
   *      (empêche les inscriptions cross-centre)
   *   3. Demande déjà existante ?
   *      - statut REFUSE → réouverte (mise à jour vers EN_ATTENTE ou LISTE_ATTENTE)
   *      - autre statut  → 409 ConflictException ("demande déjà active")
   *
   * Logique file d'attente (LISTE_ATTENTE) :
   *   - Si club.capacite est défini ET count(inscrits ACCEPTES) >= capacite
   *     → isFull = true → statut = 'LISTE_ATTENTE'
   *   - Sinon → statut = 'EN_ATTENTE' (attente de validation par le responsable)
   *
   * Retourne : l'inscription créée ou mise à jour.
   */
  async applyToClub(userId: string, clubId: string) {
    return await this.prisma.$transaction(async (tx) => {
      const club = await tx.clubs.findUnique({
        where: { id: clubId },
        select: {
          id_centre: true,
          capacite: true,
          _count: {
            select: { inscriptions: { where: { statut: 'ACCEPTE' } } },
          },
        },
      });

      if (!club) throw new NotFoundException('Club introuvable');

      const user = await tx.utilisateurs.findUnique({
        where: { id: userId },
        select: { id_centre: true },
      });

      if (!user?.id_centre || user.id_centre !== club.id_centre) {
        throw new BadRequestException(
          'Vous ne pouvez rejoindre que les clubs de votre centre.',
        );
      }

      const existingRequest = await tx.inscriptions_clubs.findUnique({
        where: {
          id_utilisateur_id_club: { id_utilisateur: userId, id_club: clubId },
        },
      });

      const isFull =
        club.capacite !== null && club._count.inscriptions >= club.capacite;
      const targetStatus = isFull ? 'LISTE_ATTENTE' : 'EN_ATTENTE';

      if (existingRequest) {
        if (existingRequest.statut === 'REFUSE') {
          return await tx.inscriptions_clubs.update({
            where: { id: existingRequest.id },
            data: {
              statut: targetStatus,
              date_adhesion: new Date(),
              date_validation: null,
              responsable_id: null,
            },
          });
        }
        throw new ConflictException(
          'Une demande est déjà active pour ce club.',
        );
      }

      return await tx.inscriptions_clubs.create({
        data: { id_utilisateur: userId, id_club: clubId, statut: targetStatus },
      });
    });
  }

  /**
   * CHANGER LE STATUT D'UNE INSCRIPTION (valider / refuser)
   * Appelé par PATCH /clubs/inscription/:id/status
   *
   * Logique :
   *   1. Charger l'inscription avec le club (pour capacite + _count ACCEPTE)
   *   2. Si statut = 'ACCEPTE' et capacité pleine → 409 ConflictException
   *   3. Mettre à jour : statut + date_validation + responsable_id (qui a décidé)
   *   4. Si ACCEPTE ou REFUSE → envoyer une notification push au membre
   *      (dans try/catch séparé pour que l'inscription ne soit pas annulée si notif échoue)
   *
   * Note : le passage de LISTE_ATTENTE → EN_ATTENTE est géré par removeInscription
   * (pas ici). updateInscriptionStatus traite les demandes EN_ATTENTE → ACCEPTE/REFUSE.
   */
  async updateInscriptionStatus(
    inscriptionId: string,
    statut: string,
    responsableId: string,
  ) {
    const inscription = await this.prisma.inscriptions_clubs.findUnique({
      where: { id: inscriptionId },
      include: {
        club: {
          include: {
            _count: {
              select: { inscriptions: { where: { statut: 'ACCEPTE' } } },
            },
          },
        },
      },
    });

    if (!inscription) {
      throw new NotFoundException('Inscription introuvable.');
    }

    if (statut === 'ACCEPTE') {
      if (
        inscription.club.capacite &&
        inscription.club._count.inscriptions >= inscription.club.capacite
      ) {
        throw new ConflictException('Capacité maximale atteinte.');
      }
    }

    const updatedInscription = await this.prisma.inscriptions_clubs.update({
      where: { id: inscriptionId },
      data: {
        statut,
        date_validation: new Date(),
        responsable_id: responsableId,
      },
    });

    if (statut === 'ACCEPTE' || statut === 'REFUSE') {
      try {
        await this.notificationsService.createMembershipDecisionNotification({
          utilisateurId: inscription.id_utilisateur,
          clubId: inscription.id_club,
          clubNom: inscription.club.nom,
          inscriptionId: inscription.id,
          statut,
          responsableId,
        });
      } catch (err) {
        console.error('Erreur creation notification adhesion :', err);
      }
    }

    return updatedInscription;
  }

  /**
   * SUPPRIMER UNE INSCRIPTION (action admin)
   * Exécuté dans une transaction pour gérer la promotion de file d'attente.
   *
   * Flux atomique :
   *   1. Vérifier que l'inscription existe (sinon 404)
   *   2. Supprimer l'inscription (hard delete)
   *   3. Chercher le premier de la LISTE_ATTENTE pour ce club (orderBy date_adhesion ASC)
   *   4. Si quelqu'un attend → le passer en EN_ATTENTE (promotion automatique)
   *
   * La promotion est automatique et dans la même transaction :
   * si la suppression échoue, la promotion n'a pas lieu (atomicité).
   */
  async removeInscription(id: string) {
    return await this.prisma.$transaction(async (tx) => {
      const current = await tx.inscriptions_clubs.findUnique({ where: { id } });
      if (!current) throw new NotFoundException('Inscription introuvable');

      await tx.inscriptions_clubs.delete({ where: { id } });

      const next = await tx.inscriptions_clubs.findFirst({
        where: { id_club: current.id_club, statut: 'LISTE_ATTENTE' },
        orderBy: { date_adhesion: 'asc' },
      });

      if (next) {
        await tx.inscriptions_clubs.update({
          where: { id: next.id },
          data: { statut: 'EN_ATTENTE' },
        });
      }
      return { success: true };
    });
  }

  /**
   * QUITTER UN CLUB (action du membre lui-même)
   * Utilise deleteMany (pas delete) pour être idempotent si appelé plusieurs fois.
   * Si aucune inscription trouvée → 404 ("Non inscrit").
   * Note : ne déclenche PAS de promotion de file d'attente (contrairement à removeInscription).
   */
  async leaveClub(userId: string, clubId: string) {
    const del = await this.prisma.inscriptions_clubs.deleteMany({
      where: { id_utilisateur: userId, id_club: clubId },
    });
    if (del.count === 0) throw new NotFoundException('Non inscrit.');
    return { message: 'Succès' };
  }

  /**
   * MES CLUBS EN TANT QUE MEMBRE
   * Retourne toutes les inscriptions de l'utilisateur avec le club associé.
   * Inclut le statut de l'inscription (EN_ATTENTE, ACCEPTE, REFUSE, LISTE_ATTENTE).
   * Utilisé par GET /clubs/my-inscriptions.
   */
  async findMyClubs(userId: string) {
    return await this.prisma.inscriptions_clubs.findMany({
      where: { id_utilisateur: userId },
      include: {
        club: {
          select: {
            id: true,
            nom: true,
            logo_url: true,
            categorie: true,
            description: true,
            locale_fixe: true,
            planning: true,
          },
        },
      },
    });
  }

  /**
   * MES CLUBS EN TANT QUE STAFF
   * Retourne les clubs où l'utilisateur est membre actif du staff (is_active = true).
   * Trié par nom de club (orderBy club.nom asc).
   * Utilisé par GET /clubs/my-staff-clubs.
   */
  async findMyStaffClubs(userId: string) {
    return await this.prisma.club_staff.findMany({
      where: {
        id_utilisateur: userId,
        is_active: true,
      },
      include: {
        club: {
          select: {
            id: true,
            nom: true,
            logo_url: true,
            categorie: true,
            description: true,
            locale_fixe: true,
          },
        },
      },
      orderBy: {
        club: {
          nom: 'asc',
        },
      },
    });
  }

  // ─── SUSPENSION DES MEMBRES ───────────────────────────────────────────────────

  /**
   * SUSPENDRE UN MEMBRE DE CLUB
   * Enregistre une suspension temporaire sur l'inscription :
   *   est_suspendu = true
   *   date_fin_suspension = date fournie en string ISO (new Date(dateFin))
   *   motif_suspension = raison de la suspension
   *
   * La suspension n'annule pas l'inscription — le membre reste inscrit mais
   * est marqué comme suspendu (l'app Flutter affiche un badge "suspendu").
   */
  async suspendMember(id: string, data: { dateFin: string; motif: string }) {
    return await this.prisma.inscriptions_clubs.update({
      where: { id },
      data: {
        est_suspendu: true,
        date_fin_suspension: new Date(data.dateFin),
        motif_suspension: data.motif,
      },
    });
  }

  /**
   * LEVER LA SUSPENSION D'UN MEMBRE
   * Remet l'inscription à l'état normal :
   *   est_suspendu = false
   *   date_fin_suspension = null
   *   motif_suspension = null
   */
  async reactivateMember(id: string) {
    return await this.prisma.inscriptions_clubs.update({
      where: { id },
      data: {
        est_suspendu: false,
        date_fin_suspension: null,
        motif_suspension: null,
      },
    });
  }

  /**
   * LISTER LE STAFF DISPONIBLE D'UN CENTRE
   * Retourne les utilisateurs d'un centre ayant un rôle "staff" (COACH, ANIMATEUR, RESPONSABLE_CLUB).
   * Utilisé pour peupler le sélecteur de staff lors de la création/modification d'un club.
   * Retourne uniquement id, nom, prénom, rôle (pas d'infos sensibles).
   */
  async findStaffByCentre(id_centre: string) {
    return await this.prisma.utilisateurs.findMany({
      where: {
        id_centre,
        role: { in: ['COACH', 'ANIMATEUR', 'RESPONSABLE_CLUB'] },
      },
      select: { id: true, nom: true, prenom: true, role: true },
    });
  }
}
