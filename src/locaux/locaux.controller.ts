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
import { LocauxService } from './locaux.service';
import { CreateLocalDto } from './dto/create-local.dto';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from 'src/auth/roles.guard';
import { Roles } from 'src/auth/roles.decorator';

@Controller('locaux')
export class LocauxController {
  constructor(private readonly locauxService: LocauxService) {}

  @Post()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN') // Seul l'admin crée des locaux
  create(@Body() dto: CreateLocalDto) {
    return this.locauxService.create(dto);
  }

  @Get()
  // Accessible par tous (Mobile & Web) pour voir les salles dispo
  findAll(@Query('id_centre') id_centre?: string) {
    return this.locauxService.findAll(id_centre);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.locauxService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN')
  update(@Param('id') id: string, @Body() data: any) {
    return this.locauxService.update(id, data);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN')
  remove(@Param('id') id: string) {
    return this.locauxService.remove(id);
  }
}
