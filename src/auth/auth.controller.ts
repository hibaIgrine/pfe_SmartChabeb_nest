/**
 * ============================================================
 * FICHIER : auth.controller.ts
 * RÔLE    : Définit les routes HTTP publiques du module Auth.
 * ============================================================
 *
 * Un "Controller" dans NestJS est le point d'entrée des requêtes HTTP.
 * Il reçoit les données envoyées par le frontend (body, params, etc.),
 * les valide via les DTOs, puis délègue le traitement au AuthService.
 *
 * ROUTES EXPOSÉES (toutes en POST, toutes publiques sans token JWT) :
 *   POST /auth/login                  → connexion classique email + mot de passe
 *   POST /auth/send-verification-code → envoie un OTP par email (lors de l'inscription)
 *   POST /auth/verify-code            → valide le code OTP reçu par email
 *   POST /auth/forgot-password        → envoie un code de reset du mot de passe
 *   POST /auth/reset-password         → change le mot de passe avec le code reçu
 *   POST /auth/google-login           → connexion / inscription via Google Sign-In
 *
 * DTO (Data Transfer Object) :
 *   Un DTO est un objet TypeScript qui décrit la forme des données attendues
 *   dans le body de la requête. Les décorateurs (@IsEmail, @IsNotEmpty...)
 *   permettent de valider automatiquement les données grâce au ValidationPipe
 *   configuré dans main.ts. Si une donnée est invalide, NestJS renvoie
 *   automatiquement une erreur 400 Bad Request.
 */

import { Controller, Post, Body } from '@nestjs/common';
import { AuthService } from './auth.service';
import { ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

// ─── DTOs ────────────────────────────────────────────────────────────────────

/** Données attendues pour la connexion classique */
export class LoginDto {
  @ApiProperty({ example: 'hiba@test.com' })
  @IsEmail({}, { message: 'Format email invalide' })
  @IsNotEmpty({ message: "L'email est obligatoire" })
  email!: string;

  @ApiProperty({ example: 'password123' })
  @IsString()
  @IsNotEmpty({ message: 'Le mot de passe est obligatoire' })
  mot_de_passe!: string;
}

/** Données attendues pour déclencher un reset de mot de passe */
export class ForgotPasswordDto {
  @ApiProperty({ example: 'hiba@test.com' })
  @IsEmail()
  @IsNotEmpty()
  email!: string;
}

/** Données attendues pour finaliser le reset de mot de passe */
export class ResetPasswordDto {
  @ApiProperty({ example: 'hiba@test.com' })
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  /** Le code à 6 chiffres reçu par email */
  @ApiProperty({ example: '123456' })
  @IsString()
  @IsNotEmpty()
  token!: string;

  @ApiProperty({ example: 'newpassword123' })
  @IsString()
  @IsNotEmpty()
  newPassword!: string;
}

/** Données attendues pour la connexion Google (token ID Google) */
export class GoogleLoginDto {
  @ApiProperty({ example: 'eyJhbGciOiJSUzI1NiIsImtpZCI6IjExIn0...' })
  @IsString()
  @IsNotEmpty({ message: 'Le token Google est obligatoire' })
  token!: string;
}

// ─── Controller ──────────────────────────────────────────────────────────────

/** @ApiTags groupe ces routes sous "Auth" dans la doc Swagger (/api) */
@ApiTags('Auth')
/** @Controller('auth') → toutes les routes commencent par /auth */
@Controller('auth')
export class AuthController {
  /** NestJS injecte automatiquement AuthService ici (injection de dépendances) */
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /auth/login
   * Étape 1 : valide le DTO (email format, champs obligatoires)
   * Étape 2 : délègue à authService.login() qui vérifie le mot de passe
   * Retourne : { access_token, user } ou une erreur 401
   */
  @Post('login')
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto.email, loginDto.mot_de_passe);
  }

  /**
   * POST /auth/send-verification-code
   * Utilisé lors de l'inscription : crée (ou met à jour) l'utilisateur en BDD
   * et envoie un code OTP à 6 chiffres par email.
   * Le body peut contenir : email, nom, prenom, mot_de_passe (optionnels sauf email)
   */
  @Post('send-verification-code')
  async sendVerificationCode(
    @Body()
    body: {
      email: string;
      nom?: string;
      prenom?: string;
      mot_de_passe?: string;
    },
  ) {
    return this.authService.sendVerificationCode(body);
  }

  /**
   * POST /auth/verify-code
   * Vérifie que le code OTP saisi par l'utilisateur est valide (format 6 chiffres).
   * Retourne : { message, email } en cas de succès
   */
  @Post('verify-code')
  async verifyCode(@Body() body: { email: string; code: string }) {
    return this.authService.verifyEmailCode(body.email, body.code);
  }

  /**
   * POST /auth/forgot-password
   * L'utilisateur donne son email → on génère un code de reset et on l'envoie par email.
   * Le code est stocké en BDD avec une expiration d'1 heure.
   */
  @Post('forgot-password')
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return this.authService.forgotPassword(forgotPasswordDto.email);
  }

  /**
   * POST /auth/reset-password
   * L'utilisateur fournit : email + code reçu par email + nouveau mot de passe.
   * Si le code est valide et non expiré, le mot de passe est haché et mis à jour.
   */
  @Post('reset-password')
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.authService.resetPassword(
      resetPasswordDto.email,
      resetPasswordDto.token,
      resetPasswordDto.newPassword,
    );
  }

  /**
   * POST /auth/google-login
   * Le frontend envoie le "ID Token" Google (obtenu après Google Sign-In).
   * Le backend le vérifie auprès de Google, puis connecte ou crée l'utilisateur.
   * Retourne : { access_token, user, is_new_user, needs_profile }
   */
  @Post('google-login')
  async googleLogin(@Body() googleLoginDto: GoogleLoginDto) {
    return this.authService.googleLogin(googleLoginDto.token);
  }
}
