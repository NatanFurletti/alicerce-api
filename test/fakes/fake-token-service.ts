import type {
  TokenPair,
  TokenPayload,
  TokenService,
} from '../../src/application/ports/token-service';
import { InvalidTokenError } from '../../src/domain/errors/domain-errors';

/**
 * Serviço de tokens falso: codifica o payload em base64, sem assinatura.
 *
 * NUNCA use fora de teste — qualquer um forja um token destes. O objetivo é manter os
 * testes de caso de uso focados em orquestração, sem depender de segredo nem de
 * relógio real de expiração. A criptografia de verdade é exercitada nos testes do
 * `JwtTokenService`.
 */
export class FakeTokenService implements TokenService {
  private counter = 0;

  /** Tokens marcados aqui passam a ser rejeitados por `verify`. */
  readonly revoked = new Set<string>();

  issuePair(userId: string): Promise<TokenPair> {
    this.counter += 1;

    return Promise.resolve({
      accessToken: this.encode({ sub: userId, type: 'access' }, this.counter),
      refreshToken: this.encode({ sub: userId, type: 'refresh' }, this.counter),
    });
  }

  verify(token: string, expectedType: TokenPayload['type']): Promise<TokenPayload> {
    if (this.revoked.has(token)) {
      throw new InvalidTokenError();
    }

    const payload = this.decode(token);
    if (payload === null) {
      throw new InvalidTokenError();
    }
    if (payload.type !== expectedType) {
      throw new InvalidTokenError(
        `Esperado token do tipo ${expectedType}, recebido ${payload.type}.`,
      );
    }

    return Promise.resolve(payload);
  }

  decode(token: string): TokenPayload | null {
    try {
      const parsed: unknown = JSON.parse(
        Buffer.from(token, 'base64url').toString('utf8'),
      );

      return isPayload(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  private encode(payload: TokenPayload, nonce: number): string {
    // O nonce garante que dois pares emitidos em sequência sejam distintos, como
    // aconteceria com o `iat` de um JWT real.
    return Buffer.from(JSON.stringify({ ...payload, nonce })).toString('base64url');
  }
}

function isPayload(value: unknown): value is TokenPayload {
  if (typeof value !== 'object' || value === null) return false;

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.sub === 'string' &&
    (candidate.type === 'access' || candidate.type === 'refresh')
  );
}
