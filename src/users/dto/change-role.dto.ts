import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangeRoleDto {
  @ApiProperty({ example: 'COACH' })
  @IsString()
  @IsNotEmpty()
  role: string; // 🏆 Ici, on ne met PAS de @IsEnum pour que ça ne bloque plus jamais
}
