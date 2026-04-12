import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') as string, // La même que dans auth.module.ts
    });
  }

  // Recharge l'utilisateur a partir du JWT et bloque l'acces si le compte est encore banni.
  async validate(payload: any) {
    const user = await this.prisma.utilisateurs.findUnique({
      where: { id: payload.sub },
    });

    if (!user) throw new UnauthorizedException();

    // VRAIE LOGIQUE DE BAN
    if (user.compte_actif === false && user.date_fin_ban) {
      const maintenant = new Date();

      if (user.date_fin_ban > maintenant) {
        // Le ban est toujours actif
        throw new ForbiddenException(
          `Accès suspendu jusqu'au ${user.date_fin_ban.toLocaleDateString()}. Motif : ${user.motif_ban}`,
        );
      } else {
        // Le ban est expiré ! On réactive le compte automatiquement (Auto-Unban)
        await this.prisma.utilisateurs.update({
          where: { id: user.id },
          data: { compte_actif: true, date_fin_ban: null, motif_ban: null },
        });
      }
    }

    return { userId: payload.sub, email: payload.email, role: payload.role };
  }
}
