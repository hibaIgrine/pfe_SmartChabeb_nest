import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { EtablissementsService } from './etablissements.service';

@Controller('etablissements')
export class EtablissementsController {
  constructor(private readonly etablissementsService: EtablissementsService) {}

  @Get()
  @UseGuards(AuthGuard('jwt'))
  async getAll() {
    return await this.etablissementsService.findAll();
  }

  @Get('search')
  @UseGuards(AuthGuard('jwt'))
  async search(@Query('q') query: string) {
    return await this.etablissementsService.searchByName(query || '');
  }
}
