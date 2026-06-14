/**
 * ============================================================
 * FICHIER : prisma.service.ts
 * RÔLE    : Point d'accès unique à la base de données PostgreSQL via Prisma ORM.
 * ============================================================
 *
 * PATTERN NestJS + PRISMA :
 *   PrismaService étend PrismaClient (le client Prisma généré automatiquement).
 *   Cela permet d'injecter PrismaService partout dans l'application via le
 *   système d'injection de dépendances de NestJS.
 *
 *   Usage typique dans un service :
 *     constructor(private readonly prisma: PrismaService) {}
 *     await this.prisma.utilisateurs.findMany();
 *
 * CYCLE DE VIE :
 *   onModuleInit()    → appelé par NestJS au démarrage du module
 *                       → this.$connect() ouvre la connexion au pool PostgreSQL
 *   onModuleDestroy() → appelé par NestJS à l'arrêt de l'application
 *                       → this.$disconnect() ferme proprement toutes les connexions
 *
 * POURQUOI ÉTENDRE PRISMACLIENT ET NE PAS L'INSTANCIER ?
 *   En étendant PrismaClient, PrismaService hérite de TOUS les modèles générés
 *   (utilisateurs, clubs, events, reservations_locaux, payments, etc.) directement
 *   accessibles via `this.prisma.nomDuModele`. Pas besoin d'encapsuler manuellement.
 *
 * CONNEXION :
 *   La chaîne de connexion est lue depuis DATABASE_URL dans le fichier .env.
 *   Prisma gère un pool de connexions automatiquement (PgBouncer compatible).
 *
 * MODÈLES DISPONIBLES (liste non exhaustive) :
 *   utilisateurs, clubs, centres, locaux, events, reservations_locaux, payments,
 *   inscriptions_clubs, presences_clubs, seances, notifications, club_staff, ...
 *   → Voir schema.prisma pour la liste complète.
 */

import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  /** Ouvre la connexion au pool PostgreSQL au démarrage du module NestJS. */
  async onModuleInit() {
    await this.$connect();
  }

  /** Ferme proprement toutes les connexions Prisma à l'arrêt de l'application. */
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
