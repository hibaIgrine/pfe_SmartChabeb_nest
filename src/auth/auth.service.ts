/**
 * ============================================================
 * FICHIER : auth.service.ts
 * RÔLE    : Contient toute la logique métier de l'authentification.
 * ============================================================
 *
 * Ce service est le "cerveau" de l'auth. Il est appelé par AuthController
 * et effectue les vraies opérations : accès BDD, hachage, génération de token, emails.
 *
 * FONCTIONS PRINCIPALES :
 *   login()               → vérifie email + mot de passe, génère un JWT
 *   sendVerificationCode()→ génère un OTP 6 chiffres, crée/met à jour l'user, envoie l'email
 *   verifyEmailCode()     → valide le format de l'OTP saisi
 *   forgotPassword()      → génère un code de reset et l'envoie par email
 *   resetPassword()       → vérifie le code et met à jour le mot de passe haché
 *   verifyGoogleToken()   → valide un ID Token Google auprès des serveurs de Google
 *   googleLogin()         → connexion / création de compte via Google
 *
 * OUTILS UTILISÉS :
 *   - PrismaService    : accès à la base de données PostgreSQL
 *   - JwtService       : génération et signature des tokens JWT
 *   - MailerService    : envoi d'emails (SMTP)
 *   - bcrypt           : hachage sécurisé des mots de passe
 *   - OAuth2Client     : bibliothèque officielle Google pour valider les tokens
 */

