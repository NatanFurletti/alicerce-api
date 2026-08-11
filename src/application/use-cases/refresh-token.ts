import { InvalidTokenError } from '../../domain/errors/domain-errors';
import type { UserRepository } from '../../domain/repositories/user-repository';
import type { TokenPair, TokenService } from '../ports/token-service';

export interface RefreshTokenInput {
  readonly refreshToken: string;
}

/**
 * Troca um refresh token válido por um novo par de tokens.
 *
 * **Confere o tipo, não só a assinatura.** Um access token tem assinatura igualmente
 * válida; aceitá-lo aqui deixaria qualquer access token vazado virar sessão perpétua.
 *
 * **Reconsulta o usuário no banco** em vez de confiar apenas no `sub` do token. Um
 * token continua criptograficamente válido depois de a conta ser apagada — sem essa
 * checagem, um usuário excluído renovaria a sessão indefinidamente.
 *
 * **Limitação conhecida (ADR-006):** os refresh tokens são stateless, então não há
 * revogação. Um token roubado vale até expirar, e não existe rota de logout. O que
 * limita o dano é a vida curta do access token.
 */
export class RefreshTokenUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly tokens: TokenService,
  ) {}

  async execute(input: RefreshTokenInput): Promise<TokenPair> {
    const payload = await this.tokens.verify(input.refreshToken, 'refresh');

    if ((await this.users.findById(payload.sub)) === null) {
      throw new InvalidTokenError('Usuário do token não existe mais.');
    }

    return this.tokens.issuePair(payload.sub);
  }
}
