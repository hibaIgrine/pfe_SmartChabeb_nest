import { IsString, IsNumber, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BanUserDto {
  @ApiProperty({ example: 7, description: 'Nombre de jours de suspension' })
  @IsNumber()
  @Min(1, { message: "La durée doit être d'au moins 1 jour" })
  days: number;

  @ApiProperty({
    example: 'Non-respect du règlement intérieur',
    description: 'Motif de la suspension',
  })
  @IsString()
  reason: string;
}
