/**
 * ============================================================
 * FICHIER : roles.decorator.ts
 * RÔLE    : Décorateur personnalisé pour restreindre l'accès par rôle.
 * ============================================================
 *
 * Un "décorateur" TypeScript est une annotation (@Something) qu'on place
 * au-dessus d'une classe, d'une méthode ou d'un paramètre.
 *
 * @Roles() est notre décorateur custom. Il utilise SetMetadata() de NestJS
 * pour stocker la liste des rôles autorisés dans les "métadonnées" de la route.
 * Ces métadonnées sont ensuite lues par RolesGuard via le Reflector.
 *
 * EXEMPLE D'UTILISATION :
 *   @Roles('ADMIN')              → seul l'ADMIN peut accéder
 *   @Roles('ADMIN', 'COACH')     → ADMIN ou COACH peuvent accéder
 *
 * SetMetadata('roles', roles) est équivalent à attacher une étiquette
 * 'roles' avec la valeur ['ADMIN'] à la route — RolesGuard la lit ensuite.
 *
 * CHAÎNE COMPLÈTE :
 *   @Roles('ADMIN')  →  stocke { roles: ['ADMIN'] } dans les métadonnées
 *   RolesGuard       →  lit ces métadonnées via Reflector
 *   RolesGuard       →  compare req.user.role avec ['ADMIN']
 *   → Accès autorisé ou refusé (403 Forbidden)
 */

import { SetMetadata } from '@nestjs/common';

/**
 * @Roles(...roles) — décorateur à placer sur une route ou un controller.
 * @param roles — un ou plusieurs rôles autorisés (ex: 'ADMIN', 'COACH', 'ADHERENT')
 */
export const Roles = (...roles: string[]) => SetMetadata('roles', roles);
