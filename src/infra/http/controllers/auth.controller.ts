import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
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

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('auth/refresh')
  async refresh(
    @Body() dto: RefreshDto,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    return this.refreshTokenUseCase.execute(dto);
  }

  /** Protegido pelo guard global. O id vem do token, nunca do corpo da requisição. */
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
