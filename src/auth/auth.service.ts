import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async login(email: string, pass: string) {
    // 1. Chercher l'utilisateur par email
    const user = await this.prisma.utilisateurs.findUnique({
      where: { email: email },
    });

    // 2. Vérifier si l'utilisateur existe
    if (!user) {
      throw new UnauthorizedException("Ce utilisateur n'existe pas veuillez vous s'inscrire?");
    }

    // 3. Comparer le mot de passe envoyé avec celui crypté en base

    const isMatch = await bcrypt.compare(pass, user.mot_de_passe);
    if (!isMatch) {
      throw new UnauthorizedException('Le mot de passe est incorrecte.');
    }

    // 4. Si c'est bon, on génère le Token JWT
    const payload = { sub: user.id, email: user.email, role: user.role };
    return {
      access_token: await this.jwtService.signAsync(payload),
      user: {
        id: user.id,
        nom: user.nom,
        role: user.role,
      },
    };
  }
  // Dans le service (auth.service.ts par exemple)
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
}
