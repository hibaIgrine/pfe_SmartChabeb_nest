import { Controller, Post, Body } from '@nestjs/common';
import { AuthService } from './auth.service';
import { ApiProperty, ApiTags } from '@nestjs/swagger';
// AJOUT de ces imports pour la validation
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

// Le DTO doit être exporté et décoré pour être reconnu par le ValidationPipe
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

export class ForgotPasswordDto {
  @ApiProperty({ example: 'hiba@test.com' })
  @IsEmail()
  @IsNotEmpty()
  email!: string;
}

export class ResetPasswordDto {
  @ApiProperty({ example: 'hiba@test.com' })
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @IsNotEmpty()
  token!: string;

  @ApiProperty({ example: 'newpassword123' })
  @IsString()
  @IsNotEmpty()
  newPassword!: string;
}

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // Connecte un utilisateur et renvoie un jeton JWT avec un resume du profil.
  @Post('login')
  async login(@Body() loginDto: LoginDto) {
    // On utilise les données validées du DTO
    return this.authService.login(loginDto.email, loginDto.mot_de_passe);
  }

  // Lance la procedure d'oubli de mot de passe et envoie un code par email.
  @Post('forgot-password')
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return this.authService.forgotPassword(forgotPasswordDto.email);
  }

  // Reinitialise le mot de passe a partir du code de verification recu.
  @Post('reset-password')
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.authService.resetPassword(
      resetPasswordDto.email,
      resetPasswordDto.token,
      resetPasswordDto.newPassword,
    );
  }
}
