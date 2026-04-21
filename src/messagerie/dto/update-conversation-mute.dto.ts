import { IsBoolean, IsIn, IsOptional } from 'class-validator';

export class UpdateConversationMuteDto {
  @IsBoolean()
  is_muted: boolean;

  @IsOptional()
  @IsIn(['1H', 'UNTIL_REACTIVATED'])
  mode?: '1H' | 'UNTIL_REACTIVATED';
}
