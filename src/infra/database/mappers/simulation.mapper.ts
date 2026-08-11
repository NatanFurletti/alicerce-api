import type { Simulation as PrismaSimulation } from '@prisma/client';

import { Simulation } from '../../../domain/entities/simulation';
import { Money } from '../../../domain/value-objects/money.vo';

/**
 * Converte `bigint` do Prisma para `number` de centavos.
 *
 * A conversão é segura porque `Money` só aceita inteiros dentro de
 * `Number.MAX_SAFE_INTEGER` — 2^53-1 centavos, ou ~90 trilhões de reais. Ainda assim
 * a checagem é explícita: um valor além disso indica corrupção de dados, e falhar
 * alto é melhor que devolver silenciosamente um número arredondado.
 */
function toCents(value: bigint): number {
  if (
    value > BigInt(Number.MAX_SAFE_INTEGER) ||
    value < BigInt(Number.MIN_SAFE_INTEGER)
  ) {
    throw new RangeError(
      `Valor monetário ${value} fora do intervalo seguro de inteiros do JavaScript.`,
    );
  }
  return Number(value);
}

/**
 * Tradução entre a linha do Postgres e a entidade de domínio.
 *
 * O mapper existe para que a entidade não conheça o formato do banco (ADR-001).
 * `Simulation` não sabe que `charges` está achatado em três colunas, e o Prisma não
 * sabe que `Money` existe.
 *
 * Usa `restore` e não `create`: reconstruir do banco não revalida elegibilidade, senão
 * mudar o LTV máximo tornaria simulações antigas irrecuperáveis.
 */
export const SimulationMapper = {
  toDomain(row: PrismaSimulation): Simulation {
    return Simulation.restore({
      id: row.id,
      userId: row.userId,
      propertyValue: Money.fromCents(toCents(row.propertyValue)),
      downPayment: Money.fromCents(toCents(row.downPayment)),
      termMonths: row.termMonths,
      annualRate: row.annualRate,
      rateConvention: row.rateConvention,
      amortizationSystem: row.amortizationSystem,
      // `null` do banco vira `undefined` no domínio: são a mesma ausência, mas a
      // entidade distingue "não informou renda" de "declarou renda zero".
      monthlyIncome:
        row.monthlyIncome === null
          ? undefined
          : Money.fromCents(toCents(row.monthlyIncome)),
      charges: {
        mipMonthlyRate: row.mipMonthlyRate,
        dfiMonthlyRate: row.dfiMonthlyRate,
        adminFeeCents: toCents(row.adminFeeCents),
      },
      createdAt: row.createdAt,
    });
  },

  toPersistence(simulation: Simulation): PrismaSimulation {
    return {
      id: simulation.id,
      userId: simulation.userId,
      propertyValue: BigInt(simulation.propertyValue.cents),
      downPayment: BigInt(simulation.downPayment.cents),
      monthlyIncome:
        simulation.monthlyIncome === undefined
          ? null
          : BigInt(simulation.monthlyIncome.cents),
      termMonths: simulation.termMonths,
      annualRate: simulation.annualRate,
      rateConvention: simulation.rateConvention,
      amortizationSystem: simulation.amortizationSystem,
      mipMonthlyRate: simulation.charges.mipMonthlyRate,
      dfiMonthlyRate: simulation.charges.dfiMonthlyRate,
      adminFeeCents: BigInt(simulation.charges.adminFeeCents),
      createdAt: simulation.createdAt,
    };
  },
};
