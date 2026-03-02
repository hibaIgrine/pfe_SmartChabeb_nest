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
} from '@nestjs/common';
import { ProgrammesService } from './programmes.service';
import { CreateProgrammeDto } from './dto/create-programme.dto';
import { UpdateProgrammeDto } from './dto/update-programme.dto';
import { AuthGuard } from '@nestjs/passport';

@Controller('programmes')
export class ProgrammesController {
  constructor(private readonly programmesService: ProgrammesService) {}

  @Post() // Utilisé par le coach
  create(@Body() body: any) {
    return this.programmesService.create(body);
  }

  @UseGuards(AuthGuard('jwt')) // Utilisé par l'adhérent
  @Get('my-program')
  async getMyProgram(@Request() req: any) {
    // req.user.userId vient du Token JWT
    return await this.programmesService.findMyProgram(req.user.userId);
  }

  @Get()
  findAll() {
    return this.programmesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.programmesService.findOne(+id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateProgrammeDto: UpdateProgrammeDto,
  ) {
    return this.programmesService.update(+id, updateProgrammeDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.programmesService.remove(+id);
  }
}
