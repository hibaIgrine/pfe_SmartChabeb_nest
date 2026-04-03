import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
} from '@nestjs/common';
import { CentresService } from './centres.service'; // 💡 Import mis à jour
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('centres') // 💡 La route devient /centres
export class CentresController {
  constructor(private readonly centresService: CentresService) {}

  // ==========================================
  // ROUTES PUBLIQUES (Utilisées par le Mobile)
  // ==========================================

  @Get()
  // ✅ Accessible sans token pour l'onboarding Flutter
  findAll(@Query('gouvernorat') gouvernorat?: string) {
    return this.centresService.findAll(gouvernorat);
  }

  @Get(':id')
  // ✅ Pour voir les locaux et les clubs d'un centre précis
  findOne(@Param('id') id: string) {
    return this.centresService.findOne(id);
  }

  // ==========================================
  // ROUTES ADMINISTRATIVES (🔒 Protégées)
  // ==========================================

  @Post()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN')
  create(@Body() createCentreDto: any) {
    return this.centresService.create(createCentreDto);
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN', 'RESPONSABLE_CENTRE')
  update(@Param('id') id: string, @Body() updateCentreDto: any) {
    return this.centresService.update(id, updateCentreDto);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN')
  remove(@Param('id') id: string) {
    return this.centresService.remove(id);
  }
}
