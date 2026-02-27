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
import { SallesService } from './salles.service';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('salles')
// ❌ ON SUPPRIME LE @UseGuards D'ICI pour laisser l'accès public par défaut
export class SallesController {
  constructor(private readonly sallesService: SallesService) {}

  @Get()
  // ✅ PUBLIC : Pour que Flutter puisse afficher la liste à l'étape 5
  findAll(@Query('gouvernorat') gouvernorat?: string) {
    return this.sallesService.findAll(gouvernorat);
  }

  @Get(':id')
  // ✅ PUBLIC : Pour voir les détails d'un centre
  findOne(@Param('id') id: string) {
    return this.sallesService.findOne(+id); // Enlevé le '+' car c'est un UUID
  }

  @Post()
  @UseGuards(AuthGuard('jwt'), RolesGuard) // 🔒 PROTÉGÉ
  @Roles('ADMIN')
  create(@Body() createSalleDto: any) {
    return this.sallesService.create(createSalleDto);
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard) // 🔒 PROTÉGÉ
  @Roles('ADMIN')
  update(@Param('id') id: string, @Body() updateSalleDto: any) {
    return this.sallesService.update(id, updateSalleDto);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard) // 🔒 PROTÉGÉ
  @Roles('ADMIN')
  remove(@Param('id') id: string) {
    return this.sallesService.remove(id);
  }
}
