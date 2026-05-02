import { IsEmail, IsString, Length } from 'class-validator';

export class VerifyUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @Length(6, 6, { message: 'Le code doit contenir 6 chiffres' })
  code: string;
}
