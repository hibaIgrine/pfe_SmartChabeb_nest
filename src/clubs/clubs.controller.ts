import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards,Request, Query } from '@nestjs/common';
import { ClubsService } from './clubs.service';
import { CreateClubDto } from './dto/create-club.dto';
import { UpdateClubDto } from './dto/update-club.dto';
import { Roles } from 'src/auth/roles.decorator';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from 'src/auth/roles.guard';

@Controller('clubs')
export class ClubsController {
  constructor(private readonly clubsService: ClubsService) {}

  @Get() // Utilisé par le Web (tout) et le Mobile (filtré)
  findAll(@Query('id_salle') id_salle?: string) {
    console.log('📡 [ClubsController] GET /clubs called with id_salle:', id_salle);
    return this.clubsService.findAll(id_salle);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.clubsService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.clubsService.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.clubsService.remove(id);
  }
  @Post('join') // Action de l'adhérent
  @UseGuards(AuthGuard('jwt'))
  async join(@Request() req, @Body('id_club') clubId: string) {
    return await this.clubsService.joinClub(req.user.userId, clubId);
  }

  @Get('my-inscriptions')
  @UseGuards(AuthGuard('jwt'))
  async getMyInscriptions(@Request() req) {
    return await this.clubsService.findMyClubs(req.user.userId);
  }
  @Post()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN')
  async create(@Body() body: any) {
    // Supprime tout bloc try/catch ici, laisse NestJS gérer l'erreur
    // pour qu'elle remonte jusqu'à React.
    return await this.clubsService.create(body);
  }
}
