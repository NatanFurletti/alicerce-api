import { InMemorySimulationRepository } from '../../../test/fakes/in-memory-simulation-repository';
import {
  IncomeCommitmentExceededError,
  LtvExceededError,
  TermExceedsMaximumError,
} from '../../domain/errors/domain-errors';
import { DEFAULT_ELIGIBILITY_POLICY } from '../../domain/policies/eligibility-policy';
import { FixedClock } from '../ports/clock';
import { SequentialIdGenerator } from '../ports/id-generator';
import { CreateSimulationUseCase, type CreateSimulationInput } from './create-simulation';

const input: CreateSimulationInput = {
  userId: 'user-1',
  propertyValueCents: 50_000_000,
  downPaymentCents: 10_000_000,
  termMonths: 360,
  annualRate: 0.0975,
  rateConvention: 'EFFECTIVE',
  amortizationSystem: 'SAC',
  monthlyIncomeCents: 2_000_000,
  charges: { mipMonthlyRate: 0.00025, dfiMonthlyRate: 0.00005, adminFeeCents: 2500 },
};

function makeUseCase(): {
  useCase: CreateSimulationUseCase;
  repository: InMemorySimulationRepository;
} {
  const repository = new InMemorySimulationRepository();
  const useCase = new CreateSimulationUseCase(
    repository,
    new SequentialIdGenerator('sim'),
    new FixedClock(new Date('2026-02-01T12:00:00Z')),
    DEFAULT_ELIGIBILITY_POLICY,
  );
  return { useCase, repository };
}

describe('CreateSimulationUseCase', () => {
  it('cria e persiste a simulação', async () => {
    const { useCase, repository } = makeUseCase();

    const result = await useCase.execute(input);

    expect(repository.items).toHaveLength(1);
    expect(result.id).toBe('sim-1');
    expect(result.userId).toBe('user-1');
  });

  it('devolve o resumo já calculado, sem persistir a tabela (ADR-003)', async () => {
    const { useCase } = makeUseCase();

    const result = await useCase.execute(input);

    expect(result.financedAmountCents).toBe(40_000_000);
    expect(result.termMonths).toBe(360);
    expect(result.summary.totalAmortization).toBe(40_000_000);
    expect(result.summary.totalInterest).toBeGreaterThan(0);
    expect(result.firstInstallmentCents).toBeGreaterThan(0);
    expect(result.cet.monthlyRate).toBeGreaterThan(0);
    expect(result.cet.annualRate).toBeGreaterThan(input.annualRate);
  });

  it('usa o relógio injetado, não a hora do sistema', async () => {
    // Determinismo no teste, e a possibilidade de congelar o tempo em cenários de
    // borda. Chamar `new Date()` dentro do caso de uso tornaria isso impossível.
    const { useCase, repository } = makeUseCase();

    await useCase.execute(input);

    expect(repository.items[0]?.createdAt).toEqual(new Date('2026-02-01T12:00:00Z'));
  });

  it('gera ids distintos para simulações sucessivas', async () => {
    const { useCase } = makeUseCase();

    const first = await useCase.execute(input);
    const second = await useCase.execute(input);

    expect(first.id).not.toBe(second.id);
  });

  it('propaga violação de LTV como erro de domínio', async () => {
    const { useCase, repository } = makeUseCase();

    await expect(
      useCase.execute({ ...input, downPaymentCents: 5_000_000 }),
    ).rejects.toThrow(LtvExceededError);
    expect(repository.items).toHaveLength(0);
  });

  it('propaga violação de comprometimento de renda', async () => {
    const { useCase } = makeUseCase();

    await expect(
      useCase.execute({ ...input, monthlyIncomeCents: 100_000 }),
    ).rejects.toThrow(IncomeCommitmentExceededError);
  });

  it('propaga violação de prazo máximo', async () => {
    const { useCase } = makeUseCase();

    await expect(useCase.execute({ ...input, termMonths: 421 })).rejects.toThrow(
      TermExceedsMaximumError,
    );
  });

  it('nada é persistido quando a validação falha', async () => {
    const { useCase, repository } = makeUseCase();

    await expect(useCase.execute({ ...input, termMonths: 421 })).rejects.toThrow();

    expect(repository.items).toHaveLength(0);
  });

  it('aceita simulação sem renda declarada', async () => {
    const { useCase } = makeUseCase();

    const result = await useCase.execute({ ...input, monthlyIncomeCents: undefined });

    expect(result.id).toBe('sim-1');
  });

  it('respeita uma política de elegibilidade customizada', async () => {
    const repository = new InMemorySimulationRepository();
    const useCase = new CreateSimulationUseCase(
      repository,
      new SequentialIdGenerator('sim'),
      new FixedClock(new Date('2026-02-01T12:00:00Z')),
      { maxLtvPercent: 90, maxIncomeCommitmentPercent: 50, maxTermMonths: 480 },
    );

    const result = await useCase.execute({ ...input, downPaymentCents: 5_000_000 });

    expect(result.financedAmountCents).toBe(45_000_000);
  });
});
