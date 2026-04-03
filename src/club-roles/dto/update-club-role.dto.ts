import { PartialType } from '@nestjs/swagger';
import { CreateClubRoleDto } from './create-club-role.dto';

export class UpdateClubRoleDto extends PartialType(CreateClubRoleDto) {}
