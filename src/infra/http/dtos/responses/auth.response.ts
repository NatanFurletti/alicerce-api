import { ApiProperty } from '@nestjs/swagger';

/** Usuário como aparece no login: sem datas, só a identificação. */
export class AuthUserResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Natan Furletti' })
  name!: string;

  @ApiProperty({ example: 'natan@example.com' })
  email!: string;
}

/** Perfil completo: resposta do cadastro e de `GET /me`. */
export class UserResponseDto extends AuthUserResponseDto {
  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;
}

export class TokenPairResponseDto {
  @ApiProperty({ description: 'JWT de acesso. Vale 15 minutos.' })
  accessToken!: string;

  @ApiProperty({
    description: 'JWT de renovação, aceito só em /auth/refresh. Vale 7 dias.',
  })
  refreshToken!: string;
}

export class LoginResponseDto extends TokenPairResponseDto {
  @ApiProperty({ type: AuthUserResponseDto })
  user!: AuthUserResponseDto;
}
