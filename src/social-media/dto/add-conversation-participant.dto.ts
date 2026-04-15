import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID } from 'class-validator';

export class AddConversationParticipantDto {
  @ApiProperty()
  @IsString()
  @IsUUID()
  userId: string;
}