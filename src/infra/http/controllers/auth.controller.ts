import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { AuthenticateUserUseCase } from '../../../application/use-cases/authenticate-user';
import { GetProfileUseCase } from '../../../application/use-cases/get-profile';
import { RefreshTokenUseCase } from '../../../application/use-cases/refresh-token';
import { RegisterUserUseCase } from '../../../application/use-cases/register-user';
import { Public } from '../../auth/jwt-auth.guard';
import { AUTH_THROTTLE } from '../throttler.config';
import { CurrentUserId } from '../decorators/current-user.decorator';
import { LoginDto, RefreshDto, RegisterDto } from '../dtos/auth.dto';

/**
 * Rotas de autenticação.
 *
 * O controller é fino por decisão de arquitetura: valida a entrada (via DTO), chama o
 * caso de uso e devolve. Zero regra de negócio — nem sequer o mapeamento de erro, que
 * fica no exception filter.
 *
 * `/auth/*` é público porque é a porta de entrada: exigir token para fazer login seria
 * circular. `/me` é protegido pelo guard global, sem precisar de decorator.
 */
@ApiTags('auth')
@Controller()
export class AuthController {
  constructor(
    private readonly registerUser: RegisterUserUseCase,
    private readonly authenticateUser: AuthenticateUserUseCase,
    private readonly refreshTokenUseCase: RefreshTokenUseCase,
    private readonly getProfile: GetProfileUseCase,
  ) {}

  /**
   * Rate limit mais apertado que o global: cadastro e login são os alvos preferidos
   * de força bruta e de criação de contas em massa.
   */
  @ApiOperation({
    summary: 'Cadastra um usuário',
    description: 'Rate limit de 5/min por IP. A senha nunca é devolvida nem logada.',
  })
  @ApiResponse({ status: 201, description: 'Usuário criado.' })
  @ApiResponse({ status: 400, description: 'VALIDATION_ERROR — entrada malformada.' })
  @ApiResponse({
    status: 409,
    description: 'EMAIL_ALREADY_IN_USE — e-mail já cadastrado.',
  })
  @ApiResponse({ status: 429, description: 'RATE_LIMIT_EXCEEDED.' })
  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('auth/register')
  async register(@Body() dto: RegisterDto): Promise<{
    id: string;
    name: string;
    email: string;
    createdAt: Date;
  }> {
    return this.registerUser.execute(dto);
  }

  // 200 e não 201: login não cria recurso.
  @ApiOperation({
    summary: 'Autentica e devolve os tokens',
    description:
      'Access token de 15 minutos e refresh de 7 dias. Senha errada e e-mail ' +
      'inexistente produzem a MESMA resposta, para não permitir enumerar a base.',
  })
  @ApiResponse({ status: 200, description: 'Autenticado.' })
  @ApiResponse({ status: 401, description: 'INVALID_CREDENTIALS.' })
  @ApiResponse({ status: 429, description: 'RATE_LIMIT_EXCEEDED.' })
  @Public()
  @Throttle(AUTH_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @Post('auth/login')
  async login(@Body() dto: LoginDto): Promise<{
    accessToken: string;
    refreshToken: string;
    user: { id: string; name: string; email: string };
  }> {
    return this.authenticateUser.execute(dto);
  }

  @ApiOperation({
    summary: 'Renova o par de tokens',
    description:
      'Aceita SOMENTE refresh token — um access token aqui devolve 401. Não há ' +
      'revogação: os tokens são stateless (ADR-006), e por isso não existe logout.',
  })
  @ApiResponse({ status: 200, description: 'Novo par emitido.' })
  @ApiResponse({
    status: 401,
    description: 'INVALID_TOKEN — inválido, expirado ou tipo errado.',
  })
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('auth/refresh')
  async refresh(
    @Body() dto: RefreshDto,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    return this.refreshTokenUseCase.execute(dto);
  }

  /** Protegido pelo guard global. O id vem do token, nunca do corpo da requisição. */
  @ApiOperation({ summary: 'Perfil do usuário autenticado' })
  @ApiBearerAuth('access-token')
  @ApiResponse({ status: 200, description: 'Perfil.' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED.' })
  @Get('me')
  async me(@CurrentUserId() userId: string): Promise<{
    id: string;
    name: string;
    email: string;
    createdAt: Date;
  }> {
    return this.getProfile.execute(userId);
  }
}
