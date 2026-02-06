import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: 'MA_CLE_SECRETTE_TRES_LONGUE', // La même que dans auth.module.ts
    });
  }

  async validate(payload: any) {
    // Ce que le token contient (id, email, role) sera disponible dans 'req.user'
    return { userId: payload.sub, email: payload.email, role: payload.role };
  }
}
