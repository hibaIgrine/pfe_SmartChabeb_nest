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

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private mailerService: MailerService,
  ) {}

  async login(email: string, pass: string) {
    const user = await this.prisma.utilisateurs.findUnique({ where: { email } });
    if (!user) throw new UnauthorizedException("Utilisateur inconnu");

    const maintenant = new Date();
    if (user.compte_actif === false && user.date_fin_ban) {
      if (user.date_fin_ban > maintenant) {
        throw new ForbiddenException(
          `Compte suspendu jusqu'au ${user.date_fin_ban.toLocaleDateString()}. Motif: ${user.motif_ban}`,
        );
      } else {
        // Auto-Unban lors du login
        await this.prisma.utilisateurs.update({
          where: { id: user.id },
          data: { compte_actif: true, date_fin_ban: null, motif_ban: null },
        });
      }
    }

    const isMatch = await bcrypt.compare(pass, user.mot_de_passe);
    if (!isMatch) throw new UnauthorizedException('Mot de passe incorrect');

    const payload = { sub: user.id, email: user.email, role: user.role };
    return {
      access_token: await this.jwtService.signAsync(payload),
      user: { id: user.id, nom: user.nom, role: user.role },
    };
  }

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

  async forgotPassword(email: string) {
    const user = await this.prisma.utilisateurs.findUnique({ where: { email } });
    if (!user) throw new NotFoundException('Aucun compte lié à cet email');

    const resetToken = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date();
    expires.setHours(expires.getHours() + 1);

    await this.prisma.utilisateurs.update({
      where: { email },
      data: { reset_token: resetToken, reset_token_expires: expires },
    });

    this.mailerService.sendMail({
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
    }).catch(e => console.error("Erreur mail ForgotPwd"));

    return { message: 'Code de réinitialisation envoyé par email.' };
  }

  async resetPassword(email: string, token: string, newPass: string) {
    const user = await this.prisma.utilisateurs.findUnique({ where: { email } });
    if (!user || user.reset_token !== token) throw new UnauthorizedException('Code invalide');
    if (!user.reset_token_expires || user.reset_token_expires < new Date()) throw new UnauthorizedException('Code expiré');

    const hashedPassword = await bcrypt.hash(newPass, await bcrypt.genSalt());
    await this.prisma.utilisateurs.update({
      where: { email },
      data: { mot_de_passe: hashedPassword, reset_token: null, reset_token_expires: null },
    });

    return { message: 'Mot de passe mis à jour ! Connecte-toi.' };
  }
}
