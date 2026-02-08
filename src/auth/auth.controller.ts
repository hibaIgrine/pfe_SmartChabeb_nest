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
  email: string;

  @ApiProperty({ example: 'password123' })
  @IsString()
  @IsNotEmpty({ message: 'Le mot de passe est obligatoire' })
  mot_de_passe: string;
}

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(@Body() loginDto: LoginDto) {
    // On utilise les données validées du DTO
    return this.authService.login(loginDto.email, loginDto.mot_de_passe);
  }
}
