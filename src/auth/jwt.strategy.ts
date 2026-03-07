import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: 'MA_CLE_SECRETTE_TRES_LONGUE', // La même que dans auth.module.ts
    });
  }

  async validate(payload: any) {
    const user = await this.prisma.utilisateurs.findUnique({
      where: { id: payload.sub },
    });
    if (!user) throw new UnauthorizedException();
    if (user.compte_actif === false) {
      throw new ForbiddenException(`Accès suspendu. Motif : ${user.motif_ban}`);
    }
    // Ce que le token contient (id, email, role) sera disponible dans 'req.user'
    return { userId: payload.sub, email: payload.email, role: payload.role };
  }
}
