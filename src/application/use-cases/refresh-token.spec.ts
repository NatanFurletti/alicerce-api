import { FakeTokenService } from '../../../test/fakes/fake-token-service';
import { InMemoryUserRepository } from '../../../test/fakes/in-memory-user-repository';
import { User } from '../../domain/entities/user';
import { InvalidTokenError } from '../../domain/errors/domain-errors';
import { Email } from '../../domain/value-objects/email';
import { GetProfileUseCase } from './get-profile';
import { RefreshTokenUseCase } from './refresh-token';

function makeUser(id = 'user-1'): User {
  return User.create({
    id,
    name: 'Natan',
    email: Email.create(`${id}@example.com`),
    passwordHash: 'hashed:x',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  });
}

describe('RefreshTokenUseCase', () => {
  async function setup(): Promise<{
    useCase: RefreshTokenUseCase;
    users: InMemoryUserRepository;
    tokens: FakeTokenService;
    refreshToken: string;
    accessToken: string;
  }> {
    const users = new InMemoryUserRepository();
    const tokens = new FakeTokenService();
    await users.create(makeUser());
    const pair = await tokens.issuePair('user-1');

    return {
      useCase: new RefreshTokenUseCase(users, tokens),
      users,
      tokens,
      ...pair,
    };
  }

  it('troca um refresh token válido por um novo par', async () => {
    const { useCase, refreshToken } = await setup();

    const result = await useCase.execute({ refreshToken });

    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();
  });

  it('emite tokens novos, diferentes dos anteriores', async () => {
    const { useCase, refreshToken, accessToken } = await setup();

    const result = await useCase.execute({ refreshToken });

    expect(result.accessToken).not.toBe(accessToken);
    expect(result.refreshToken).not.toBe(refreshToken);
  });

  it('REJEITA um access token no lugar do refresh', async () => {
    // A assinatura é igualmente válida. Sem a checagem de tipo, qualquer access token
    // vazado viraria sessão perpétua.
    const { useCase, accessToken } = await setup();

    await expect(useCase.execute({ refreshToken: accessToken })).rejects.toThrow(
      InvalidTokenError,
    );
  });

  it('rejeita token malformado', async () => {
    const { useCase } = await setup();

    for (const refreshToken of ['', 'lixo', 'a.b.c']) {
      await expect(useCase.execute({ refreshToken })).rejects.toThrow(InvalidTokenError);
    }
  });

  it('rejeita token de usuário que não existe mais', async () => {
    // O token continua criptograficamente válido depois de a conta ser apagada.
    const tokens = new FakeTokenService();
    const { refreshToken } = await tokens.issuePair('usuario-apagado');
    const useCase = new RefreshTokenUseCase(new InMemoryUserRepository(), tokens);

    await expect(useCase.execute({ refreshToken })).rejects.toThrow(InvalidTokenError);
  });
});

describe('GetProfileUseCase', () => {
  it('devolve os dados do usuário autenticado', async () => {
    const users = new InMemoryUserRepository();
    await users.create(makeUser());

    const result = await new GetProfileUseCase(users).execute('user-1');

    expect(result).toEqual({
      id: 'user-1',
      name: 'Natan',
      email: 'user-1@example.com',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });
  });

  it('nunca inclui o hash da senha', async () => {
    const users = new InMemoryUserRepository();
    await users.create(makeUser());

    const result = await new GetProfileUseCase(users).execute('user-1');

    expect(JSON.stringify(result)).not.toContain('hashed:');
  });

  it('lança se o usuário do token não existe mais', async () => {
    await expect(
      new GetProfileUseCase(new InMemoryUserRepository()).execute('fantasma'),
    ).rejects.toThrow(InvalidTokenError);
  });
});
