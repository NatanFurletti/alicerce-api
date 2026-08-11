import 'dotenv/config';

import { RegisterUserUseCase } from '../../src/application/use-cases/register-user';
import { FixedClock } from '../../src/application/ports/clock';
import { UuidGenerator } from '../../src/application/ports/id-generator';
import { User } from '../../src/domain/entities/user';
import { EmailAlreadyInUseError } from '../../src/domain/errors/domain-errors';
import { Email } from '../../src/domain/value-objects/email';
import { PrismaUserRepository } from '../../src/infra/database/repositories/prisma-user.repository';
import { FakePasswordHasher } from '../fakes/fake-password-hasher';
import { makePrismaService, truncateAll } from '../helpers/database';

const prisma = makePrismaService();
const repository = new PrismaUserRepository(prisma);

function makeUser(email: string, id = new UuidGenerator().generate()): User {
  return User.create({
    id,
    name: 'Natan Furletti',
    email: Email.create(email),
    passwordHash: 'hash-de-teste',
    createdAt: new Date('2026-02-01T00:00:00Z'),
    updatedAt: new Date('2026-02-01T00:00:00Z'),
  });
}

beforeEach(async () => {
  await truncateAll(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('PrismaUserRepository', () => {
  it('persiste e recupera por id', async () => {
    const user = makeUser('natan@example.com');
    await repository.create(user);

    const found = await repository.findById(user.id);

    expect(found?.email.value).toBe('natan@example.com');
    expect(found?.name).toBe('Natan Furletti');
    expect(found?.passwordHash).toBe('hash-de-teste');
  });

  it('busca por e-mail', async () => {
    await repository.create(makeUser('natan@example.com'));

    const found = await repository.findByEmail(Email.create('natan@example.com'));

    expect(found).not.toBeNull();
  });

  it('a busca por e-mail é insensível à caixa, graças à normalização do value object', async () => {
    await repository.create(makeUser('natan@example.com'));

    const found = await repository.findByEmail(Email.create('  NATAN@Example.COM  '));

    expect(found).not.toBeNull();
  });

  it('devolve null quando não encontra', async () => {
    expect(await repository.findById(new UuidGenerator().generate())).toBeNull();
    expect(await repository.findByEmail(Email.create('ninguem@example.com'))).toBeNull();
  });

  describe('unicidade de e-mail', () => {
    it('traduz a violação de UNIQUE para erro de domínio', async () => {
      await repository.create(makeUser('natan@example.com'));

      await expect(repository.create(makeUser('natan@example.com'))).rejects.toThrow(
        EmailAlreadyInUseError,
      );
    });

    it('a mensagem não vaza o nome interno da constraint', async () => {
      await repository.create(makeUser('natan@example.com'));

      const error = await repository
        .create(makeUser('natan@example.com'))
        .then(() => null)
        .catch((e: unknown) => e as Error);

      expect(error).toBeInstanceOf(EmailAlreadyInUseError);
      expect(error?.message).not.toContain('User_email_key');
      expect(error?.message).toContain('natan@example.com');
    });

    it('CORRIDA: duas requisições concorrentes produzem apenas UM usuário', async () => {
      // Este é o teste que fecha a janela TOCTOU analisada na Etapa 2. O hasher lento
      // reproduz o argon2 real e alarga a janela entre o findByEmail e o INSERT.
      class SlowHasher extends FakePasswordHasher {
        override async hash(plain: string): Promise<string> {
          await new Promise((resolve) => setTimeout(resolve, 150));
          return `hashed:${plain}`;
        }
      }

      const useCase = new RegisterUserUseCase(
        repository,
        new SlowHasher(),
        new UuidGenerator(),
        new FixedClock(new Date('2026-02-01T00:00:00Z')),
      );
      const input = { name: 'Natan', email: 'corrida@example.com', password: 'x' };

      const results = await Promise.allSettled([
        useCase.execute(input),
        useCase.execute(input),
      ]);

      // Uma passa, a outra é barrada pela constraint — não pela checagem prévia.
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const rejected = results.find((r) => r.status === 'rejected');
      expect((rejected as PromiseRejectedResult).reason).toBeInstanceOf(
        EmailAlreadyInUseError,
      );

      expect(await prisma.user.count()).toBe(1);
    });
  });

  it('o hash da senha nunca aparece na serialização da entidade', async () => {
    const user = makeUser('natan@example.com');
    await repository.create(user);

    const found = await repository.findById(user.id);

    expect(JSON.stringify(found)).not.toContain('hash-de-teste');
  });
});
