import { ApiProperty } from "@nestjs/swagger";

export class CreateUserDto {
     @ApiProperty({ example: 'Ben Ahmed' })
  nom: string;

  @ApiProperty({ example: 'Ali' })
  prenom: string;

  @ApiProperty({ example: 'ali@email.com' })
  email: string;

  @ApiProperty({ example: 'password123' })
  mot_de_passe: string;

  @ApiProperty({ example: 'ADHERENT' })
  role: string;

}
