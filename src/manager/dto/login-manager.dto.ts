import { IsEmail, IsNotEmpty } from 'class-validator';

export class LoginManagerDto {
  @IsEmail()
  email: string;

  @IsNotEmpty()
  password: string;
}
