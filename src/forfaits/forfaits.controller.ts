import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { ForfaitsService } from './forfaits.service';
import { CreateForfaitDto } from './dto/create-forfait.dto';
import { UpdateForfaitDto } from './dto/update-forfait.dto';

@Controller('forfaits')
export class ForfaitsController {
  constructor(private readonly forfaitsService: ForfaitsService) {}

  @Post()
  create(@Body() createForfaitDto: CreateForfaitDto) {
    return this.forfaitsService.create(createForfaitDto);
  }

  @Get()
  findAll() {
    return this.forfaitsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.forfaitsService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateForfaitDto: UpdateForfaitDto) {
    return this.forfaitsService.update(+id, updateForfaitDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.forfaitsService.remove(+id);
  }
}
