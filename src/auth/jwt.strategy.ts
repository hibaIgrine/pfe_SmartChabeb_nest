/**
 * ============================================================
 * FICHIER : jwt.strategy.ts
 * RÔLE    : Valide automatiquement le token JWT sur chaque requête protégée.
 * ============================================================
 *
 * Ce fichier implémente la "stratégie JWT" de Passport.js.
 * Passport est un middleware d'authentification pour Node.js.
 * Une "stratégie" est la règle qui définit COMMENT extraire et valider l'identité.
 *
 * COMMENT ÇA FONCTIONNE :
 *   Quand une route est protégée par @UseGuards(AuthGuard('jwt')),
 *   Passport intercepte la requête AVANT d'atteindre le controller, puis :
 *
 *   1. Extrait le token JWT du header HTTP : Authorization: Bearer <token>
 *   2. Vérifie la signature du token avec JWT_SECRET (si le token a été falsifié → rejeté)
 *   3. Vérifie que le token n'est pas expiré (ignoreExpiration: false)
 *   4. Appelle notre méthode validate() avec le payload décodé
 *   5. Le résultat de validate() est injecté dans req.user pour le controller
 *
 * SCHÉMA :
 *   Frontend → Authorization: Bearer <token> → JwtStrategy → validate() → req.user → Controller
 */

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
      // Extrait le token depuis le header Authorization: Bearer <token>
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),

      // false = on refuse les tokens expirés (important pour la sécurité)
      ignoreExpiration: false,

      // La clé secrète doit être IDENTIQUE à celle utilisée pour signer dans auth.module.ts
      // Si quelqu'un falsifie le token sans connaître cette clé → rejeté
      secretOrKey: configService.get<string>('JWT_SECRET') as string,
    });
  }

  /**
   * validate() est appelée automatiquement par Passport après avoir décodé le token.
   *
   * payload = le contenu du JWT décodé, ex: { sub: 42, email: 'hiba@test.com', role: 'ADMIN' }
   *   - sub  : l'ID de l'utilisateur (payload.sub = user.id)
   *   - email: son email
   *   - role : son rôle (ADHERENT, COACH, ADMIN...)
   *
   * Pourquoi recharger l'utilisateur depuis la BDD ici ?
   * → Pour vérifier l'état ACTUEL du compte. Un token valide peut avoir été émis
   *   AVANT qu'un admin banne le compte. On vérifie donc en temps réel.
   *
   * Ce que retourne cette fonction est accessible via @Request() req → req.user
   * dans tous les controllers protégés.
   */
  async validate(payload: any) {
    // Recharger l'utilisateur depuis la BDD pour avoir son statut à jour
    const user = await this.prisma.utilisateurs.findUnique({
      where: { id: payload.sub },
    });

    // Si l'utilisateur a été supprimé depuis l'émission du token → refuser
    if (!user) throw new UnauthorizedException();

    // Vérifier le ban EN TEMPS RÉEL (pas uniquement au login)
    if (user.compte_actif === false && user.date_fin_ban) {
      const maintenant = new Date();

      if (user.date_fin_ban > maintenant) {
        // Le ban est encore actif → bloquer l'accès même avec un token valide
        throw new ForbiddenException(
          `Accès suspendu jusqu'au ${user.date_fin_ban.toLocaleDateString()}. Motif : ${user.motif_ban}`,
        );
      } else {
        // Le ban est expiré → réactiver le compte automatiquement (auto-unban)
        await this.prisma.utilisateurs.update({
          where: { id: user.id },
          data: { compte_actif: true, date_fin_ban: null, motif_ban: null },
        });
      }
    }

    // Ce retour devient req.user dans tous les controllers protégés par AuthGuard('jwt')
    return { userId: payload.sub, email: payload.email, role: payload.role };
  }
}
