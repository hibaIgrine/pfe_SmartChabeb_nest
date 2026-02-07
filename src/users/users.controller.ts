import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
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

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(id, updateUserDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }
}
