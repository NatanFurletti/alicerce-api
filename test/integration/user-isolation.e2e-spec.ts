import 'dotenv/config';

import { JwtService } from '@nestjs/jwt';

import { AuthenticateUserUseCase } from '../../src/application/use-cases/authenticate-user';
import { CreateSimulationUseCase } from '../../src/application/use-cases/create-simulation';
import { DeleteSimulationUseCase } from '../../src/application/use-cases/delete-simulation';
import { GetScheduleUseCase } from '../../src/application/use-cases/get-schedule';
import { GetSimulationUseCase } from '../../src/application/use-cases/get-simulation';
import { ListSimulationsUseCase } from '../../src/application/use-cases/list-simulations';
import { RegisterUserUseCase } from '../../src/application/use-cases/register-user';
import { FixedClock } from '../../src/application/ports/clock';
import { UuidGenerator } from '../../src/application/ports/id-generator';
import { SimulationNotFoundError } from '../../src/domain/errors/domain-errors';
import { DEFAULT_ELIGIBILITY_POLICY } from '../../src/domain/policies/eligibility-policy';
import { BcryptPasswordHasher } from '../../src/infra/auth/bcrypt-password-hasher';
import { JwtTokenService } from '../../src/infra/auth/jwt-token.service';
import { PrismaSimulationRepository } from '../../src/infra/database/repositories/prisma-simulation.repository';
import { PrismaUserRepository } from '../../src/infra/database/repositories/prisma-user.repository';
import { makePrismaService, truncateAll } from '../helpers/database';

/**
 * A entrega exigida pela Etapa 4: **prova de que o usuário A não acessa dado de B**.
 *
 * Diferente do teste de escopo da Etapa 2, que usava fakes e ids arbitrários, aqui a
 * cadeia inteira é real: cadastro com bcrypt, login emitindo JWT, verificação de
 * token e Postgres. O `userId` usado nas consultas vem do `sub` de um token
 * efetivamente assinado.
 */
const prisma = makePrismaService();
const users = new PrismaUserRepository(prisma);
const simulations = new PrismaSimulationRepository(prisma);
const hasher = new BcryptPasswordHasher(4);
const tokens = new JwtTokenService(new JwtService(), {
  accessSecret: 'segredo-de-access-com-tamanho-suficiente',
  accessTtl: '15m',
  refreshSecret: 'segredo-de-refresh-DIFERENTE-e-longo-tambem',
  refreshTtl: '7d',
});

const clock = new FixedClock(new Date('2026-02-01T00:00:00Z'));
const ids = new UuidGenerator();

const register = new RegisterUserUseCase(users, hasher, ids, clock);
const authenticate = new AuthenticateUserUseCase(users, hasher, tokens);
const createSimulation = new CreateSimulationUseCase(
  simulations,
  ids,
  clock,
  DEFAULT_ELIGIBILITY_POLICY,
);

const simulationInput = {
  propertyValueCents: 50_000_000,
  downPaymentCents: 10_000_000,
  termMonths: 360,
  annualRate: 0.0975,
  rateConvention: 'EFFECTIVE' as const,
  amortizationSystem: 'SAC' as const,
  charges: { mipMonthlyRate: 0.00025, dfiMonthlyRate: 0.00005, adminFeeCents: 2500 },
};

/** Cadastra, faz login e devolve o id extraído do token — como o guard faria. */
async function signUpAndLogin(email: string): Promise<{ userId: string }> {
  await register.execute({ name: 'Usuário', email, password: 'senha-valida-123' });

  const { accessToken } = await authenticate.execute({
    email,
    password: 'senha-valida-123',
  });

  const payload = await tokens.verify(accessToken, 'access');
  return { userId: payload.sub };
}

