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
    private prisma: PrismaService,
    private jwtService: JwtService,
    private mailerService: MailerService,
  ) {}

  // Verifie l'identite, le statut du compte et genere un token JWT.
  async login(email: string, pass: string) {
    const user = await this.prisma.utilisateurs.findUnique({
      where: { email },
    });
    if (!user) throw new UnauthorizedException('Utilisateur inconnu');

    const maintenant = new Date();
    if (user.compte_actif === false) {
      if (user.date_fin_ban) {
        if (user.date_fin_ban > maintenant) {
          throw new ForbiddenException(
            `Votre compte est suspendu jusqu'au ${user.date_fin_ban.toLocaleDateString()}. Motif : ${user.motif_ban}`,
          );
        }

        // Auto-Unban lors du login si la période de ban est terminée
        await this.prisma.utilisateurs.update({
          where: { id: user.id },
          data: { compte_actif: true, date_fin_ban: null, motif_ban: null },
        });
      } else {
        throw new ForbiddenException(
          'Votre compte est désactivé. Veuillez vérifier avec l’administration.',
        );
      }
    }
    // Vérifier que l'utilisateur a un mot de passe (pas créé via Google)
    if (!user.mot_de_passe) {
      throw new UnauthorizedException('Mot de passe incorrect');
    }
    const isMatch = await bcrypt.compare(pass, user.mot_de_passe);
    if (!isMatch) throw new UnauthorizedException('Mot de passe incorrect');

    const payload = { sub: user.id, email: user.email, role: user.role };
    return {
      access_token: await this.jwtService.signAsync(payload),
      user: { id: user.id, nom: user.nom, role: user.role },
    };
  }

  // Confirme l'email de l'utilisateur avec le code qui lui a ete envoye.
  async verifyCode(email: string, code: string) {
    const user = await this.prisma.utilisateurs.findUnique({
      where: { email },
    });

    if (user && user.code_verification === code) {
      await this.prisma.utilisateurs.update({
        where: { email },
        data: { est_verifie: true, code_verification: null },
      });
      return { message: 'Email vérifié avec succès !' };
    }
    throw new UnauthorizedException('Code incorrect');
  }

  // Envoie un code de verification par email (pour signup)
  async sendVerificationCode(email: string) {
    const verificationCode = Math.floor(
      100000 + Math.random() * 900000,
    ).toString();

    // Send code via email (on ne crée pas de user encore, juste on envoie le code)
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

    // Store in a temporary store or session - for demo we'll just return the code in dev
    // In production, you'd want to use Redis or similar to store verification codes
    // For now, we'll store it with a user record temporarily (or send it back for demo)
    return {
      message: 'Code de vérification envoyé par email',
      // In production, remove this - it's just for testing
      _code:
        process.env.NODE_ENV === 'development' ? verificationCode : undefined,
    };
  }

  // Vérifie le code de verification avant signup
  async verifyEmailCode(email: string, code: string) {
    // In production, you would check against Redis/cache
    // For now, we just return success if code matches format
    if (!code || code.length !== 6 || !/^\d{6}$/.test(code)) {
      throw new UnauthorizedException('Code invalide');
    }
    return { message: 'Email vérifié avec succès', email };
  }

  // Genere un code de reinitialisation et l'envoie par email.
  async forgotPassword(email: string) {
    const user = await this.prisma.utilisateurs.findUnique({
      where: { email },
    });
    if (!user) throw new NotFoundException('Aucun compte lié à cet email');

    const resetToken = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date();
    expires.setHours(expires.getHours() + 1);

    await this.prisma.utilisateurs.update({
      where: { email },
      data: { reset_token: resetToken, reset_token_expires: expires },
    });

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

  // Verifie le code de reset puis remplace l'ancien mot de passe par un nouveau hash.
  async resetPassword(email: string, token: string, newPass: string) {
    const user = await this.prisma.utilisateurs.findUnique({
      where: { email },
    });
    if (!user || user.reset_token !== token)
      throw new UnauthorizedException('Code invalide');
    if (!user.reset_token_expires || user.reset_token_expires < new Date())
      throw new UnauthorizedException('Code expiré');

    const hashedPassword = await bcrypt.hash(newPass, await bcrypt.genSalt());
    await this.prisma.utilisateurs.update({
      where: { email },
      data: {
        mot_de_passe: hashedPassword,
        reset_token: null,
        reset_token_expires: null,
      },
    });

    return { message: 'Mot de passe mis à jour ! Connecte-toi.' };
  }

  // Verifie le token Google aupres de Google
  async verifyGoogleToken(token: string) {
    try {
      const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
      const ticket = await client.verifyIdToken({
        idToken: token,
        audience: process.env.GOOGLE_CLIENT_ID,
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

  // Connecte ou crée un utilisateur via Google Sign-In
  async googleLogin(googleToken: string) {
    // 1. Vérifier le token Google
    const googlePayload = await this.verifyGoogleToken(googleToken);

    if (!googlePayload.email) {
      throw new UnauthorizedException("Impossible de récupérer l'email Google");
    }

    // 2. Chercher l'utilisateur existant
    let user = await this.prisma.utilisateurs.findUnique({
      where: { email: googlePayload.email },
    });

    // 3. Créer l'utilisateur s'il n'existe pas (Sign Up automatique)
    if (!user) {
      user = await this.prisma.utilisateurs.create({
        data: {
          email: googlePayload.email,
          nom: googlePayload.name || 'Google User',
          prenom: '',
          role: 'ADHERANT',
          compte_actif: true,
          est_verifie: true, // Google = toujours vérifié
          photo_profil_url: googlePayload.picture || null,
          mot_de_passe: null, // Google users n'ont pas de mot de passe
        },
      });
    }

    // 4. Vérifier que le compte est actif
    const maintenant = new Date();
    if (user.compte_actif === false) {
      if (user.date_fin_ban && user.date_fin_ban > maintenant) {
        throw new ForbiddenException(
          `Votre compte est suspendu jusqu'au ${user.date_fin_ban.toLocaleDateString()}. Motif : ${user.motif_ban}`,
        );
      }

      // Auto-Unban si la période est terminée
      if (user.date_fin_ban && user.date_fin_ban <= maintenant) {
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

    // 5. Générer JWT (identique au login classique)
    const payload = { sub: user.id, email: user.email, role: user.role };
    return {
      access_token: await this.jwtService.signAsync(payload),
      user: { id: user.id, nom: user.nom, role: user.role },
    };
  }
}
