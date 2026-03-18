import { PartialType } from '@nestjs/swagger';
import { CreateCentreDto } from './create-centre.dto';

export class UpdateSalleDto extends PartialType(CreateCentreDto) {}
