import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsUUID } from 'class-validator';

export class AssignSalleByEmailDto {
  @ApiProperty({
    example: 'hiba@test.com',
    description: "L'email de l'utilisateur à modifier",
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    example: 'a1b2c3d4-e5f6-g7h8-i9j0-k1l2m3n4o5p6',
    description: "L'UUID de la salle choisie",
  })
  @IsUUID()
  @IsNotEmpty()
  id_salle: string;
}
