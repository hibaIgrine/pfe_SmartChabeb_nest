import { SetMetadata } from '@nestjs/common';

// Stocke les roles requis dans les metadonnees de la route.
export const Roles = (...roles: string[]) => SetMetadata('roles', roles);
