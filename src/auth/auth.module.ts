/**
 * ============================================================
 * FICHIER : auth.module.ts
 * RÔLE    : Point d'entrée du module d'authentification.
 * ============================================================
 *
 * Un "Module" dans NestJS est comme une boîte qui regroupe tout ce
 * qui concerne une fonctionnalité précise. Ici, on regroupe tout
 * ce qui touche à l'authentification : controller, service, stratégie JWT.
 *
 * Ce fichier fait 3 choses :
 *   1. IMPORTS  — il déclare les modules externes dont on a besoin.
 *   2. CONTROLLERS — il enregistre les routes HTTP (les endpoints).
 *   3. PROVIDERS   — il enregistre les services et stratégies utilisables.
 */

import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from 'src/users/users.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { JwtModule } from '@nestjs/jwt';
import { JwtStrategy } from './jwt.strategy';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    // Donne accès au UsersService (gestion des utilisateurs en BDD)
    UsersModule,

    // Donne accès à PrismaService (la connexion à la base de données PostgreSQL)
    PrismaModule,

    // Permet de lire les variables d'environnement du fichier .env (JWT_SECRET, etc.)
    ConfigModule,

    /**
     * Configuration asynchrone du module JWT.
     * On attend que ConfigService soit prêt avant de lire JWT_SECRET dans le .env.
     * - secret     : la clé secrète utilisée pour signer les tokens (comme un tampon officiel).
     * - expiresIn  : durée de vie du token — ici '1d' = 1 jour.
     *   Après 1 jour, l'utilisateur devra se reconnecter.
     */
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'), // Lu depuis le fichier .env
        signOptions: { expiresIn: '1d' },
      }),
    }),
  ],

  // Déclare le controller qui expose les routes HTTP : /auth/login, /auth/register, etc.
  controllers: [AuthController],

  providers: [
    // Le service qui contient toute la logique métier (login, hachage, email, Google...)
    AuthService,
    // La stratégie Passport qui valide automatiquement les tokens JWT sur chaque requête protégée
    JwtStrategy,
  ],
})
export class AuthModule {}
