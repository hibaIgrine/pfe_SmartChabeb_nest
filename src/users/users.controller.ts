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
import { Roles } from 'src/auth/roles.decorator';
import { RolesGuard } from 'src/auth/roles.guard';
import { BanUserDto } from './dto/ban-user.dto';
import { ChangeRoleDto } from './dto/change-role.dto';
import { ChangeStatusDto } from './dto/change-status.dto';
import { AssignSalleByEmailDto } from './dto/assign-salle.dto'; // Tu pourras renommer le fichier DTO plus tard
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // ==========================================
  // 1. ROUTES PUBLIQUES (INSCRIPTION & OTP)
  // ==========================================

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
  @Patch('update-profile') // 💡 C'est la route appelée par Flutter à l'étape 3
  async updateProfile(@Body() updateProfileDto: any) {
    return await this.usersService.updateProfile(
      updateProfileDto.email,
      updateProfileDto,
    );
  }

  // ==========================================
  // 2. ROUTES PRIVÉES (MON PROFIL)
  // ==========================================

  @Get('me/profile')
  @UseGuards(AuthGuard('jwt'))
  async getMyProfile(@Request() req: any) {
    // Appelle findOne qui inclut maintenant les clubs et le centre
    return await this.usersService.findOne(req.user.userId);
  }

  @Patch('me/assign-centre') // 💡 salle -> centre
  async assignCentreByEmail(@Body() body: any) {
    return await this.usersService.assignToCentreByEmail(
      body.email,
      body.id_centre,
    );
  }

  // MISE À JOUR + UPLOAD IMAGE
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
      updateUserDto.photo_profil_url = `${process.env.API_URL}/uploads/${file.filename}`;
    }
    return await this.usersService.update(id, updateUserDto);
  }

  // ==========================================
  // 3. ROUTES ADMINISTRATIVES & STAFF
  // ==========================================

  @Get('staff-by-centre/:id_centre') // 💡 salle -> centre
  @UseGuards(AuthGuard('jwt'))
  async getStaffByCentre(@Param('id_centre') id_centre: string) {
    return await this.usersService.findStaffByCentre(id_centre);
  }

  @Get('adherents-by-centre/:id_centre')
  @UseGuards(AuthGuard('jwt'))
  async getAdherentsByCentre(@Param('id_centre') id_centre: string) {
    return await this.usersService.findAdherentsByCentre(id_centre);
  }

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

  @Patch(':id/assign-centre') // 💡 salle -> centre
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN')
  async assignCentreById(
    @Param('id') id: string,
    @Body('id_centre') id_centre: string,
  ) {
    return await this.usersService.updateStatus(id, { id_centre });
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN')
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }
}
