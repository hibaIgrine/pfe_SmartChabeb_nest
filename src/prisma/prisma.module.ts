/**
 * ============================================================
 * FICHIER : prisma.module.ts
 * RÔLE    : Module partageable qui expose PrismaService à toute l'application.
 * ============================================================
 *
 * PATTERN D'UTILISATION :
 *   Les autres modules importent PrismaModule pour accéder à PrismaService :
 *
 *   @Module({ imports: [PrismaModule] })   ← dans EventsModule, ClubsModule, etc.
 *   export class EventsModule {}
 *
 *   Grâce à exports: [PrismaService], tout module qui importe PrismaModule
 *   peut injecter PrismaService dans ses providers.
 *
 * POURQUOI UN MODULE DÉDIÉ ?
 *   Sans ce module, chaque module qui a besoin de Prisma devrait déclarer
 *   PrismaService dans son propre tableau providers: [], ce qui créerait
 *   plusieurs instances. PrismaModule centralise la déclaration en un seul endroit.
 *
 * ALTERNATIVE : injection directe sans module
 *   Certains modules (comme PaymentsModule) injectent PrismaService directement
 *   dans leurs providers: [] au lieu d'importer PrismaModule — les deux approches
 *   fonctionnent, mais importer PrismaModule est la pratique recommandée.
 */

import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Module({
  providers: [PrismaService], // Enregistre PrismaService dans le conteneur IoC
  exports: [PrismaService],   // Rend PrismaService injectable pour les modules importateurs
})
export class PrismaModule {}
