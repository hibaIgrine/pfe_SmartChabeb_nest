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
  Request,
} from '@nestjs/common';
import { LocauxService } from './locaux.service';
import { CreateLocalDto } from './dto/create-local.dto';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from 'src/auth/roles.guard';
import { Roles } from 'src/auth/roles.decorator';

@Controller('locaux')
export class LocauxController {
  constructor(private readonly locauxService: LocauxService) {}

  @Get()
  @UseGuards(AuthGuard('jwt')) // 💡 On force la sécurité pour identifier le user
  findAll(@Request() req: any, @Query('id_centre') id_centre?: string) {
    // On envoie l'objet 'user' complet au service
    return this.locauxService.findAll(req.user, id_centre);
  }

  @Post()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN', 'RESPONSABLE_CENTRE')
  create(@Request() req: any, @Body() dto: CreateLocalDto) {
    return this.locauxService.create(dto, req.user.userId, req.user.role);
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
