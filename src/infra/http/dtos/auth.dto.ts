import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

import { MAX_PASSWORD_BYTES } from '../../auth/bcrypt-password-hasher';

/**
 * Comprimento mínimo de senha.
 *
 * 8 é o piso da recomendação da OWASP para senhas com outros controles em vigor. O
 * projeto não impõe regra de composição (maiúscula, símbolo): a orientação atual é que
 * comprimento vale mais que complexidade forçada, que só empurra o usuário para
 * `Senha@123`.
 */
const MIN_PASSWORD_LENGTH = 8;

export class RegisterDto {
  @IsString()
  // Apara espaços antes de validar: "   " deve reprovar em `@MinLength(1)`, não
  // passar como nome de 3 caracteres.
  @Transform(({ value }): unknown => (typeof value === 'string' ? value.trim() : value))
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsEmail()
  @MaxLength(320)
  email!: string;

  // O teto é o limite do bcrypt (72 bytes). Rejeitar aqui dá ao usuário uma mensagem
  // de validação clara, em vez de deixar o erro estourar no hashing.
  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH)
  @MaxLength(MAX_PASSWORD_BYTES)
  password!: string;
}

/**
 * Entrada de login.
 *
 * Deliberadamente **sem** `@IsEmail()` nem limite de comprimento: a validação de
 * formato produziria 400 para e-mail malformado e 401 para credencial errada, e essa
 * diferença é um sinal a mais para quem sonda a base. O caso de uso trata tudo como
 * `InvalidCredentialsError` (ADR-022).
 */
export class LoginDto {
  @IsString()
  email!: string;

  @IsString()
  password!: string;
}

export class RefreshDto {
  @IsString()
  @MinLength(1)
  refreshToken!: string;
}
