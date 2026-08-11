import { ExtraPaymentRecord } from '../../domain/entities/extra-payment-record';
import type { Simulation } from '../../domain/entities/simulation';
import { applyExtraPayments } from '../../domain/finance/extra-payment';
import type {
  ExtraPayment,
  ExtraPaymentStrategy,
  ExtraPaymentSummary,
} from '../../domain/finance/types';
import type { ExtraPaymentRepository } from '../../domain/repositories/extra-payment-repository';
import type { SimulationRepository } from '../../domain/repositories/simulation-repository';
import { Money } from '../../domain/value-objects/money.vo';
import type { Clock } from '../ports/clock';
import type { IdGenerator } from '../ports/id-generator';
import { findOwnedSimulation } from './find-owned-simulation';

export interface AddExtraPaymentInput {
  readonly simulationId: string;
  readonly userId: string;
  readonly monthNumber: number;
  readonly amountCents: number;
  readonly strategy: ExtraPaymentStrategy;
}

export interface AddExtraPaymentOutput {
  readonly id: string;
  readonly simulationId: string;
  readonly summary: ExtraPaymentSummary;
  /** Prazo resultante após todos os aportes registrados. */
  readonly newTermMonths: number;
}

/**
 * Registra um aporte extraordinário e devolve o impacto sobre o contrato.
 *
 * **A ordem é: validar calculando, depois persistir.** O recálculo roda com o aporte
 * novo incluído *antes* do `create`, então um aporte fora do prazo ou maior que o
 * saldo é rejeitado pelo núcleo financeiro sem sujar o banco. Persistir primeiro e
 * validar depois exigiria compensação — muito mais frágil.
 *
 * O recálculo considera **todos** os aportes da simulação, não só o novo: aportes
 * anteriores mudam o saldo, e portanto mudam se o próximo cabe.
 */
export class AddExtraPaymentUseCase {
  constructor(
    private readonly simulations: SimulationRepository,
    private readonly extraPayments: ExtraPaymentRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: AddExtraPaymentInput): Promise<AddExtraPaymentOutput> {
    const simulation = await findOwnedSimulation(
      this.simulations,
      input.simulationId,
      input.userId,
    );

    const existing = await this.extraPayments.listBySimulationId(input.simulationId);
    const incoming: ExtraPayment = {
      month: input.monthNumber,
      amount: input.amountCents,
      strategy: input.strategy,
    };

    // Lança se o aporte for inválido — antes de qualquer escrita.
    const result = recalculate(simulation, [...toDomain(existing), incoming]);

    const record = ExtraPaymentRecord.create({
      id: this.ids.generate(),
      simulationId: simulation.id,
      monthNumber: input.monthNumber,
      amount: Money.fromCents(input.amountCents),
      strategy: input.strategy,
      createdAt: this.clock.now(),
    });
    await this.extraPayments.create(record);

    return {
      id: record.id,
      simulationId: simulation.id,
      summary: result.summary,
      newTermMonths: result.schedule.length,
    };
  }
}

function toDomain(records: readonly ExtraPaymentRecord[]): ExtraPayment[] {
  return records.map((record) => ({
    month: record.monthNumber,
    amount: record.amount.cents,
    strategy: record.strategy,
  }));
}

/** Recalcula a tabela da simulação com o conjunto de aportes informado. */
export function recalculate(
  simulation: Simulation,
  payments: readonly ExtraPayment[],
): ReturnType<typeof applyExtraPayments> {
  return applyExtraPayments(
    {
      principal: simulation.financedAmount.cents,
      termMonths: simulation.termMonths,
      monthlyRate: simulation.monthlyRate,
      propertyValue: simulation.propertyValue.cents,
      charges: simulation.charges,
    },
    simulation.amortizationSystem,
    payments,
  );
}
