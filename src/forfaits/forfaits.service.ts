import { Injectable } from '@nestjs/common';
import { CreateForfaitDto } from './dto/create-forfait.dto';
import { UpdateForfaitDto } from './dto/update-forfait.dto';

@Injectable()
export class ForfaitsService {
  create(createForfaitDto: CreateForfaitDto) {
    return 'This action adds a new forfait';
  }

  findAll() {
    return `This action returns all forfaits`;
  }

  findOne(id: number) {
    return `This action returns a #${id} forfait`;
  }

  update(id: number, updateForfaitDto: UpdateForfaitDto) {
    return `This action updates a #${id} forfait`;
  }

  remove(id: number) {
    return `This action removes a #${id} forfait`;
  }
}
