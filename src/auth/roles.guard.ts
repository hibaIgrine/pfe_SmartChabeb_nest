import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  // Recupere les roles requis et autorise l'acces seulement si l'utilisateur en fait partie.
  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>('roles', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    // Si aucun utilisateur n'est injecte par le JWT, ou si son role ne correspond pas, on refuse.
    return user && requiredRoles.some((role) => user.role === role);
  }
}
