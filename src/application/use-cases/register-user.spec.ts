import { FakePasswordHasher } from '../../../test/fakes/fake-password-hasher';
import { InMemoryUserRepository } from '../../../test/fakes/in-memory-user-repository';
import {
  EmailAlreadyInUseError,
  InvalidEmailError,
  InvalidUserNameError,
} from '../../domain/errors/domain-errors';
import { FixedClock } from '../ports/clock';
import { SequentialIdGenerator } from '../ports/id-generator';
import { RegisterUserUseCase } from './register-user';

function makeUseCase(): {
  useCase: RegisterUserUseCase;
  users: InMemoryUserRepository;
} {
  const users = new InMemoryUserRepository();
  return {
    useCase: new RegisterUserUseCase(
      users,
      new FakePasswordHasher(),
      new SequentialIdGenerator('user'),
      new FixedClock(new Date('2026-02-01T00:00:00Z')),
    ),
    users,
  };
}

const input = {
  name: 'Natan Furletti',
  email: 'natan@example.com',
  password: 'senha-forte-123',
};

describe('RegisterUserUseCase', () => {
  it('cadastra e persiste o usuário', async () => {
    const { useCase, users } = makeUseCase();

    const result = await useCase.execute(input);

    expect(users.items).toHaveLength(1);
    expect(result.id).toBe('user-1');
    expect(result.email).toBe('natan@example.com');
  });

  it('nunca devolve nem armazena a senha em claro', async () => {
    const { useCase, users } = makeUseCase();

    const result = await useCase.execute(input);

    expect(JSON.stringify(result)).not.toContain('senha-forte-123');
    expect(users.items[0]?.passwordHash).not.toBe('senha-forte-123');
    expect(users.items[0]?.passwordHash).toBe('hashed:senha-forte-123');
  });

  it('rejeita e-mail já cadastrado', async () => {
    const { useCase } = makeUseCase();

    await useCase.execute(input);

    await expect(useCase.execute(input)).rejects.toThrow(EmailAlreadyInUseError);
  });

  it('detecta duplicidade mesmo com caixa e espaços diferentes', async () => {
    // A normalização do value object é o que faz esta checagem funcionar — sem ela,
    // "Natan@Example.COM" passaria como e-mail novo.
    const { useCase, users } = makeUseCase();

    await useCase.execute(input);

    await expect(
      useCase.execute({ ...input, email: '  Natan@Example.COM  ' }),
    ).rejects.toThrow(EmailAlreadyInUseError);
    expect(users.items).toHaveLength(1);
  });

  it('rejeita e-mail malformado antes de tocar o repositório', async () => {
    const { useCase, users } = makeUseCase();

    await expect(useCase.execute({ ...input, email: 'sem-arroba' })).rejects.toThrow(
      InvalidEmailError,
    );
    expect(users.items).toHaveLength(0);
  });

  it('rejeita nome vazio', async () => {
    const { useCase } = makeUseCase();

    await expect(useCase.execute({ ...input, name: '   ' })).rejects.toThrow(
      InvalidUserNameError,
    );
  });

  it('usa o relógio injetado para as datas', async () => {
    const { useCase, users } = makeUseCase();

    await useCase.execute(input);

    expect(users.items[0]?.createdAt).toEqual(new Date('2026-02-01T00:00:00Z'));
    expect(users.items[0]?.updatedAt).toEqual(new Date('2026-02-01T00:00:00Z'));
  });
});
