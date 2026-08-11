import { InvalidUserNameError, MissingPasswordHashError } from '../errors/domain-errors';
import type { Email } from '../value-objects/email';

const MAX_NAME_LENGTH = 200;

export interface UserProps {
  readonly id: string;
  readonly name: string;
  readonly email: Email;
  /** Hash da senha. O domínio nunca vê a senha em claro. */
  readonly passwordHash: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Usuário do sistema.
 *
 * **O domínio não conhece a senha, só o hash.** O algoritmo de hashing (argon2 ou
 * bcrypt, ADR-006) é decisão de infraestrutura e entra na Etapa 4; aqui a entidade
 * apenas exige que exista um hash. Isso mantém o domínio testável sem dependência de
 * biblioteca de criptografia.
 */
export class User {
  private constructor(private readonly props: UserProps) {}

  static create(props: UserProps): User {
    const name = props.name.trim();

    if (name.length === 0) {
      throw new InvalidUserNameError('não pode ser vazio.');
    }
    if (name.length > MAX_NAME_LENGTH) {
      throw new InvalidUserNameError(`excede ${MAX_NAME_LENGTH} caracteres.`);
    }
    if (props.passwordHash.trim().length === 0) {
      throw new MissingPasswordHashError();
    }

    return new User({ ...props, name });
  }

  /** Reconstrói a partir do banco, sem revalidar. Ver a nota em `Simulation.restore`. */
  static restore(props: UserProps): User {
    return new User(props);
  }

  get id(): string {
    return this.props.id;
  }

  get name(): string {
    return this.props.name;
  }

  get email(): Email {
    return this.props.email;
  }

  /**
   * Hash da senha, para uso exclusivo do serviço de autenticação.
   *
   * Só é acessível por este getter explícito, e é deliberadamente omitido do
   * `toJSON` — serializar a entidade por engano numa resposta HTTP não pode vazar
   * credencial.
   */
  get passwordHash(): string {
    return this.props.passwordHash;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  /** Representação segura: nunca inclui `passwordHash`. */
  toJSON(): Omit<UserProps, 'passwordHash' | 'email'> & { email: string } {
    return {
      id: this.props.id,
      name: this.props.name,
      email: this.props.email.value,
      createdAt: this.props.createdAt,
      updatedAt: this.props.updatedAt,
    };
  }
}
