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

  // --- 1. ROUTES PUBLIQUES (INSCRIPTION & VALIDATION) ---

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

  // --- 2. ROUTES PRIVÉES (TOKEN REQUIS) ---

  @Get('me/profile')
  @UseGuards(AuthGuard('jwt'))
  async getMyProfile(@Request() req: any) {
    return await this.usersService.getProfileWithBiometrics(req.user.userId);
  }
  // Ajouter dans users.controller.ts
  @Get('staff/:id_salle')
  @UseGuards(AuthGuard('jwt'))
  async getStaffBySalle(@Param('id_salle') id_salle: string) {
    return await this.usersService.findStaffBySalle(id_salle);
  }
  // CETTE ROUTE UNIQUE GÈRE TOUT : MISE À JOUR + UPLOAD IMAGE
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
    if (file) {
      // ⚠️ METS À JOUR CETTE IP SI ELLE CHANGE DANS TA CONSTANTS.DART
      updateUserDto.photo_profil_url = `${process.env.API_URL}/uploads/${file.filename}`;
    }
    return await this.usersService.update(id, updateUserDto);
  }

  // --- 3. ROUTES ADMINISTRATIVES & COACHING ---

  @Get()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN', 'COACH', 'GESTIONNAIRE')
  findAll(@Request() req: any) {
    return this.usersService.findAll(req.user.userId, req.user.role);
  }

  @Get(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN', 'COACH')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id/role')
  @Roles('ADMIN')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  async changeRole(@Param('id') id: string, @Body() body: ChangeRoleDto) {
    // 👈 Utilise bien le DTO ici
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

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN')
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }
}
