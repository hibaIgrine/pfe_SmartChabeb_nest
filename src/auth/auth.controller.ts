import { Controller, Post, Body } from '@nestjs/common';
import { AuthService } from './auth.service';
import { ApiProperty, ApiTags } from '@nestjs/swagger';

// Petit DTO rapide pour Swagger
class LoginDto {
  @ApiProperty({ example: 'hiba@test.com' })
  email: string;
  @ApiProperty({ example: 'password123' })
  mot_de_passe: string;
}

@ApiTags('Auth') // Pour ranger dans Swagger
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto.email, loginDto.mot_de_passe);
  }
}
