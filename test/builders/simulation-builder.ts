import { Simulation, type SimulationProps } from '../../src/domain/entities/simulation';
import { Money } from '../../src/domain/value-objects/money.vo';

/**
 * Simulação padrão para testes: R$ 500.000 com R$ 100.000 de entrada (LTV 80%),
 * 360 meses a 9,75% a.a. Sobrescreva só o que o teste realmente exercita — assim
 * cada teste declara sua intenção em vez de repetir dez campos irrelevantes.
 */
export function makeSimulationProps(
  overrides: Partial<SimulationProps> = {},
): SimulationProps {
  return {
    id: 'sim-1',
    userId: 'user-1',
    propertyValue: Money.fromReais(500_000),
    downPayment: Money.fromReais(100_000),
    termMonths: 360,
    annualRate: 0.0975,
    rateConvention: 'EFFECTIVE',
    amortizationSystem: 'SAC',
    charges: { mipMonthlyRate: 0.00025, dfiMonthlyRate: 0.00005, adminFeeCents: 2500 },
    createdAt: new Date('2026-01-15T10:00:00Z'),
    ...overrides,
  };
}

export function makeSimulation(overrides: Partial<SimulationProps> = {}): Simulation {
  return Simulation.restore(makeSimulationProps(overrides));
}
