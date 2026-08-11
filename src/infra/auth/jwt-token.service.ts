import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import type {
  TokenPair,
  TokenPayload,
  TokenService,
} from '../../application/ports/token-service';
import { InvalidTokenError } from '../../domain/errors/domain-errors';

/**
 * Duração no formato aceito pela lib `ms`: `'15m'`, `'7d'`, `'900s'`.
 *
 * O tipo é o que o `jsonwebtoken` exige em `expiresIn`. Declarado aqui para que a
 * configuração seja validada no boot, e não descoberta como erro de runtime na
 * primeira emissão de token.
 */
type Duration = `${number}${'s' | 'm' | 'h' | 'd'}`;

export interface JwtConfig {
  readonly accessSecret: string;
  readonly accessTtl: Duration;
  readonly refreshSecret: string;
  readonly refreshTtl: Duration;
}

/**
 * Emissão e verificação de JWT (ADR-006).
 *
 * **Segredos distintos para access e refresh.** Não é redundância: se o segredo de
 * access vazar — e ele circula em muito mais requisições —, o atacante ainda não
 * consegue forjar refresh tokens, que valem dias. Comprometer os dois exige dois
 * vazamentos.
 *
 * O `type` no payload é verificado além da assinatura. Sem isso, um access token
 * assinado com o mesmo segredo seria aceito na rota de refresh, e vice-versa.
 */
@Injectable()
export class JwtTokenService implements TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: JwtConfig,
  ) {}

  async issuePair(userId: string): Promise<TokenPair> {
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync({ sub: userId, type: 'access' } satisfies TokenPayload, {
        secret: this.config.accessSecret,
        expiresIn: this.config.accessTtl,
      }),
      this.jwt.signAsync({ sub: userId, type: 'refresh' } satisfies TokenPayload, {
        secret: this.config.refreshSecret,
        expiresIn: this.config.refreshTtl,
      }),
    ]);

    return { accessToken, refreshToken };
  }

  async verify(token: string, expectedType: TokenPayload['type']): Promise<TokenPayload> {
    const secret =
      expectedType === 'access' ? this.config.accessSecret : this.config.refreshSecret;

    let decoded: unknown;
    try {
      decoded = await this.jwt.verifyAsync(token, { secret });
    } catch {
      // Assinatura inválida, token expirado ou malformado — todos viram o mesmo erro.
      // Detalhar qual foi ajudaria um atacante a calibrar tentativas.
      throw new InvalidTokenError();
    }

    if (!isTokenPayload(decoded)) {
      throw new InvalidTokenError('Payload do token em formato inesperado.');
    }

    // Redundante quando os segredos diferem, mas mantido de propósito: se algum dia os
    // segredos forem unificados por engano de configuração, esta checagem é a única
    // barreira entre um refresh token e a rota de acesso.
    if (decoded.type !== expectedType) {
      throw new InvalidTokenError(
        `Esperado token do tipo ${expectedType}, recebido ${decoded.type}.`,
      );
    }

    return decoded;
  }
}

function isTokenPayload(value: unknown): value is TokenPayload {
  if (typeof value !== 'object' || value === null) return false;

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.sub === 'string' &&
    (candidate.type === 'access' || candidate.type === 'refresh')
  );
}
