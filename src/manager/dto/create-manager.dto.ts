import { IsEmail, IsNotEmpty, MinLength } from 'class-validator';

export class CreateManagerDto {
  @IsNotEmpty()
  username: string;

  @IsEmail()
  email: string;

  @IsNotEmpty()
  @MinLength(6)
  password: string; // manejaremos hashing luego en el servicio
}

