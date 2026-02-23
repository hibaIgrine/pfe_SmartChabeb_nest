import { Injectable } from '@nestjs/common';
import { CreateProgrammeDto } from './dto/create-programme.dto';
import { UpdateProgrammeDto } from './dto/update-programme.dto';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class ProgrammesService {
  constructor(private readonly prisma: PrismaService) {}

  async findMyProgram(userId: string) {
    const programs = await this.prisma.programmes_sportifs.findMany({
      where: { id_membre: userId },
      orderBy: { id: 'desc' }, // On prend le plus récent en premier
    });

    if (!programs || programs.length === 0) {
      return [];
    }
    return programs;
  }





  create(createProgrammeDto: CreateProgrammeDto) {
    return 'This action adds a new programme';
  }
  
  findAll() {
    return `This action returns all programmes`;
  }

  findOne(id: number) {
    return `This action returns a #${id} programme`;
  }

  update(id: number, updateProgrammeDto: UpdateProgrammeDto) {
    return `This action updates a #${id} programme`;
  }

  remove(id: number) {
    return `This action removes a #${id} programme`;
  }
}
