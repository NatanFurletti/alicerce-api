import { User } from '../../domain/entities/user';
import { EmailAlreadyInUseError } from '../../domain/errors/domain-errors';
import type { UserRepository } from '../../domain/repositories/user-repository';
import { Email } from '../../domain/value-objects/email';
import type { Clock } from '../ports/clock';
import type { PasswordHasher } from '../ports/password-hasher';
import type { IdGenerator } from '../ports/id-generator';

export interface RegisterUserInput {
  readonly name: string;
  readonly email: string;
  readonly password: string;
}

export interface RegisterUserOutput {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly createdAt: Date;
}

/**
 * Cadastra um usuário.
 *
 * A senha em claro **entra e morre aqui**: é passada ao `PasswordHasher` e só o hash
 * segue para a entidade. O domínio nunca vê a senha, e por isso nunca pode vazá-la
 * num log ou numa serialização acidental.
 *
 * O algoritmo de hash é uma porta (ADR-006) — a escolha entre argon2 e bcrypt é da
 * Etapa 4 e não muda uma linha deste caso de uso.
 */
export class RegisterUserUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: RegisterUserInput): Promise<RegisterUserOutput> {
    const email = Email.create(input.email);

    // Checagem amigável. Não substitui a constraint UNIQUE do banco: entre esta
    // consulta e o INSERT há uma janela de corrida, e a garantia real é do Postgres.
    // A Etapa 3 trata a violação de unicidade traduzindo-a para este mesmo erro.
    if ((await this.users.findByEmail(email)) !== null) {
      throw new EmailAlreadyInUseError(email.value);
    }

    const now = this.clock.now();
    const user = User.create({
      id: this.ids.generate(),
      name: input.name,
      email,
      passwordHash: await this.hasher.hash(input.password),
      createdAt: now,
      updatedAt: now,
    });

    await this.users.create(user);

    return {
      id: user.id,
      name: user.name,
      email: user.email.value,
      createdAt: user.createdAt,
    };
  }
}