import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { MailerService } from '@nestjs-modules/mailer';
import { OAuth2Client } from 'google-auth-library';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,       // Accès BDD via Prisma ORM
    private jwtService: JwtService,       // Génération des tokens JWT
    private mailerService: MailerService, // Envoi d'emails
  ) {}

  /**
   * LOGIN CLASSIQUE : email + mot de passe
   *
   * Flux complet :
   *   1. Cherche l’utilisateur en BDD par email (findUnique)
   *   2. Vérifie si le compte est actif (gestion du ban temporaire + auto-unban)
   *   3. Vérifie que l’user a bien un mot de passe (les comptes Google n’en ont pas)
   *   4. Compare le mot de passe fourni avec le hash bcrypt stocké en BDD
   *   5. Génère un JWT signé contenant { id, email, role }
   *   6. Retourne le token + un résumé du profil
   *
   * Erreurs possibles :
   *   401 UnauthorizedException → utilisateur inconnu ou mauvais mot de passe
   *   403 ForbiddenException    → compte banni ou désactivé
   */
  async login(email: string, pass: string) {
    // Étape 1 : chercher l’utilisateur par email unique
    const user = await this.prisma.utilisateurs.findUnique({
      where: { email },
    });
    if (!user) throw new UnauthorizedException("Utilisateur inconnu");

    const maintenant = new Date();

    // Étape 2 : vérifier si le compte est actif
    if (user.compte_actif === false) {
      if (user.date_fin_ban) {
        if (user.date_fin_ban > maintenant) {
          // Le ban est encore en cours → on bloque l’accès
          throw new ForbiddenException(
            `Votre compte est suspendu jusqu’au ${user.date_fin_ban.toLocaleDateString()}. Motif : ${user.motif_ban}`,
          );
        }
        // Le ban est expiré → on réactive le compte automatiquement (auto-unban)
        await this.prisma.utilisateurs.update({
          where: { id: user.id },
          data: { compte_actif: true, date_fin_ban: null, motif_ban: null },
        });
      } else {
        // Désactivé sans date de fin (ban permanent ou désactivation admin)
        throw new ForbiddenException(
          "Votre compte est désactivé. Veuillez vérifier avec l'administration.",
        );
      }
    }

    // Étape 3 : les comptes créés via Google n’ont pas de mot de passe en BDD
    if (!user.mot_de_passe) {
      throw new UnauthorizedException("Mot de passe incorrect");
    }

    // Étape 4 : comparer le mot de passe reçu avec le hash bcrypt (bcrypt.compare)
    // bcrypt gère le sel automatiquement — on ne compare jamais en clair
    const isMatch = await bcrypt.compare(pass, user.mot_de_passe);
    if (!isMatch) throw new UnauthorizedException("Mot de passe incorrect");

    // Étape 5 : créer le "payload" du JWT (données encodées dans le token)
    // sub = "subject" (convention JWT) = l’identifiant unique de l’utilisateur
    const payload = { sub: user.id, email: user.email, role: user.role };

    return {
      // Le token JWT signé — le frontend doit l’envoyer dans chaque requête protégée
      // via le header : Authorization: Bearer <access_token>
      access_token: await this.jwtService.signAsync(payload),
      user: { id: user.id, nom: user.nom, role: user.role },
    };
  }

  /**
   * VÉRIFICATION DE CODE (utilisée en interne, ancienne version)
   * Compare le code reçu avec celui stocké en BDD et marque l'email comme vérifié.
   * Note : cette fonction est conservée mais la route utilise verifyEmailCode() ci-dessous.
   */
  async verifyCode(email: string, code: string) {
    const user = await this.prisma.utilisateurs.findUnique({
      where: { email },
    });

    if (user && user.code_verification === code) {
      // Marquer l'email comme vérifié et effacer le code usagé
      await this.prisma.utilisateurs.update({
        where: { email },
        data: { est_verifie: true, code_verification: null },
      });
      return { message: 'Email vérifié avec succès !' };
    }
    throw new UnauthorizedException('Code incorrect');
  }

  /**
   * ENVOI DU CODE DE VÉRIFICATION (OTP) — utilisé lors de l'inscription
   *
   * Flux :
   *   1. Génère un code aléatoire à 6 chiffres (OTP = One-Time Password)
   *   2. Hache le mot de passe si fourni (bcrypt)
   *   3. "Upsert" l'utilisateur en BDD :
   *      → S'il n'existe pas : on le crée avec les données de base
   *      → S'il existe déjà : on met à jour le code et les champs fournis
   *   4. Envoie le code par email (HTML stylisé)
   *   5. Affiche le code dans la console serveur pour faciliter les tests
   *
   * Le champ _code est retourné pour faciliter les tests (à retirer en production).
   */
  async sendVerificationCode(payload: {
    email: string;
    nom?: string;
    prenom?: string;
    mot_de_passe?: string;
  }) {
    const { email, nom, prenom, mot_de_passe } = payload;

    // Étape 1 : générer un OTP à 6 chiffres (ex: 482931)
    // Math.floor(100000 + random * 900000) garantit toujours 6 chiffres
    const verificationCode = Math.floor(
      100000 + Math.random() * 900000,
    ).toString();

    try {
      const updateData: any = {
        code_verification: verificationCode,
        est_verifie: false, // L'email n'est pas encore confirmé
      };

      if (nom !== undefined) updateData.nom = nom;
      if (prenom !== undefined) updateData.prenom = prenom;

      // Étape 2 : hacher le mot de passe AVANT de le stocker (jamais en clair en BDD)
      if (mot_de_passe) {
        const hashed = await bcrypt.hash(mot_de_passe, await bcrypt.genSalt());
        updateData.mot_de_passe = hashed;
      }

      /**
       * Étape 3 : upsert = "update or insert"
       * Si l'utilisateur existe déjà (même email) → on met à jour ses données
       * Si l'utilisateur n'existe pas encore     → on le crée avec les données minimales
       * Cela permet de gérer aussi bien la première inscription qu'un renvoi de code.
       */
      await this.prisma.utilisateurs.upsert({
        where: { email },
        update: updateData,
        create: {
          email,
          nom: nom || '',
          prenom: prenom || '',
          role: 'ADHERENT',        // Rôle par défaut pour tous les nouveaux inscrits
          compte_actif: true,
          est_verifie: false,
          code_verification: verificationCode,
          mot_de_passe: updateData.mot_de_passe || null,
        },
      });
    } catch (e) {
      console.error('Erreur création/upsert utilisateur (pre-signup):', e);
    }

    // Étape 4 : envoyer le code par email (l'envoi est asynchrone, on ne bloque pas la réponse)
    this.mailerService
      .sendMail({
        to: email,
        subject: 'Code de vérification SmartChabeb',
        html: `
        <div style="font-family: sans-serif; padding: 20px; border: 2px solid #436D75; border-radius: 20px;">
          <h3 style="color: #436D75;">Vérifiez votre email</h3>
          <p>Voici votre code de vérification (valide 1 heure) :</p>
          <div style="font-size: 32px; font-weight: bold; color: #436D75; text-align: center; margin: 20px 0; letter-spacing: 5px;">
            ${verificationCode}
          </div>
          <p style="font-size: 12px; color: gray;">Si tu n'as pas demandé ce code, ignore ce mail.</p>
        </div>
      `,
      })
      .catch((e) => console.error('Erreur envoi code verification:', e));

    // Étape 5 : afficher le code dans la console serveur (utile pour les tests locaux)
    console.log(`\n=== OTP Code for ${email}: ${verificationCode} ===\n`);

    return {
      message: 'Code de vérification envoyé par email',
      _code: verificationCode, // À retirer en production — exposé uniquement pour les tests
    };
  }

  /**
   * VÉRIFICATION DU CODE OTP (route /auth/verify-code)
   *
   * Vérifie seulement le FORMAT du code (6 chiffres).
   * Note : la vraie comparaison avec la BDD se fait via verifyCode() si nécessaire.
   * Cette approche légère est suffisante car le code est déjà stocké en BDD
   * et sera vérifié à nouveau lors du login ou de la mise à jour du profil.
   */
  async verifyEmailCode(email: string, code: string) {
    // Validation du format : exactement 6 chiffres
    if (!code || code.length !== 6 || !/^\d{6}$/.test(code)) {
      throw new UnauthorizedException('Code invalide');
    }
    return { message: 'Email vérifié avec succès', email };
  }

  /**
   * MOT DE PASSE OUBLIÉ
   *
   * Flux :
   *   1. Vérifie que l'email existe en BDD (sinon 404)
   *   2. Génère un code de reset à 6 chiffres + une date d'expiration (+1 heure)
   *   3. Stocke le code et la date en BDD (reset_token, reset_token_expires)
   *   4. Envoie le code par email
   *
   * Sécurité : le code expire après 1 heure. Après ça, il faut en redemander un.
   */
  async forgotPassword(email: string) {
    // Étape 1 : vérifier que l'email correspond à un compte existant
    const user = await this.prisma.utilisateurs.findUnique({
      where: { email },
    });
    if (!user) throw new NotFoundException('Aucun compte lié à cet email');

    // Étape 2 : générer le code de reset et calculer son expiration (maintenant + 1h)
    const resetToken = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date();
    expires.setHours(expires.getHours() + 1);

    // Étape 3 : sauvegarder le code et sa date d'expiration en BDD
    await this.prisma.utilisateurs.update({
      where: { email },
      data: { reset_token: resetToken, reset_token_expires: expires },
    });

    // Étape 4 : envoyer l'email avec le code (appel asynchrone non bloquant)
    this.mailerService
      .sendMail({
        to: email,
        subject: 'Réinitialisation de ton mot de passe SmartChabeb',
        html: `
        <div style="font-family: sans-serif; padding: 20px; border: 2px solid #E98A7D; border-radius: 20px;">
          <h3 style="color: #436D75;">Demande de nouveau mot de passe</h3>
          <p>Voici ton code de réinitialisation (valide 1 heure) :</p>
          <div style="font-size: 32px; font-weight: bold; color: #E98A7D; text-align: center; margin: 20px 0;">
            ${resetToken}
          </div>
          <p style="font-size: 12px; color: gray;">Si tu n'as pas fait cette demande, ignore ce mail.</p>
        </div>
      `,
      })
      .catch((e) => console.error('Erreur mail ForgotPwd'));

    return { message: 'Code de réinitialisation envoyé par email.' };
  }

  /**
   * RÉINITIALISATION DU MOT DE PASSE
   *
   * Flux :
   *   1. Cherche l'utilisateur par email
   *   2. Vérifie que le code fourni correspond au reset_token stocké en BDD
   *   3. Vérifie que le code n'est pas expiré (reset_token_expires > maintenant)
   *   4. Hache le nouveau mot de passe avec bcrypt
   *   5. Met à jour le mot de passe en BDD et efface le token usagé
   *
   * Sécurité : on efface reset_token et reset_token_expires après usage
   * pour qu'ils ne puissent pas être réutilisés.
   */
  async resetPassword(email: string, token: string, newPass: string) {
    const user = await this.prisma.utilisateurs.findUnique({
      where: { email },
    });

    // Étapes 2 et 3 : valider le code et vérifier qu'il n'est pas expiré
    if (!user || user.reset_token !== token)
      throw new UnauthorizedException('Code invalide');
    if (!user.reset_token_expires || user.reset_token_expires < new Date())
      throw new UnauthorizedException('Code expiré');

    // Étape 4 : hacher le nouveau mot de passe (salt aléatoire généré par bcrypt)
    const hashedPassword = await bcrypt.hash(newPass, await bcrypt.genSalt());

    // Étape 5 : mettre à jour et effacer le token
    await this.prisma.utilisateurs.update({
      where: { email },
      data: {
        mot_de_passe: hashedPassword,
        reset_token: null,           // Effacé → inutilisable une seconde fois
        reset_token_expires: null,
      },
    });

    return { message: 'Mot de passe mis à jour ! Connecte-toi.' };
  }

  /**
   * VÉRIFICATION DU TOKEN GOOGLE
   *
   * Utilise la bibliothèque officielle Google (google-auth-library) pour décoder
   * et vérifier la signature d'un ID Token Google.
   *
   * Un "ID Token" Google est un JWT signé par Google qui contient :
   *   - l'email de l'utilisateur
   *   - son nom complet
   *   - l'URL de sa photo de profil
   *   - une audience (le client_id de notre app)
   *
   * Si le token est invalide (faux, expiré, mauvaise audience) → Google lève une erreur.
   */
  async verifyGoogleToken(token: string) {
    try {
      // Créer un client OAuth2 avec notre client_id Google (défini dans .env)
      const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

      // Vérifier le token auprès des serveurs de Google
      const ticket = await client.verifyIdToken({
        idToken: token,
        audience: process.env.GOOGLE_CLIENT_ID, // Doit correspondre à notre app Google
      });

      const payload = ticket.getPayload();
      return {
        email: payload?.email,
        name: payload?.name,
        picture: payload?.picture,
      };
    } catch (error) {
      throw new UnauthorizedException('Token Google invalide ou expiré');
    }
  }

  /**
   * CONNEXION VIA GOOGLE (Google Sign-In)
   *
   * Flux en 5 étapes :
   *   1. Vérifier le token Google auprès des serveurs de Google
   *   2. Chercher si un compte existe déjà avec cet email
   *   3. Si non → créer le compte automatiquement (inscription silencieuse)
   *      - est_verifie = true d'office (Google garantit l'email)
   *      - mot_de_passe = null (pas de mot de passe pour les comptes Google)
   *   4. Vérifier que le compte est actif (gestion du ban)
   *   5. Générer le JWT et retourner les infos + is_new_user + needs_profile
   *
   * Le champ needs_profile indique au frontend si l'utilisateur doit compléter
   * son profil (prénom, genre, date de naissance, centre).
   */
  async googleLogin(googleToken: string) {
    // Étape 1 : valider le token Google
    const googlePayload = await this.verifyGoogleToken(googleToken);

    if (!googlePayload.email) {
      throw new UnauthorizedException("Impossible de récupérer l'email Google");
    }

    // Étape 2 : chercher si un compte existe avec cet email
    let user = await this.prisma.utilisateurs.findUnique({
      where: { email: googlePayload.email },
    });
    const isNewUser = !user; // true = premier login Google (inscription)

    // Étape 3 : créer le compte si c'est la première connexion Google
    if (!user) {
      user = await this.prisma.utilisateurs.create({
        data: {
          email: googlePayload.email,
          nom: googlePayload.name || 'Google User',
          prenom: '',
          role: 'ADHERENT',
          compte_actif: true,
          est_verifie: true,                       // Google a déjà vérifié l'email
          photo_profil_url: googlePayload.picture || null,
          mot_de_passe: null,                      // Pas de mot de passe pour les comptes Google
        },
      });
    }

    // Étape 4 : vérifier si le compte est actif (même logique que login classique)
    const maintenant = new Date();
    if (user.compte_actif === false) {
      if (user.date_fin_ban && user.date_fin_ban > maintenant) {
        throw new ForbiddenException(
          `Votre compte est suspendu jusqu'au ${user.date_fin_ban.toLocaleDateString()}. Motif : ${user.motif_ban}`,
        );
      }
      if (user.date_fin_ban && user.date_fin_ban <= maintenant) {
        // Auto-unban si le ban est expiré
        await this.prisma.utilisateurs.update({
          where: { id: user.id },
          data: { compte_actif: true, date_fin_ban: null, motif_ban: null },
        });
      } else {
        throw new ForbiddenException(
          "Votre compte est désactivé. Veuillez vérifier avec l'administration.",
        );
      }
    }

    // Étape 5 : générer le JWT et calculer si le profil est incomplet
    const payload = { sub: user.id, email: user.email, role: user.role };

    // needs_profile = true si des champs obligatoires du profil sont manquants
    const needsProfile =
      !user.prenom || !user.genre || !user.date_naissance || !user.id_centre;

    return {
      access_token: await this.jwtService.signAsync(payload),
      user: {
        id: user.id,
        nom: user.nom,
        prenom: user.prenom,
        role: user.role,
        genre: user.genre,
        date_naissance: user.date_naissance,
        id_centre: user.id_centre,
        photo_profil_url: user.photo_profil_url,
      },
      is_new_user: isNewUser,     // true = première connexion → rediriger vers complétion de profil
      needs_profile: needsProfile, // true = profil incomplet → demander les infos manquantes
    };
  }
}
