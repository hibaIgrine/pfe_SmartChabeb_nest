import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { SallesService } from './salles.service';
import { CreateSalleDto } from './dto/create-salle.dto';
import { UpdateSalleDto } from './dto/update-salle.dto';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('salles')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class SallesController {
  constructor(private readonly sallesService: SallesService) {}

  @Post()
  @Roles('ADMIN') // Seul l'Admin peut créer
  create(@Body() createSalleDto: any) {
    return this.sallesService.create(createSalleDto);
  }

  @Get()
  findAll() {
    return this.sallesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.sallesService.findOne(+id);
  }

  @Patch(':id')
  @Roles('ADMIN')
  update(@Param('id') id: string, @Body() updateSalleDto: any) {
    return this.sallesService.update(id, updateSalleDto);
  }

  @Delete(':id')
  @Roles('ADMIN')
  remove(@Param('id') id: string) {
    return this.sallesService.remove(id);
  }
}
