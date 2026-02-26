import { IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangeStatusDto {
  @ApiProperty({
    example: true,
    description: 'Statut du compte (actif ou non)',
  })
  @IsBoolean()
  compte_actif: boolean;
}
