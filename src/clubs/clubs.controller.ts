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
  Query,
} from '@nestjs/common';
import { ClubsService } from './clubs.service';
import { CreateClubDto } from './dto/create-club.dto';
import { UpdateClubDto } from './dto/update-club.dto';
import { Roles } from 'src/auth/roles.decorator';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from 'src/auth/roles.guard';

@Controller('clubs')
export class ClubsController {
  constructor(private readonly clubsService: ClubsService) {}

  // 💡 1. CETTE ROUTE DOIT ÊTRE EN PREMIER
  // Elle est statique. Si elle est après ':id', NestJS croit que 'my-inscriptions' est un ID.
  @Get('my-inscriptions')
  @UseGuards(AuthGuard('jwt'))
  async getMyInscriptions(@Request() req) {
    if (!req.user || !req.user.userId) {
      console.error('❌ Pas de userId trouvé dans la requête !');
    }
    return await this.clubsService.findMyClubs(req.user.userId);
  }

  // 💡 2. Les routes générales
  @Get()
  findAll(@Query('id_salle') id_salle?: string) {
    console.log(
      '📡 [ClubsController] GET /clubs called with id_salle:',
      id_salle,
    );
    return this.clubsService.findAll(id_salle);
  }

  // 💡 3. Les routes avec paramètres spécifiques (comme 'inscription/...')
  @Patch('inscription/:id/status')
  @UseGuards(AuthGuard('jwt'))
  async updateInscriptionStatus(
    @Param('id') id: string,
    @Body('statut') statut: string,
    @Request() req: any,
  ) {
    return await this.clubsService.updateInscriptionStatus(
      id,
      statut,
      req.user.userId,
    );
  }
  // src/clubs/clubs.controller.ts
  @Patch('inscription/:id/suspend')
  @UseGuards(AuthGuard('jwt'))
  async suspend(
    @Param('id') id: string,
    @Body() data: { dateFin: string; motif: string },
  ) {
    return await this.clubsService.suspendMember(id, data);
  }

  @Patch('inscription/:id/reactivate')
  @UseGuards(AuthGuard('jwt'))
  async reactivate(@Param('id') id: string) {
    return await this.clubsService.reactivateMember(id);
  }
  // clubs.controller.ts
  @Delete('inscription/:id')
  @UseGuards(AuthGuard('jwt'))
  async removeInscription(@Param('id') id: string) {
    return await this.clubsService.removeInscription(id);
  }
  // src/clubs/clubs.controller.ts

  @Delete(':id/leave')
  @UseGuards(AuthGuard('jwt'))
  async leaveClub(@Param('id') clubId: string, @Request() req: any) {
    return await this.clubsService.leaveClub(req.user.userId, clubId);
  }

  @Post(':id/staff')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN', 'RESPONSABLE_CENTRE', 'RESPONSABLE_CLUB')
  async addStaffToClub(
    @Param('id') clubId: string,
    @Body() body: { id_utilisateur: string; role_dans_club: string },
  ) {
    return await this.clubsService.addStaffToClub(clubId, body);
  }

  @Patch(':id/staff/:staffId/deactivate')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN', 'RESPONSABLE_CENTRE', 'RESPONSABLE_CLUB')
  async deactivateStaff(
    @Param('id') clubId: string,
    @Param('staffId') staffId: string,
  ) {
    return await this.clubsService.deactivateStaff(clubId, staffId);
  }

  @Patch(':id/staff/:staffId/reactivate')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN', 'RESPONSABLE_CENTRE', 'RESPONSABLE_CLUB')
  async reactivateStaff(
    @Param('id') clubId: string,
    @Param('staffId') staffId: string,
  ) {
    return await this.clubsService.reactivateStaff(clubId, staffId);
  }

  // 💡 4. Les routes avec paramètres génériques ':id' TOUJOURS EN DERNIER
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.clubsService.findOne(id);
  }

  @Patch(':id/activate')
  activate(@Param('id') id: string) {
    return this.clubsService.activate(id);
  }

  @Patch(':id/start')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN', 'RESPONSABLE_CENTRE')
  validateStart(@Param('id') id: string, @Request() req: any) {
    return this.clubsService.validateClubStart(
      id,
      req.user.userId,
      req.user.role,
    );
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.clubsService.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.clubsService.remove(id);
  }

  @Post(':id/apply')
  @UseGuards(AuthGuard('jwt'))
  async applyToClub(@Param('id') clubId: string, @Request() req: any) {
    return await this.clubsService.applyToClub(req.user.userId, clubId);
  }

  @Post()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN', 'RESPONSABLE_CENTRE')
  async create(@Request() req: any, @Body() body: any) {
    return await this.clubsService.create(body, req.user.userId, req.user.role);
  }
}
