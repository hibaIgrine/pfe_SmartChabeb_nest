/**
 * ============================================================
 * FICHIER : users.service.ts
 * RÔLE    : Logique métier complète pour la gestion des utilisateurs.
 * ============================================================
 *
 * Ce service est le plus riche du projet. Il couvre :
 *
 * ── GAMIFICATION ─────────────────────────────────────────────
 *   resolveBadge()             → calcule le badge selon les points (STARTER/ACTIVE/ELITE/LEGEND)
 *   resolveNextBadge()         → calcule la progression vers le prochain badge (%)
 *   getGamificationProfile()   → profil complet (points, badge, rang dans le centre)
 *   getGamificationLeaderboard() → classement trié par points
 *
 * ── INSCRIPTION ──────────────────────────────────────────────
 *   checkEmailAvailable()      → vérifie si un email est libre (sans créer de compte)
 *   create()                   → crée ou met à jour le compte via upsert + envoie un email
 *
 * ── PROFIL ───────────────────────────────────────────────────
 *   update()                   → met à jour les infos + hache le MDP si fourni
 *   updateProfile()            → mise à jour légère (genre, date de naissance)
 *   verifyEmail()              → valide l'OTP et marque l'email comme vérifié
 *
 * ── SOCIAL (follow/unfollow) ─────────────────────────────────
 *   findPublicProfile()        → profil public + isFollowing + compteurs
 *   followUser()               → s'abonner à un utilisateur
 *   unfollowUser()             → se désabonner
 *   findFollowingUsers()       → liste de mes abonnements
 *
 * ── LISTES & RECHERCHE ───────────────────────────────────────
 *   findAll()                  → liste filtrée selon le rôle (ADMIN/COACH/RESPONSABLE)
 *   findAllForMessaging()      → liste allégée pour le système de messagerie
 *   findOne()                  → profil complet d'un utilisateur par ID
 *   findStaffByCentre()        → tout le staff d'un centre
 *   findAdherentsByCentre()    → uniquement les adhérents d'un centre
 *
 * ── ACTIONS ADMIN ────────────────────────────────────────────
 *   changeRole()               → change le rôle (avec vérifications RBAC)
 *   banUser()                  → ban temporaire avec date_fin_ban
 *   changeStatus()             → activer/désactiver un compte
 *   updateStatus()             → helper interne (met à jour rôle + id_role)
 *   assignToCentreByEmail()    → lie un user à un centre par email
 *   assignResponsibleToCentre() → nomme un responsable (transaction atomique)
 *   remove()                   → soft delete du compte
 */

