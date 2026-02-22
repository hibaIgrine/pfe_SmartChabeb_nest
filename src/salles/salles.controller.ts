import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { SallesService } from './salles.service';
import { CreateSalleDto } from './dto/create-salle.dto';
import { UpdateSalleDto } from './dto/update-salle.dto';

@Controller('salles')
export class SallesController {
  constructor(private readonly sallesService: SallesService) {}

  @Post()
  create(@Body() createSalleDto: CreateSalleDto) {
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
  update(@Param('id') id: string, @Body() updateSalleDto: UpdateSalleDto) {
    return this.sallesService.update(+id, updateSalleDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.sallesService.remove(+id);
  }
}
