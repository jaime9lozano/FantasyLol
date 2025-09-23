import { IsEmail, IsNotEmpty, MinLength, Matches } from 'class-validator';

export class CreateManagerDto {
  @IsNotEmpty()
  username: string;

  @IsEmail()
  email: string;

  @IsNotEmpty()
  @MinLength(6)
  // Ejemplo de regla extra (opcional): al menos 1 letra y 1 número
  // @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, {
  //   message: 'La contraseña debe contener al menos una letra y un número',
  // })
  password: string;
}

