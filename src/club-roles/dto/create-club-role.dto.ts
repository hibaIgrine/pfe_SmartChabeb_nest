import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateClubRoleDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  nom: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}
