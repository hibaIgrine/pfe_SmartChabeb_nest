import { IsString, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangeRoleDto {
  @ApiProperty({
    example: 'COACH',
    enum: ['ADHERENT', 'COACH', 'ADMIN', 'GESTIONNAIRE'],
    description: 'Le nouveau rôle à attribuer',
  })
  @IsString()
  @IsEnum(['ADHERENT', 'COACH', 'ADMIN', 'GESTIONNAIRE'], {
    message: 'Le rôle doit être : ADHERENT, COACH, ADMIN ou GESTIONNAIRE',
  })
  role: string;
}