import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { MailerService } from '@nestjs-modules/mailer';
import { EtablissementsService } from 'src/etablissements/etablissements.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private mailerService: MailerService,
    private etablissementsService: EtablissementsService,
  ) {}

  /**
   * RÉSOUDRE LE BADGE (méthode privée, non exposée en HTTP)
   * Détermine le badge de l'utilisateur selon son nombre de points.
   * Seuils : 0→STARTER, 100→ACTIVE, 250→ELITE, 500→LEGEND
   */
  private resolveBadge(points: number) {
    if (points >= 500) {
      return {
        key: 'LEGEND',
        label: 'Legende',
        minPoints: 500,
      };
    }
    if (points >= 250) {
      return {
        key: 'ELITE',
        label: 'Elite',
        minPoints: 250,
      };
    }
    if (points >= 100) {
      return {
        key: 'ACTIVE',
        label: 'Actif',
        minPoints: 100,
      };
    }
    return {
      key: 'STARTER',
      label: 'Debutant',
      minPoints: 0,
    };
  }

  /**
   * CALCULER LA PROGRESSION VERS LE PROCHAIN BADGE (méthode privée)
   * Retourne le prochain palier, les points restants et le pourcentage de progression.
   *
   * Exemple : 150 points → prochain badge ELITE (250)
   *   previousThreshold = 100, span = 150, currentInSpan = 50
   *   progressPercent = round(50/150 * 100) = 33%
   *
   * Si le badge maximum (LEGEND, 500 pts) est atteint → progressPercent = 100%.
   */
  private resolveNextBadge(points: number) {
    const nextThreshold =
      points < 100 ? 100 : points < 250 ? 250 : points < 500 ? 500 : null;
    if (!nextThreshold) {
      return {
        label: 'Maximum atteint',
        targetPoints: null,
        remainingPoints: 0,
        progressPercent: 100,
      };
    }

    // Seuil du badge précédent (plancher de la tranche actuelle)
    const previousThreshold =
      nextThreshold === 100 ? 0 : nextThreshold === 250 ? 100 : 250;
    const span = nextThreshold - previousThreshold;            // Taille de la tranche
    const currentInSpan = Math.max(points - previousThreshold, 0); // Points dans la tranche
    const progressPercent = Math.min(
      100,
      Math.round((currentInSpan / span) * 100),
    );

    return {
      label:
        nextThreshold === 100
          ? 'Actif'
          : nextThreshold === 250
            ? 'Elite'
            : 'Legende',
      targetPoints: nextThreshold,
      remainingPoints: Math.max(nextThreshold - points, 0),
      progressPercent,
    };
  }

  /**
   * PROFIL DE GAMIFICATION D'UN UTILISATEUR
   * Retourne les points, le badge actuel, la progression vers le prochain badge,
   * et le rang de l'utilisateur dans son centre.
   *
   * Calcul du rang :
   *   On compte le nombre d'utilisateurs actifs du même centre qui ont PLUS de points.
   *   rank = ce nombre + 1 (si 3 personnes ont plus de points → je suis 4ème)
   *
   * Si l'utilisateur n'a pas de centre → le rang est calculé parmi tous les utilisateurs.
   */
  async getGamificationProfile(userId: string) {
    const user = await this.prisma.utilisateurs.findUnique({
      where: { id: userId },
      select: {
        id: true,
        nom: true,
        prenom: true,
        photo_profil_url: true,
        points: true,
        id_centre: true,
      },
    });

    if (!user) throw new NotFoundException('Utilisateur introuvable');

    const points = user.points ?? 0;
    const badge = this.resolveBadge(points);
    const nextBadge = this.resolveNextBadge(points);

    // Périmètre du classement : actifs + même centre (si centre défini)
    const rankScopeWhere = {
      compte_actif: true,
      ...(user.id_centre ? { id_centre: user.id_centre } : {}),
    };

    // Nombre d'utilisateurs avec PLUS de points dans le même périmètre
    const higherCount = await this.prisma.utilisateurs.count({
      where: {
        ...rankScopeWhere,
        points: { gt: points }, // gt = "greater than"
      },
    });

    return {
      user: {
        id: user.id,
        nom: user.nom,
        prenom: user.prenom,
        photo_profil_url: user.photo_profil_url,
      },
      points,
      badge,
      nextBadge,
      rank: higherCount + 1, // Si 0 personnes ont plus → je suis 1er
    };
  }

  /**
   * CLASSEMENT GÉNÉRAL (LEADERBOARD)
   * Retourne la liste des utilisateurs triés par points décroissants.
   *
   * Règles RBAC :
   *   - ADMIN → voit tous les utilisateurs actifs de tous les centres (limit 1000)
   *   - Autres → voient uniquement les membres de leur propre centre (limit 3-50)
   *
   * safeLimit : clamp entre 3 et 50 pour éviter les abus (min 3 résultats, max 50)
   * On calcule le badge de chaque entrée à la volée avec resolveBadge().
   */
  async getGamificationLeaderboard(userId: string, limit = 10) {
    const safeLimit = Math.min(Math.max(limit, 3), 50);

    const requester = await this.prisma.utilisateurs.findUnique({
      where: { id: userId },
      select: { id_centre: true, role: true },
    });

    const leaderboardScopeWhere = {
      compte_actif: true,
      // Si non-ADMIN avec un centre → filtrer sur ce centre
      ...(requester?.role !== 'ADMIN' && requester?.id_centre
        ? { id_centre: requester.id_centre }
        : {}),
    };

    const effectiveLimit = requester?.role === 'ADMIN' ? 1000 : safeLimit;

    const leaderboard = await this.prisma.utilisateurs.findMany({
      where: leaderboardScopeWhere,
      select: {
        id: true,
        nom: true,
        prenom: true,
        points: true,
        photo_profil_url: true,
        centre: {
          select: { id: true, nom: true, gouvernorat: true },
        },
      },
      orderBy: [
        { points: 'desc' }, // Tri principal : plus de points en premier
        { nom: 'asc' },     // Tri secondaire : alphabétique en cas d'égalité de points
      ],
      take: effectiveLimit,
    });

    // Ajouter le rang et le badge à chaque entrée
    return leaderboard.map((item, index) => {
      const points = item.points ?? 0;
      return {
        rank: index + 1, // index commence à 0, le rang à 1
        id: item.id,
        nom: item.nom,
        prenom: item.prenom,
        photo_profil_url: item.photo_profil_url,
        points,
        badge: this.resolveBadge(points),
        centre: item.centre,
      };
    });
  }

  // ─── INSCRIPTION ─────────────────────────────────────────────────────────────

  /**
   * VÉRIFIER LA DISPONIBILITÉ D'UN EMAIL
   * Normalise l'email (trim + lowercase) puis cherche en BDD.
   * Retourne { available: true } si aucun compte n'existe avec cet email.
   * Utilisé pour le feedback temps réel dans le formulaire Flutter.
   */
  async checkEmailAvailable(email: string) {
    if (!email || typeof email !== 'string') {
      return { available: false };
    }
    const sanitized = email.trim().toLowerCase();
    if (!sanitized) return { available: false };
    const user = await this.prisma.utilisateurs.findUnique({
      where: { email: sanitized },
    });
    return { available: !user }; // !user = true si l'email n'existe pas en BDD
  }

  /**
   * CRÉER UN COMPTE UTILISATEUR (inscription)
   *
   * Flux complet :
   *   1. Récupère l'objet rôle 'ADHERENT' depuis la table `roles` (pour avoir son UUID)
   *   2. Génère un sel et hache le mot de passe avec bcrypt
   *   3. Génère un code OTP à 6 chiffres (pour la vérification email)
   *   4. Convertit date_naissance du format 'YYYY-MM-DD' vers un objet Date ISO
   *   5. UPSERT l'utilisateur :
   *      → S'il existe déjà (créé lors de sendVerificationCode) → on met à jour ses infos
   *      → Sinon → on crée un nouvel enregistrement complet
   *   6. Envoie l'email de bienvenue avec le code OTP
   *
   * Pourquoi UPSERT et pas CREATE ?
   *   Le flow SmartChabeb crée déjà un utilisateur minimal lors de l'envoi du code OTP
   *   (dans AuthService.sendVerificationCode). Ici on vient compléter ce profil.
   *   L'upsert évite une erreur de doublon si l'utilisateur recommence le processus.
   *
   * est_verifie = true dès la création car on considère que l'email a déjà été
   * vérifié à l'étape OTP précédente (avant d'arriver à POST /users).
   */
  async create(createUserDto: any) {
    try {
      // Étape 1 : récupérer l'UUID du rôle ADHERENT (table `roles` normalisée)
      const roleObj = await this.prisma.roles.findUnique({
        where: { nom: 'ADHERENT' },
      });

      // Étape 2 : hacher le mot de passe
      const salt = await bcrypt.genSalt();
      const hashedPassword = await bcrypt.hash(createUserDto.mot_de_passe, salt);

      // Étape 3 : générer un code OTP pour l'email de bienvenue
      const vCode = Math.floor(100000 + Math.random() * 900000).toString();

      // Étape 4 : convertir la date (PostgreSQL attend un DateTime complet, pas juste YYYY-MM-DD)
      let dateNaissance: Date | undefined = undefined;
      if (createUserDto.date_naissance) {
        const dateStr = createUserDto.date_naissance;
        if (typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
          dateNaissance = new Date(dateStr + 'T00:00:00Z'); // Minuit UTC
        } else {
          dateNaissance = new Date(createUserDto.date_naissance);
        }
      }

      // Étape 5 : upsert (créer ou mettre à jour)
      const user = await this.prisma.utilisateurs.upsert({
        where: { email: createUserDto.email.trim().toLowerCase() },
        update: {
          // Mise à jour si l'utilisateur existait déjà (flux normal après OTP)
          nom: createUserDto.nom,
          prenom: createUserDto.prenom,
          mot_de_passe: hashedPassword,
          genre: createUserDto.genre || null,
          date_naissance: dateNaissance || null,
          id_centre: createUserDto.id_centre || null,
        },
        create: {
          // Création complète si l'utilisateur n'existait pas encore
          nom: createUserDto.nom,
          prenom: createUserDto.prenom,
          email: createUserDto.email.trim().toLowerCase(),
          mot_de_passe: hashedPassword,
          role: 'ADHERENT',
          id_role: roleObj?.id,
          code_verification: vCode,
          est_verifie: true, // Email déjà vérifié à l'étape OTP précédente
          genre: createUserDto.genre || null,
          date_naissance: dateNaissance || null,
          id_centre: createUserDto.id_centre || null,
        },
      });

      console.log(`\n[INSCRIPTION] Code OTP pour ${user.email} : ${vCode}\n`);

      // Étape 6 : envoyer l'email de bienvenue (non bloquant, erreur captée séparément)
      try {
        await this.mailerService.sendMail({
          to: user.email,
          subject: 'SmartChabeb - Code de vérification',
          html: `
            <div style="font-family: sans-serif; padding: 20px; background-color: #F7F3E9; border-radius: 20px;">
              <h3 style="color: #436D75;">Bienvenue ${user.prenom} !</h3>
              <p>Voici ton code pour activer ton compte SmartChabeb :</p>
              <div style="background-color: white; padding: 15px; border-radius: 10px; font-size: 24px; font-weight: bold; text-align: center; color: #E98A7D; letter-spacing: 5px;">
                ${vCode}
              </div>
            </div>
          `,
        });
      } catch (mailError: unknown) {
        const message = mailError instanceof Error ? mailError.message : String(mailError);
        console.error('ERREUR ENVOI MAIL :', message);
        // On ne lève pas l'erreur → l'inscription réussit même si le mail échoue
      }

      return user;
    } catch (error: unknown) {
      // P2002 = contrainte unique violée (email déjà utilisé)
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code?: string }).code === 'P2002'
      ) {
        throw new ConflictException('Cet email est déjà utilisé.');
      }
      throw error;
    }
  }

  // ─── PROFIL & STATUTS ────────────────────────────────────────────────────────

  /**
   * METTRE À JOUR LE PROFIL COMPLET (route PATCH /users/:id)
   * Gère plusieurs cas spéciaux avant la mise à jour en BDD :
   *
   * 1. MOT DE PASSE : si fourni et non vide → on le hache avec bcrypt
   *    Si vide ou absent → on supprime le champ du DTO pour ne pas écraser l'existant
   *
   * 2. ÉTABLISSEMENT : utilise EtablissementsService.findOrCreate() pour
   *    s'assurer que l'établissement existe en BDD avant d'enregistrer son nom
   *
   * 3. DATE DE NAISSANCE : PostgreSQL attend un DateTime ISO complet.
   *    Flutter envoie 'YYYY-MM-DD' → on ajoute 'T00:00:00Z' pour le rendre valide.
   *
   * Retourne { user, status: 'PROFILE_UPDATED' } pour que le frontend
   * puisse déclencher une action spécifique après la mise à jour.
   */
  async update(id: string, updateUserDto: any) {
    const currentUser = await this.prisma.utilisateurs.findUnique({ where: { id } });
    if (!currentUser) throw new UnauthorizedException('Utilisateur non trouvé');

    const status = 'PROFILE_UPDATED';

    // 1. Hacher le mot de passe si fourni
    if (updateUserDto.mot_de_passe && updateUserDto.mot_de_passe.trim() !== '') {
      const salt = await bcrypt.genSalt();
      updateUserDto.mot_de_passe = await bcrypt.hash(updateUserDto.mot_de_passe, salt);
    } else {
      // Supprimer le champ pour ne pas mettre '' ou null en BDD par accident
      delete updateUserDto.mot_de_passe;
    }

    // 2. Résoudre l'établissement scolaire (findOrCreate)
    if (updateUserDto.etablissement_etude !== undefined) {
      if (updateUserDto.etablissement_etude && updateUserDto.etablissement_etude.trim() !== '') {
        const etab = await this.etablissementsService.findOrCreate(updateUserDto.etablissement_etude);
        updateUserDto.etablissement_etude = etab?.nom || null;
      } else {
        updateUserDto.etablissement_etude = null;
      }
    }

    // 3. Convertir la date au format ISO attendu par PostgreSQL
    if (updateUserDto.date_naissance) {
      const dateStr = updateUserDto.date_naissance;
      if (typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        updateUserDto.date_naissance = new Date(dateStr + 'T00:00:00Z');
      }
    }

    const updatedUser = await this.prisma.utilisateurs.update({
      where: { id },
      data: updateUserDto,
    });

    return { user: updatedUser, status };
  }

  /**
   * VÉRIFIER L'EMAIL (route POST /users/verify)
   * Valide le code OTP reçu par email et marque le compte comme vérifié.
   * Après cette étape, l'utilisateur peut se connecter normalement.
   */
  async verifyEmail(email: string, code: string) {
    const user = await this.prisma.utilisateurs.findUnique({ where: { email } });
    if (!user || user.code_verification !== code)
      throw new UnauthorizedException('Code incorrect.');

    // Marquer l'email comme vérifié et effacer le code (usage unique)
    return await this.prisma.utilisateurs.update({
      where: { email },
      data: { est_verifie: true, code_verification: null },
    });
  }

  /**
   * MISE À JOUR LÉGÈRE DU PROFIL (route PATCH /users/update-profile)
   * Étape 3 de l'onboarding Flutter : uniquement genre + date_naissance.
   * Identifie l'utilisateur par email (pas d'ID, car pas encore de JWT).
   * L'email est normalisé (toLowerCase + trim) pour correspondre à la BDD.
   */
  async updateProfile(email: string, updateProfileDto: any) {
    try {
      const dataToUpdate: any = {
        genre: updateProfileDto.genre,
      };

      // Convertir la date au format ISO DateTime (même logique que update())
      if (updateProfileDto.date_naissance) {
        const dateStr = updateProfileDto.date_naissance;
        if (typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
          dataToUpdate.date_naissance = new Date(dateStr + 'T00:00:00Z');
        } else {
          dataToUpdate.date_naissance = new Date(updateProfileDto.date_naissance);
        }
      }

      const user = await this.prisma.utilisateurs.update({
        where: { email: email.toLowerCase().trim() },
        data: dataToUpdate,
      });
      return user;
    } catch (error) {
      console.error('Erreur updateProfile:', error);
      throw new UnauthorizedException('Impossible de mettre à jour le profil');
    }
  }

  // ─── LISTES & RECHERCHE ──────────────────────────────────────────────────────

  /**
   * LISTER LES UTILISATEURS (filtrage RBAC selon le rôle du demandeur)
   *
   * 3 cas distincts selon le rôle :
   *
   * CAS 1 — COACH :
   *   Voit uniquement les ADHÉRENTS de son propre centre.
   *   Un coach ne doit pas voir les membres d'autres centres.
   *
   * CAS 2 — RESPONSABLE_CENTRE :
   *   Voit tous les membres de son centre (tous rôles sauf CHATBOT).
   *   Peut donc voir les coachs, adhérents et responsables de club de son centre.
   *
   * CAS 3 — ADMIN (et GESTIONNAIRE) :
   *   Voit TOUS les utilisateurs de toute l'application (sauf CHATBOT).
   *   Le rôle CHATBOT est un compte technique pour le bot IA, pas un vrai utilisateur.
   *
   * Chaque résultat inclut :
   *   - centre           → infos du centre rattaché
   *   - inscriptions_clubs → clubs auxquels l'utilisateur est inscrit (avec détails du club)
   *   - clubs_diriges    → clubs que l'utilisateur dirige (responsable de club)
   */
  async findAll(requesterId?: string, requesterRole?: string) {
    try {
      // CAS 1 : COACH → voit seulement ses adhérents
      if (requesterRole === 'COACH' && requesterId) {
        const coach = await this.prisma.utilisateurs.findUnique({
          where: { id: requesterId },
          select: { id_centre: true },
        });

        if (!coach || !coach.id_centre) return [];

        return await this.prisma.utilisateurs.findMany({
          where: { id_centre: coach.id_centre, role: 'ADHERENT' },
          include: {
            centre: true,
            inscriptions_clubs: { include: { club: true } },
            clubs_diriges: { select: { id: true, nom: true } },
          },
          orderBy: { nom: 'asc' },
        });
      }

      // CAS 2 : RESPONSABLE_CENTRE → voit tous les membres de son centre
      if (requesterRole === 'RESPONSABLE_CENTRE' && requesterId) {
        const responsable = await this.prisma.utilisateurs.findUnique({
          where: { id: requesterId },
          select: { id_centre: true },
        });

        if (!responsable || !responsable.id_centre) return [];

        return await this.prisma.utilisateurs.findMany({
          where: {
            id_centre: responsable.id_centre,
            NOT: { role: 'CHATBOT' }, // Exclure le compte bot
          },
          include: {
            centre: { select: { id: true, nom: true, gouvernorat: true } },
            inscriptions_clubs: { include: { club: true } },
            clubs_diriges: { select: { id: true, nom: true } },
          },
          orderBy: { nom: 'asc' },
        });
      }

      // CAS 3 : ADMIN → vue globale de tous les utilisateurs (sauf CHATBOT)
      return await this.prisma.utilisateurs.findMany({
        where: { NOT: { role: 'CHATBOT' } },
        include: {
          centre: { select: { id: true, nom: true, gouvernorat: true } },
          inscriptions_clubs: { include: { club: true } },
          clubs_diriges: { select: { id: true, nom: true } },
        },
        orderBy: { nom: 'asc' },
      });
    } catch (error) {
      console.error('Erreur findAll Users:', error);
      return [];
    }
  }

  async findAllForMessaging(requesterId?: string) {
    try {
      return await this.prisma.utilisateurs.findMany({
        where: {
          compte_actif: true,
          role: { not: 'CHATBOT' },
          nom: { not: '' },
          ...(requesterId ? { id: { not: requesterId } } : {}),
        },
        select: {
          id: true,
          nom: true,
          prenom: true,
          photo_profil_url: true,
          role: true,
          is_online: true,
          last_seen_at: true,
        },
        orderBy: { nom: 'asc' },
      });
    } catch (error) {
      console.error('Erreur findAllForMessaging Users:', error);
      return [];
    }
  }

  async findOne(id: string) {
    const user = await this.prisma.utilisateurs.findUnique({
      where: { id },
      include: {
        centre: true,
        inscriptions_clubs: { include: { club: true } },
        clubs_diriges: {
          select: { id: true, nom: true },
        },
      },
    });
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    return user;
  }

  /**
   * PROFIL PUBLIC D'UN UTILISATEUR
   * Retourne les informations visibles par tous les utilisateurs connectés.
   *
   * Données retournées : nom, prenom, bio, genre, photo, lieu, établissement,
   * points, centre, et les compteurs (followers, following, posts).
   *
   * Deux champs calculés ajoutés à la réponse :
   *   isMe        → true si le viewer regarde son propre profil (pas de bouton "suivre")
   *   isFollowing → true si le viewer suit déjà cet utilisateur
   *                 (faux si isMe, sinon vérifié dans la table user_follows)
   *
   * Renommage des compteurs Prisma :
   *   follower_users → followers (plus lisible pour le frontend)
   *   following_users → following
   */
  async findPublicProfile(targetUserId: string, viewerUserId: string) {
    const user = await this.prisma.utilisateurs.findUnique({
      where: { id: targetUserId },
      select: {
        id: true, nom: true, prenom: true, role: true, bio: true,
        genre: true, date_naissance: true, photo_profil_url: true,
        lieu_habite: true, etablissement_etude: true, points: true,
        centre: { select: { id: true, nom: true, gouvernorat: true } },
        _count: {
          select: {
            follower_users: true,   // Nombre de personnes qui me suivent
            following_users: true,  // Nombre de personnes que je suis
            posts: true,
          },
        },
      },
    });

    if (!user) throw new NotFoundException('Utilisateur introuvable');

    const isMe = viewerUserId === targetUserId;

    // Vérifier si le viewer suit déjà la cible (1 requête COUNT suffit)
    const isFollowing = isMe
      ? false
      : (await this.prisma.user_follows.count({
          where: { follower_id: viewerUserId, followed_id: targetUserId },
        })) > 0;

    return {
      ...user,
      // Renommer les clés pour une meilleure lisibilité côté frontend
      _count: {
        followers: user._count.follower_users,
        following: user._count.following_users,
        posts: user._count.posts,
      },
      isMe,
      isFollowing,
    };
  }

  /**
   * SUIVRE UN UTILISATEUR
   * Crée une relation follower↔followed dans la table user_follows.
   * Utilise UPSERT → idempotent : appeler 2 fois ne crée pas de doublon.
   * update: {} → si la relation existe déjà, on ne change rien.
   * Impossible de se suivre soi-même (vérification avant l'upsert).
   */
  async followUser(followerId: string, followedId: string) {
    if (followerId === followedId) {
      throw new ConflictException('Vous ne pouvez pas vous suivre vous-meme');
    }

    const target = await this.prisma.utilisateurs.findUnique({
      where: { id: followedId },
      select: { id: true },
    });
    if (!target) throw new NotFoundException('Utilisateur introuvable');

    await this.prisma.user_follows.upsert({
      where: {
        // Clé composite unique (follower_id, followed_id) définie dans le schema Prisma
        follower_id_followed_id: { follower_id: followerId, followed_id: followedId },
      },
      update: {}, // Ne rien modifier si la relation existe déjà
      create: { follower_id: followerId, followed_id: followedId },
    });

    return { success: true };
  }

  /**
   * NE PLUS SUIVRE UN UTILISATEUR
   * deleteMany → ne lève pas d'erreur si la relation n'existe pas (idempotent).
   */
  async unfollowUser(followerId: string, followedId: string) {
    await this.prisma.user_follows.deleteMany({
      where: { follower_id: followerId, followed_id: followedId },
    });
    return { success: true };
  }

  /**
   * MES ABONNEMENTS (liste des gens que je suis)
   * Retourne les entrées de user_follows où je suis le follower,
   * avec les infos de base de chaque personne suivie (followed).
   * Triées par date de suivi décroissante (le plus récent en premier).
   */
  async findFollowingUsers(userId: string) {
    return this.prisma.user_follows.findMany({
      where: { follower_id: userId },
      orderBy: { created_at: 'desc' },
      include: {
        followed: {
          select: { id: true, nom: true, prenom: true, photo_profil_url: true, role: true },
        },
      },
    });
  }

  async findFollowersOfUser(userId: string) {
    return this.prisma.user_follows.findMany({
      where: { followed_id: userId },
      orderBy: { created_at: 'desc' },
      include: {
        follower: {
          select: { id: true, nom: true, prenom: true, photo_profil_url: true, role: true },
        },
      },
    });
  }

  async findFollowingOfUser(userId: string) {
    return this.prisma.user_follows.findMany({
      where: { follower_id: userId },
      orderBy: { created_at: 'desc' },
      include: {
        followed: {
          select: { id: true, nom: true, prenom: true, photo_profil_url: true, role: true },
        },
      },
    });
  }

  // ─── ACTIONS ADMINISTRATIVES ─────────────────────────────────────────────────

  /**
   * CHANGER LE RÔLE D'UN UTILISATEUR
   * Vérifie les permissions RBAC avant de modifier le rôle.
   *
   * Si le demandeur est RESPONSABLE_CENTRE :
   *   - Ne peut attribuer que ADHERENT ou RESPONSABLE_CLUB (pas ADMIN, pas COACH...)
   *   - Ne peut agir que sur les membres de SON centre (vérification en BDD)
   *   - Ne peut pas changer le rôle d'un ADMIN ou d'un autre RESPONSABLE_CENTRE
   *
   * Si le demandeur est ADMIN : aucune restriction.
   *
   * Promise.all() → on récupère les infos du demandeur ET de la cible en parallèle
   * pour éviter 2 requêtes séquentielles (optimisation).
   *
   * Délègue la mise à jour à updateStatus() qui synchronise aussi id_role.
   */
  async changeRole(targetId: string, role: string, requesterId?: string, requesterRole?: string) {
    if (requesterRole === 'RESPONSABLE_CENTRE') {
      const allowedRoles = ['ADHERENT', 'RESPONSABLE_CLUB'];
      if (!allowedRoles.includes(role.toUpperCase())) {
        throw new ForbiddenException(
          'Vous ne pouvez attribuer que les rôles Adhérent ou Responsable Club',
        );
      }

      // Récupérer demandeur + cible en parallèle
      const [requester, target] = await Promise.all([
        this.prisma.utilisateurs.findUnique({ where: { id: requesterId }, select: { id_centre: true } }),
        this.prisma.utilisateurs.findUnique({ where: { id: targetId }, select: { id_centre: true, role: true } }),
      ]);

      if (!requester?.id_centre || requester.id_centre !== target?.id_centre) {
        throw new ForbiddenException('Vous ne pouvez gérer que les membres de votre centre');
      }

      if (['ADMIN', 'RESPONSABLE_CENTRE'].includes(target?.role ?? '')) {
        throw new ForbiddenException('Vous ne pouvez pas modifier le rôle de cet utilisateur');
      }
    }

    return await this.updateStatus(targetId, { role });
  }

  /**
   * BANNIR UN UTILISATEUR TEMPORAIREMENT
   * Calcule la date de fin du ban (aujourd'hui + `days` jours).
   * Met compte_actif = false, date_fin_ban et motif_ban en BDD.
   * L'auto-unban est géré dans JwtStrategy.validate() lors de chaque requête.
   *
   * Mêmes restrictions RBAC que changeRole() pour les RESPONSABLE_CENTRE.
   */
  async banUser(id: string, days: number, reason: string, requesterId?: string, requesterRole?: string) {
    if (requesterRole === 'RESPONSABLE_CENTRE') {
      const [requester, target] = await Promise.all([
        this.prisma.utilisateurs.findUnique({ where: { id: requesterId }, select: { id_centre: true } }),
        this.prisma.utilisateurs.findUnique({ where: { id }, select: { id_centre: true, role: true } }),
      ]);

      if (!requester?.id_centre || requester.id_centre !== target?.id_centre) {
        throw new ForbiddenException('Vous ne pouvez bloquer que les membres de votre centre');
      }

      if (['ADMIN', 'RESPONSABLE_CENTRE'].includes(target?.role ?? '')) {
        throw new ForbiddenException('Vous ne pouvez pas bloquer cet utilisateur');
      }
    }

    // Calculer la date de fin du ban
    const finBan = new Date();
    finBan.setDate(finBan.getDate() + days); // +days jours à partir d'aujourd'hui

    return await this.prisma.utilisateurs.update({
      where: { id },
      data: { compte_actif: false, date_fin_ban: finBan, motif_ban: reason },
    });
  }

  /**
   * HELPER INTERNE : mettre à jour le statut / rôle
   * Centralise la logique de mise à jour pour éviter la duplication.
   *
   * Synchronisation rôle ↔ id_role :
   *   La table utilisateurs a DEUX colonnes liées au rôle :
   *     - role (string énuméré : 'ADMIN', 'COACH', etc.)
   *     - id_role (UUID vers la table `roles`)
   *   Quand on change le rôle, on doit mettre à jour les DEUX en même temps.
   *   On normalise le rôle (UPPERCASE + underscores) avant de chercher son UUID.
   */
  async updateStatus(id: string, data: any) {
    if (data.role) {
      // Normaliser : 'Responsable Club' → 'RESPONSABLE_CLUB'
      const roleName = data.role.toUpperCase().replace(/\s+/g, '_');
      const roleObj = await this.prisma.roles.findUnique({ where: { nom: roleName } });
      data.role = roleName;
      data.id_role = roleObj?.id; // Synchroniser l'UUID du rôle
    }
    return await this.prisma.utilisateurs.update({
      where: { id },
      data,
      include: {
        centre: true,
        inscriptions_clubs: { include: { club: true } },
      },
    });
  }

  /**
   * ACTIVER / DÉSACTIVER UN COMPTE
   * Passe compte_actif à true ou false.
   * Mêmes restrictions RBAC que changeRole() pour les RESPONSABLE_CENTRE.
   * Délègue à updateStatus() pour la mise à jour effective.
   */
  async changeStatus(targetId: string, active: boolean, requesterId: string, requesterRole: string) {
    if (requesterRole === 'RESPONSABLE_CENTRE') {
      const [requester, target] = await Promise.all([
        this.prisma.utilisateurs.findUnique({ where: { id: requesterId }, select: { id_centre: true } }),
        this.prisma.utilisateurs.findUnique({ where: { id: targetId }, select: { id_centre: true, role: true } }),
      ]);

      if (!requester?.id_centre || requester.id_centre !== target?.id_centre) {
        throw new ForbiddenException('Vous ne pouvez gérer que les membres de votre centre');
      }

      if (['ADMIN', 'RESPONSABLE_CENTRE'].includes(target?.role ?? '')) {
        throw new ForbiddenException('Vous ne pouvez pas modifier le statut de cet utilisateur');
      }
    }

    return await this.updateStatus(targetId, { compte_actif: active });
  }

  /**
   * ASSIGNER UN UTILISATEUR À UN CENTRE PAR EMAIL
   * Met à jour id_centre de l'utilisateur identifié par son email.
   * Utilisé lors de l'onboarding (étape choix du centre).
   */
  async assignToCentreByEmail(email: string, id_centre: string) {
    return await this.prisma.utilisateurs.update({
      where: { email },
      data: { id_centre },
    });
  }

  /**
   * NOMMER UN RESPONSABLE DE CENTRE (transaction atomique)
   * Opération délicate : un centre ne peut avoir qu'UN seul RESPONSABLE_CENTRE.
   *
   * Flux en transaction ($transaction garantit l'atomicité) :
   *   1. Vérifier que le centre existe
   *   2. Trouver l'ancien responsable du centre (s'il existe)
   *   3. DANS UNE MÊME TRANSACTION :
   *      a. Rétrograder l'ancien responsable → ADHERENT
   *      b. Promouvoir le nouvel utilisateur → RESPONSABLE_CENTRE + lier au centre
   *
   * Pourquoi une transaction ?
   *   Si l'étape (b) échoue après (a), l'ancien responsable aurait été rétrogradé
   *   sans que le nouveau soit nommé → le centre n'aurait plus de responsable.
   *   La transaction garantit que les deux opérations réussissent ensemble ou échouent ensemble.
   *
   * Promise.all() → récupère les UUIDs du centre et du rôle en parallèle (optimisation).
   */
  async assignResponsibleToCentre(userId: string, id_centre: string) {
    // Récupérer le centre et le rôle RESPONSABLE_CENTRE en parallèle
    const [centre, roleObj] = await Promise.all([
      this.prisma.centres.findUnique({ where: { id: id_centre } }),
      this.prisma.roles.findUnique({ where: { nom: 'RESPONSABLE_CENTRE' } }),
    ]);

    if (!centre) throw new NotFoundException('Centre introuvable');

    const adherentRole = await this.prisma.roles.findUnique({ where: { nom: 'ADHERENT' } });

    // Chercher l'ancien responsable du centre (si différent du nouvel utilisateur)
    const previousResponsible = await this.prisma.utilisateurs.findFirst({
      where: { id_centre, role: 'RESPONSABLE_CENTRE', NOT: { id: userId } },
      select: { id: true },
    });

    // Transaction atomique : les deux mises à jour réussissent ensemble ou échouent ensemble
    return await this.prisma.$transaction(async (tx) => {
      // Étape a : rétrograder l'ancien responsable si nécessaire
      if (previousResponsible) {
        await tx.utilisateurs.update({
          where: { id: previousResponsible.id },
          data: { role: 'ADHERENT', id_role: adherentRole?.id },
        });
      }

      // Étape b : promouvoir le nouvel utilisateur et le lier au centre
      return await tx.utilisateurs.update({
        where: { id: userId },
        data: { id_centre, role: 'RESPONSABLE_CENTRE', id_role: roleObj?.id },
        include: { centre: true },
      });
    });
  }

  /**
   * STAFF D'UN CENTRE
   * Retourne tous les utilisateurs rattachés à un centre (tous rôles confondus).
   * Champs limités (select) pour ne retourner que l'essentiel.
   */
  async findStaffByCentre(id_centre: string) {
    return await this.prisma.utilisateurs.findMany({
      where: { id_centre },
      select: { id: true, nom: true, prenom: true, email: true, role: true },
    });
  }

  /**
   * ADHÉRENTS D'UN CENTRE
   * Retourne uniquement les utilisateurs avec rôle ADHERENT dans un centre donné.
   * Utilisé par les coachs pour voir leur liste de membres.
   */
  async findAdherentsByCentre(id_centre: string) {
    return await this.prisma.utilisateurs.findMany({
      where: { id_centre, role: 'ADHERENT' },
      select: { id: true, nom: true, prenom: true, email: true, role: true },
      orderBy: { nom: 'asc' },
    });
  }

  /**
   * DÉSACTIVER UN COMPTE (soft delete)
   * Passe compte_actif = false sans supprimer l'enregistrement.
   * L'utilisateur ne peut plus se connecter mais toutes ses données sont conservées.
   */
  async remove(id: string) {
    return await this.prisma.utilisateurs.update({
      where: { id },
      data: { compte_actif: false },
    });
  }
}
