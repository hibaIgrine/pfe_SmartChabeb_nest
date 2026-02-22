import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards ,Request} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { AuthGuard } from '@nestjs/passport';
import { VerifyUserDto } from './dto/verify-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { BiometricsDto } from './dto/biometrics.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Patch('update-profile')
  async updateProfile(@Body() updateProfileDto: UpdateProfileDto) {
    // On passe l'email pour trouver l'utilisateur et le DTO pour les données
    return await this.usersService.updateProfile(
      updateProfileDto.email,
      updateProfileDto,
    );
  }

  @Post()
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }
  @Post('verify')
  async verify(@Body() verifyUserDto: VerifyUserDto) {
    // Utilise le DTO ici
    return await this.usersService.verifyEmail(
      verifyUserDto.email,
      verifyUserDto.code,
    );
  }
  @Post('biometrics')
  async addBiometrics(@Body() biometricsDto: BiometricsDto) {
    return await this.usersService.saveBiometrics(biometricsDto);
  }

  @Get()
  @UseGuards(AuthGuard('jwt'))
  //@Roles('ADMIN')
  findAll() {
    return this.usersService.findAll();
  }
  @Get('me/profile')
  @UseGuards(AuthGuard('jwt')) // Seul un utilisateur connecté peut voir son profil
  async getMyProfile(@Request() req:any) {
    // req.user contient l'ID extrait du Token JWT
    return await this.usersService.getProfileWithBiometrics(req.user.userId);
  }
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }
}
