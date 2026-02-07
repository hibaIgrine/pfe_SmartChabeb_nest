import { IsEmail, IsString, Length } from 'class-validator';

export class VerifyUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @Length(4, 4, { message: 'Le code doit contenir 4 chiffres' })
  code: string;
}
