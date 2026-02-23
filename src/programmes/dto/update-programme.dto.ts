import { PartialType } from '@nestjs/swagger';
import { CreateProgrammeDto } from './create-programme.dto';

export class UpdateProgrammeDto extends PartialType(CreateProgrammeDto) {}
