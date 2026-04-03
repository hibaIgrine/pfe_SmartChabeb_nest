import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ClubRolesService } from './club-roles.service';
import { CreateClubRoleDto } from './dto/create-club-role.dto';
import { UpdateClubRoleDto } from './dto/update-club-role.dto';

@Controller('club-roles')
export class ClubRolesController {
  constructor(private readonly clubRolesService: ClubRolesService) {}

  @Post()
  create(@Body() createClubRoleDto: CreateClubRoleDto) {
    return this.clubRolesService.create(createClubRoleDto);
  }

  @Get()
  findAll() {
    return this.clubRolesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.clubRolesService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateClubRoleDto: UpdateClubRoleDto,
  ) {
    return this.clubRolesService.update(id, updateClubRoleDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.clubRolesService.remove(id);
  }
}
