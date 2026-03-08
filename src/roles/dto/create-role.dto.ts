import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateRoleDto {
  @ApiProperty({ example: 'COACH' })
  @IsString()
  @IsNotEmpty()
  nom: string;

  @ApiProperty({ example: 'Animateur de club sportif', required: false })
  @IsString()
  @IsOptional()
  description?: string;
}
