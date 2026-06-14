/**
 * ============================================================
 * FICHIER : roles.guard.ts
 * RÔLE    : Contrôle d'accès basé sur les rôles (RBAC).
 * ============================================================
 *
 * Un "Guard" dans NestJS est un intercepteur qui décide si une requête
 * peut accéder à une route ou non. Il retourne true (autoriser) ou false (bloquer).
 *
 * RolesGuard s'utilise APRÈS AuthGuard('jwt') :
 *   - AuthGuard('jwt') vérifie que l'utilisateur est CONNECTÉ (token valide)
 *   - RolesGuard vérifie que l'utilisateur a le BON RÔLE pour accéder à la ressource
 *
 * EXEMPLE D'UTILISATION dans un controller :
 *   @UseGuards(AuthGuard('jwt'), RolesGuard)
 *   @Roles('ADMIN')
 *   @Get('all-users')
 *   getAllUsers() { ... }
 *   → Seul un utilisateur connecté avec role = 'ADMIN' peut accéder à cette route.
 *
 * FONCTIONNEMENT :
 *   1. Lit les rôles requis depuis les métadonnées de la route (posés par @Roles())
 *   2. Si aucun rôle requis → accès libre (la route n'a pas de restriction de rôle)
 *   3. Si des rôles requis → vérifie que req.user.role est dans la liste
 *
 * Le Reflector permet de lire les métadonnées attachées aux routes et controllers
 * via le décorateur @Roles() (défini dans roles.decorator.ts).
 */

import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    /**
     * Étape 1 : lire les rôles requis depuis les métadonnées de la route.
     * getAllAndOverride lit d'abord les métadonnées du handler (méthode),
     * puis celles de la classe (controller) si le handler n'en a pas.
     * La clé 'roles' est celle définie dans roles.decorator.ts : SetMetadata('roles', ...)
     */
    const requiredRoles = this.reflector.getAllAndOverride<string[]>('roles', [
      context.getHandler(), // Méthode de la route (ex: getAllUsers)
      context.getClass(),   // Controller (ex: UsersController)
    ]);

    // Étape 2 : si la route n'a pas de @Roles() → elle est accessible à tout utilisateur connecté
    if (!requiredRoles) {
      return true;
    }

    // Étape 3 : récupérer req.user (injecté par JwtStrategy.validate() lors de l'auth)
    const { user } = context.switchToHttp().getRequest();

    // Vérifier que l'utilisateur existe et que son rôle est dans la liste des rôles autorisés
    // .some() retourne true si AU MOINS UN rôle correspond
    return user && requiredRoles.some((role) => user.role === role);
  }
}
