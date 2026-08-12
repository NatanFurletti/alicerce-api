import { ApiProperty } from '@nestjs/swagger';
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
  @ApiProperty({
    description: 'Nome do usuário.',
    example: 'Natan Furletti',
    maxLength: 200,
  })
  @IsString()
  // Apara espaços antes de validar: "   " deve reprovar em `@MinLength(1)`, não
  // passar como nome de 3 caracteres.
  @Transform(({ value }): unknown => (typeof value === 'string' ? value.trim() : value))
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiProperty({
    description: 'E-mail. Normalizado para minúsculas; precisa ser único.',
    example: 'natan@example.com',
  })
  @IsEmail()
  @MaxLength(320)
  email!: string;

  // O teto é o limite do bcrypt (72 bytes). Rejeitar aqui dá ao usuário uma mensagem
  // de validação clara, em vez de deixar o erro estourar no hashing.
  @ApiProperty({
    description:
      'Senha. Mínimo de 8 caracteres; o máximo é o limite do bcrypt (72 bytes), ' +
      'acima do qual ele truncaria em silêncio.',
    example: 'senha-valida-123',
    minLength: MIN_PASSWORD_LENGTH,
    maxLength: MAX_PASSWORD_BYTES,
  })
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
  @ApiProperty({ example: 'natan@example.com' })
  @IsString()
  email!: string;

  @ApiProperty({ example: 'senha-valida-123' })
  @IsString()
  password!: string;
}

export class RefreshDto {
  @ApiProperty({
    description: 'O refreshToken devolvido no login. Um access token aqui dá 401.',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  @IsString()
  @MinLength(1)
  refreshToken!: string;
}
