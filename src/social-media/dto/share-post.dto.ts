import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SharePostDto {
  @ApiPropertyOptional({
    description: 'Message personnel affiché au-dessus de la publication partagée',
    maxLength: 1000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string;
}
