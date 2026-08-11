import { FakePasswordHasher } from '../../../test/fakes/fake-password-hasher';
import { FakeTokenService } from '../../../test/fakes/fake-token-service';
import { InMemoryUserRepository } from '../../../test/fakes/in-memory-user-repository';
import { User } from '../../domain/entities/user';
import { InvalidCredentialsError } from '../../domain/errors/domain-errors';
import { Email } from '../../domain/value-objects/email';
import { FixedClock } from '../ports/clock';
import { AuthenticateUserUseCase } from './authenticate-user';

function makeUseCase(): {
  useCase: AuthenticateUserUseCase;
  users: InMemoryUserRepository;
  tokens: FakeTokenService;
} {
  const users = new InMemoryUserRepository();
  const tokens = new FakeTokenService();

  return {
    useCase: new AuthenticateUserUseCase(users, new FakePasswordHasher(), tokens),
    users,
    tokens,
  };
}

async function seedUser(users: InMemoryUserRepository): Promise<void> {
  await users.create(
    User.create({
      id: 'user-1',
      name: 'Natan',
      email: Email.create('natan@example.com'),
      passwordHash: 'hashed:senha-correta',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    }),
  );
}

describe('AuthenticateUserUseCase', () => {
  it('autentica com credenciais válidas e devolve os dois tokens', async () => {
    const { useCase, users } = makeUseCase();
    await seedUser(users);

    const result = await useCase.execute({
      email: 'natan@example.com',
      password: 'senha-correta',
    });

    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();
    expect(result.accessToken).not.toBe(result.refreshToken);
    expect(result.user.id).toBe('user-1');
  });

  it('normaliza o e-mail antes de buscar', async () => {
    const { useCase, users } = makeUseCase();
    await seedUser(users);

    const result = await useCase.execute({
      email: '  NATAN@Example.COM  ',
      password: 'senha-correta',
    });

    expect(result.user.id).toBe('user-1');
  });

  it('rejeita senha incorreta', async () => {
    const { useCase, users } = makeUseCase();
    await seedUser(users);

    await expect(
      useCase.execute({ email: 'natan@example.com', password: 'senha-errada' }),
    ).rejects.toThrow(InvalidCredentialsError);
  });

  it('rejeita e-mail inexistente', async () => {
    const { useCase } = makeUseCase();

    await expect(
      useCase.execute({ email: 'ninguem@example.com', password: 'qualquer' }),
    ).rejects.toThrow(InvalidCredentialsError);
  });

  it('e-mail inexistente e senha errada produzem o MESMO erro', async () => {
    // Distinguir os dois permitiria enumerar quais e-mails estão cadastrados.
    const { useCase, users } = makeUseCase();
    await seedUser(users);

    const capture = async (email: string): Promise<Error> =>
      useCase
        .execute({ email, password: 'x' })
        .then(() => new Error('deveria ter falhado'))
        .catch((e: unknown) => e as Error);

    const semUsuario = await capture('ninguem@example.com');
    const senhaErrada = await capture('natan@example.com');

    expect(semUsuario).toBeInstanceOf(InvalidCredentialsError);
    expect(semUsuario.message).toBe(senhaErrada.message);
    expect(semUsuario.constructor).toBe(senhaErrada.constructor);
  });

  it('e-mail malformado também vira credencial inválida, não erro de validação', async () => {
    // Um `InvalidEmailError` aqui vazaria que o formato foi rejeitado antes da busca,
    // e daria ao atacante um sinal diferente para sondar.
    const { useCase } = makeUseCase();

    await expect(
      useCase.execute({ email: 'nao-e-email', password: 'x' }),
    ).rejects.toThrow(InvalidCredentialsError);
  });

  it('nunca devolve o hash da senha', async () => {
    const { useCase, users } = makeUseCase();
    await seedUser(users);

    const result = await useCase.execute({
      email: 'natan@example.com',
      password: 'senha-correta',
    });

    expect(JSON.stringify(result)).not.toContain('hashed:');
  });

  it('o access token carrega o id do usuário', async () => {
    const { useCase, users, tokens } = makeUseCase();
    await seedUser(users);

    const { accessToken } = await useCase.execute({
      email: 'natan@example.com',
      password: 'senha-correta',
    });

    expect(tokens.decode(accessToken)).toMatchObject({ sub: 'user-1', type: 'access' });
  });

  it('o refresh token é de tipo diferente do access', async () => {
    // Sem essa distinção, um refresh token seria aceito como credencial de acesso —
    // e ele vive muito mais tempo.
    const { useCase, users, tokens } = makeUseCase();
    await seedUser(users);

    const { refreshToken } = await useCase.execute({
      email: 'natan@example.com',
      password: 'senha-correta',
    });

    expect(tokens.decode(refreshToken)).toMatchObject({ type: 'refresh' });
  });

  describe('resistência a enumeração por tempo', () => {
    it('verifica a senha mesmo quando o usuário não existe', async () => {
      // Sem isso, "usuário inexistente" responderia instantaneamente e "senha errada"
      // levaria os ~300ms do bcrypt. A diferença é mensurável e revela quais e-mails
      // estão cadastrados.
      const users = new InMemoryUserRepository();
      const hasher = new FakePasswordHasher();
      const compareSpy = jest.spyOn(hasher, 'compare');
      const useCase = new AuthenticateUserUseCase(users, hasher, new FakeTokenService());

      await expect(
        useCase.execute({ email: 'ninguem@example.com', password: 'x' }),
      ).rejects.toThrow(InvalidCredentialsError);

      expect(compareSpy).toHaveBeenCalled();
    });
  });
});

describe('FixedClock (sanidade do fake usado nos testes de token)', () => {
  it('devolve sempre o mesmo instante', () => {
    const clock = new FixedClock(new Date('2026-02-01T00:00:00Z'));
    expect(clock.now()).toEqual(clock.now());
  });
});
