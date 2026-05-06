import { IsNotEmpty, IsNumber, IsString, IsUrl } from 'class-validator';

export class CreatePaymentDto {
  @IsNotEmpty()
  @IsString()
  reservationId: string;

  @IsNotEmpty()
  @IsNumber()
  amount: number;

  @IsNotEmpty()
  @IsUrl()
  returnUrl: string;
}
