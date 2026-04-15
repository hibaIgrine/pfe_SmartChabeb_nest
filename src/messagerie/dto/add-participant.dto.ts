import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AddParticipantDto {
  @ApiProperty()
  @IsUUID()
  userId: string;
}
