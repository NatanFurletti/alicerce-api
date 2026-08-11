import type { User } from '../../domain/entities/user';
import { InvalidCredentialsError } from '../../domain/errors/domain-errors';
import type { UserRepository } from '../../domain/repositories/user-repository';
import { Email } from '../../domain/value-objects/email';
import type { PasswordHasher } from '../ports/password-hasher';
import type { TokenService } from '../ports/token-service';

/**
 * Hash descartável com formato válido de bcrypt.
 *
 * Usado quando o e-mail não existe, para que a verificação de senha rode mesmo assim.
 * Ver a nota sobre enumeração por tempo em `execute`.
 */
const DUMMY_HASH = '$2b$12$C6UzMDM.H6dfI/f/IKcEe.b8Vg8vBpVeQvJqEQ0hqPeNyLfXNGvXK';

export interface AuthenticateUserInput {
  readonly email: string;
  readonly password: string;
}

export interface AuthenticateUserOutput {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly user: { readonly id: string; readonly name: string; readonly email: string };
}

/**
 * Autentica por e-mail e senha, devolvendo um par de tokens.
 *
 * **Todas as falhas produzem o mesmo `InvalidCredentialsError`** — e-mail inexistente,
 * e-mail malformado e senha errada são indistinguíveis para quem chama. Distinguir
 * permitiria enumerar quais e-mails estão cadastrados, que é o primeiro passo de um
 * ataque de credential stuffing.
 */
export class AuthenticateUserUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenService,
  ) {}

  async execute(input: AuthenticateUserInput): Promise<AuthenticateUserOutput> {
    const user = await this.findUser(input.email);

    // Verifica a senha MESMO quando o usuário não existe, contra um hash descartável.
    //
    // Sem isso, "e-mail inexistente" responderia em microssegundos e "senha errada"
    // levaria os ~300ms do bcrypt. Essa diferença é facilmente mensurável e transforma
    // o endpoint num oráculo de quais e-mails têm conta — mesmo com a mensagem de erro
    // idêntica. Igualar as mensagens sem igualar o tempo resolve só metade do problema.
    const matches = await this.hasher.compare(
      input.password,
      user?.passwordHash ?? DUMMY_HASH,
    );

    if (user === null || !matches) {
      throw new InvalidCredentialsError();
    }

    const { accessToken, refreshToken } = await this.tokens.issuePair(user.id);

    return {
      accessToken,
      refreshToken,
      user: { id: user.id, name: user.name, email: user.email.value },
    };
  }

  /** Devolve `null` também para e-mail malformado — o formato não pode ser um sinal. */
  private async findUser(rawEmail: string): Promise<User | null> {
    try {
      return await this.users.findByEmail(Email.create(rawEmail));
    } catch {
      return null;
    }
  }
}