beforeEach(async () => {
  await truncateAll(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('isolamento entre usuários (cadastro -> login -> acesso a dados)', () => {
  it('o fluxo completo funciona para o dono', async () => {
    const { userId } = await signUpAndLogin('dono@example.com');

    const created = await createSimulation.execute({ ...simulationInput, userId });
    const found = await new GetSimulationUseCase(simulations).execute({
      simulationId: created.id,
      userId,
    });

    expect(found.id).toBe(created.id);
    expect(found.summary.totalAmortization).toBe(40_000_000);
  });

  describe('usuário B não alcança dado de A', () => {
    let simulacaoDeA: string;
    let idDeB: string;

    beforeEach(async () => {
      const a = await signUpAndLogin('a@example.com');
      const b = await signUpAndLogin('b@example.com');
      idDeB = b.userId;

      simulacaoDeA = (
        await createSimulation.execute({ ...simulationInput, userId: a.userId })
      ).id;
    });

    it('não lê o resumo', async () => {
      await expect(
        new GetSimulationUseCase(simulations).execute({
          simulationId: simulacaoDeA,
          userId: idDeB,
        }),
      ).rejects.toThrow(SimulationNotFoundError);
    });

    it('não lê a tabela de amortização', async () => {
      await expect(
        new GetScheduleUseCase(simulations).execute({
          simulationId: simulacaoDeA,
          userId: idDeB,
        }),
      ).rejects.toThrow(SimulationNotFoundError);
    });

    it('não apaga — e a simulação continua existindo depois da tentativa', async () => {
      await expect(
        new DeleteSimulationUseCase(simulations).execute({
          simulationId: simulacaoDeA,
          userId: idDeB,
        }),
      ).rejects.toThrow(SimulationNotFoundError);

      expect(await prisma.simulation.count()).toBe(1);
    });

    it('não vê a simulação alheia na própria listagem', async () => {
      const page = await new ListSimulationsUseCase(simulations).execute({
        userId: idDeB,
      });

      expect(page.total).toBe(0);
      expect(page.items).toHaveLength(0);
    });
  });

  it('um token válido de B não vira acesso ao dado de A', async () => {
    // O ataque direto: B tem credencial legítima e usa o id da simulação de A.
    const a = await signUpAndLogin('a@example.com');
    const simulacaoDeA = (
      await createSimulation.execute({ ...simulationInput, userId: a.userId })
    ).id;

    await register.execute({
      name: 'B',
      email: 'b@example.com',
      password: 'senha-valida-123',
    });
    const login = await authenticate.execute({
      email: 'b@example.com',
      password: 'senha-valida-123',
    });
    const payloadDeB = await tokens.verify(login.accessToken, 'access');

    await expect(
      new GetSimulationUseCase(simulations).execute({
        simulationId: simulacaoDeA,
        userId: payloadDeB.sub,
      }),
    ).rejects.toThrow(SimulationNotFoundError);
  });

  it('o token de A deixa de dar acesso depois de a conta ser apagada', async () => {
    const a = await signUpAndLogin('a@example.com');
    await createSimulation.execute({ ...simulationInput, userId: a.userId });

    // Cascade apaga as simulações junto com o usuário.
    await prisma.user.delete({ where: { id: a.userId } });

    const page = await new ListSimulationsUseCase(simulations).execute({
      userId: a.userId,
    });
    expect(page.total).toBe(0);
  });

  it('senha errada não emite token', async () => {
    await register.execute({
      name: 'A',
      email: 'a@example.com',
      password: 'senha-valida-123',
    });

    await expect(
      authenticate.execute({ email: 'a@example.com', password: 'senha-errada' }),
    ).rejects.toThrow();
  });

  it('a senha é gravada com hash bcrypt, nunca em claro', async () => {
    await register.execute({
      name: 'A',
      email: 'a@example.com',
      password: 'senha-valida-123',
    });

    const row = await prisma.user.findUnique({ where: { email: 'a@example.com' } });

    expect(row?.passwordHash).not.toContain('senha-valida-123');
    expect(row?.passwordHash).toMatch(/^\$2[aby]\$/);
  });
});
