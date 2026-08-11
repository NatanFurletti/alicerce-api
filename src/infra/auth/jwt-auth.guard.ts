import {
  CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import type { TokenService } from '../../application/ports/token-service';
import { InvalidTokenError } from '../../domain/errors/domain-errors';
import { TOKEN_SERVICE } from './tokens';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marca uma rota como pública.
 *
 * O guard é **global** (ver `AuthModule`), então o padrão é exigir autenticação e as
 * exceções são declaradas explicitamente. O inverso — proteger rota a rota — falha por
 * omissão: esquecer o decorator num endpoint novo o deixa aberto, e ninguém percebe
 * até vazar. Aqui, esquecer o `@Public()` quebra o endpoint de forma visível.
 */
export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_PUBLIC_KEY, true);

/** Requisição com o usuário autenticado anexado pelo guard. */
export interface AuthenticatedRequest extends Request {
  user?: { id: string };
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokens: TokenService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic === true) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = extractBearerToken(request.headers.authorization);

    if (token === null) {
      throw unauthorized();
    }

    try {
      // Exige explicitamente um token de ACCESS: um refresh token tem assinatura
      // válida e vida longa, e não pode servir de credencial de acesso.
      const payload = await this.tokens.verify(token, 'access');

      // O controller lê daqui em vez de decodificar o token de novo.
      request.user = { id: payload.sub };
    } catch (error) {
      // O guard é a única camada HTTP que existe antes da Etapa 5, então ele mesmo
      // traduz o erro. Sem isto, uma falha de autenticação vira 500 — que além de
      // errado semanticamente, sugere defeito do servidor em vez de credencial ruim.
      if (error instanceof InvalidTokenError) {
        throw unauthorized();
      }
      throw error;
    }

    return true;
  }
}

/**
 * Resposta única para toda falha de autenticação.
 *
 * A mensagem é deliberadamente genérica: distinguir "expirado" de "assinatura
 * inválida" ou de "tipo errado" daria a um atacante o retorno necessário para calibrar
 * tentativas. O `code` estável permite ao cliente reagir (renovar o token) sem que a
 * API revele o porquê.
 */
function unauthorized(): UnauthorizedException {
  return new UnauthorizedException({
    code: 'UNAUTHORIZED',
    message: 'Credenciais ausentes ou inválidas.',
  });
}

/**
 * Extrai o token de `Authorization: Bearer <token>`.
 *
 * Comparação do esquema em minúsculas porque a RFC 7235 define o esquema como
 * case-insensitive — clientes mandam `bearer`, `Bearer` e `BEARER`.
 */
function extractBearerToken(header: string | undefined): string | null {
  if (header === undefined) return null;

  const [scheme, value, ...rest] = header.split(' ');

  if (scheme?.toLowerCase() !== 'bearer' || value === undefined || rest.length > 0) {
    return null;
  }

  return value.trim() === '' ? null : value;
}
