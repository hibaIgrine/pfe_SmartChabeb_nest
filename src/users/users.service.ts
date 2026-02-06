import { Injectable } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import * as bcrypt from 'bcrypt';
@Injectable()
export class UsersService {
  //inject service prisma
  constructor(private readonly prisma: PrismaService) {}

  async create(createUserDto: CreateUserDto) {
    
      const salt = await bcrypt.genSalt();
      const hashedPassword = await bcrypt.hash(createUserDto.mot_de_passe, salt);

      return await this.prisma.utilisateurs.create({
        data: {
          ...createUserDto,
          mot_de_passe: hashedPassword,
         } as any, // 'as any' pour l'instant pour éviter les erreurs de typage strict
      });
  }

  async findAll() {
     return await this.prisma.utilisateurs.findMany();
  }

  async findOne(id: string) {
    return await this.prisma.utilisateurs.findUnique({
      where: { id: id },
    });
  }

  update(id: string, updateUserDto: UpdateUserDto) {
    return `This action updates a #${id} user`;
  }

  remove(id: string) {
    return `This action removes a #${id} user`;
  }
}
