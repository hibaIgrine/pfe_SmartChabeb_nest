import { PartialType } from '@nestjs/swagger';
import { CreateForfaitDto } from './create-forfait.dto';

export class UpdateForfaitDto extends PartialType(CreateForfaitDto) {}
