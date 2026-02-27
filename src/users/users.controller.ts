import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { AuthGuard } from '@nestjs/passport';
import { VerifyUserDto } from './dto/verify-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { BiometricsDto } from './dto/biometrics.dto';
import { Roles } from 'src/auth/roles.decorator';
import { RolesGuard } from 'src/auth/roles.guard';
import { BanUserDto } from './dto/ban-user.dto';
import { ChangeRoleDto } from './dto/change-role.dto';
import { ChangeStatusDto } from './dto/change-status.dto';
import { AssignSalleByEmailDto } from './dto/assign-salle.dto';

// ... (garder les imports identiques)

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // --- 1. ROUTES PUBLIQUES (SANS GUARD) ---

  @Post()
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Post('verify')
  async verify(@Body() verifyUserDto: VerifyUserDto) {
    return await this.usersService.verifyEmail(verifyUserDto.email, verifyUserDto.code);
  }

  @Post('biometrics')
  async addBiometrics(@Body() biometricsDto: BiometricsDto) {
    return await this.usersService.saveBiometrics(biometricsDto);
  }

  @Patch('me/assign-salle')
  // ✅ PUBLIC : Indispensable pour la fin de l'inscription Flutter
  async assignSalleByEmail(@Body() body: AssignSalleByEmailDto) {
    return await this.usersService.assignToSalleByEmail(body.email, body.id_salle);
  }

  @Patch('update-profile')
  // ✅ PUBLIC : Indispensable pour l'étape 3 de l'inscription
  async updateProfile(@Body() updateProfileDto: UpdateProfileDto) {
    return await this.usersService.updateProfile(updateProfileDto.email, updateProfileDto);
  }

  // --- 2. ROUTES PRIVÉES (TOKEN REQUIS) ---

  @Get('me/profile')
  @UseGuards(AuthGuard('jwt'))
  async getMyProfile(@Request() req: any) {
    return await this.usersService.getProfileWithBiometrics(req.user.userId);
  }

  // --- 3. ROUTES ADMINISTRATIVES (ADMIN UNIQUEMENT) ---

  @Get()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN')
  findAll() {
    return this.usersService.findAll();
  }

  @Patch(':id/role')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN')
  async changeRole(@Param('id') id: string, @Body() body: ChangeRoleDto) {
    return await this.usersService.updateStatus(id, { role: body.role });
  }

  @Patch(':id/status')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN')
  async changeStatus(@Param('id') id: string, @Body() body: ChangeStatusDto) {
    return await this.usersService.updateStatus(id, { compte_actif: body.compte_actif });
  }

  @Patch(':id/ban')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN')
  async banUser(@Param('id') id: string, @Body() body: BanUserDto) {
    return await this.usersService.banUser(id, body.days, body.reason);
  }

  @Patch(':id/assign-salle')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN')
  async assignSalleById(@Param('id') id: string, @Body('id_salle') id_salle: string) {
    return await this.usersService.updateStatus(id, { id_salle });
  }

  @Get(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN')
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }
}