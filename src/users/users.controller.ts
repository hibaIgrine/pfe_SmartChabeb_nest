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
  UseInterceptors,
  UploadedFile,
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
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // --- ROUTES PUBLIQUES ---

  @Post()
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Post('verify')
  async verify(@Body() verifyUserDto: VerifyUserDto) {
    return await this.usersService.verifyEmail(
      verifyUserDto.email,
      verifyUserDto.code,
    );
  }

  @Post('biometrics')
  async addBiometrics(@Body() biometricsDto: BiometricsDto) {
    return await this.usersService.saveBiometrics(biometricsDto);
  }

  @Patch('me/assign-salle')
  async assignSalleByEmail(@Body() body: AssignSalleByEmailDto) {
    return await this.usersService.assignToSalleByEmail(
      body.email,
      body.id_salle,
    );
  }

  @Patch('update-profile')
  async updateProfile(@Body() updateProfileDto: UpdateProfileDto) {
    return await this.usersService.updateProfile(
      updateProfileDto.email,
      updateProfileDto,
    );
  }

  // --- ROUTES PRIVÉES & ÉDITION PROFIL ---

  @Get('me/profile')
  @UseGuards(AuthGuard('jwt'))
  async getMyProfile(@Request() req: any) {
    return await this.usersService.getProfileWithBiometrics(req.user.userId);
  }

  // CETTE ROUTE UNIQUE GÈRE TOUT : TEXTE + IMAGE GALERIE + AVATAR ASSET
  @Patch(':id')
  @UseGuards(AuthGuard('jwt'))
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads',
        filename: (req, file, cb) => {
          const randomName = Array(32)
            .fill(null)
            .map(() => Math.round(Math.random() * 16).toString(16))
            .join('');
          return cb(null, `${randomName}${extname(file.originalname)}`);
        },
      }),
    }),
  )
  async update(
    @Param('id') id: string,
    @Body() updateUserDto: any,
    @UploadedFile() file: Express.Multer.File,
  ) {
    // Si un fichier est uploadé, on génère l'URL pour la base de données
    if (file) {
      updateUserDto.photo_profil_url = `/uploads/${file.filename}`;
    }
    // On appelle ton service "Excellence" (celui qui gère le NOT id: id)
    return await this.usersService.update(id, updateUserDto);
  }

  // --- ROUTES ADMINISTRATIVES ---

  @Get()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  // 🛡️ On autorise l'Admin ET le Coach (et le Gestionnaire si besoin)
  @Roles('ADMIN', 'COACH', 'GESTIONNAIRE')
  findAll(@Request() req: any) {
    // Le service fera ensuite le tri :
    // - L'admin recevra TOUT.
    // - Le coach recevra uniquement SES élèves.
    return this.usersService.findAll(req.user.userId, req.user.role);
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
    return await this.usersService.updateStatus(id, {
      compte_actif: body.compte_actif,
    });
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
  async assignSalleById(
    @Param('id') id: string,
    @Body('id_salle') id_salle: string,
  ) {
    return await this.usersService.updateStatus(id, { id_salle });
  }

  // src/users/users.controller.ts

  @Get(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN', 'COACH') // 👈 Ajoute COACH ici
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
