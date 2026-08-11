import { Simulation } from '../../domain/entities/simulation';
import type { CetResult } from '../../domain/finance/cet';
import type {
  AmortizationSystem,
  Charges,
  RateConvention,
  ScheduleTotals,
} from '../../domain/finance/types';
import type { EligibilityPolicy } from '../../domain/policies/eligibility-policy';
import type { SimulationRepository } from '../../domain/repositories/simulation-repository';
import { Money } from '../../domain/value-objects/money.vo';
import type { Clock } from '../ports/clock';
import type { IdGenerator } from '../ports/id-generator';

/**
 * DTO de entrada.
 *
 * Valores monetários chegam como **centavos inteiros**, e não como `Money`: este é o
 * contrato com a camada HTTP, que só trafega tipos primitivos. Converter para value
 * object é responsabilidade do caso de uso — é aqui que o dado bruto vira domínio.
 */
export interface CreateSimulationInput {
  readonly userId: string;
  readonly propertyValueCents: number;
  readonly downPaymentCents: number;
  readonly termMonths: number;
  readonly annualRate: number;
  readonly rateConvention: RateConvention;
  readonly amortizationSystem: AmortizationSystem;
  readonly monthlyIncomeCents?: number;
  readonly charges: Charges;
}

/**
 * DTO de saída.
 *
 * Devolve o resumo, e **não a tabela de 420 linhas**: a tabela tem endpoint próprio e
 * paginado (`GET /simulations/:id/schedule`). Retornar tudo aqui tornaria a resposta de
 * criação desnecessariamente pesada.
 */
export interface CreateSimulationOutput {
  readonly id: string;
  readonly userId: string;
  readonly financedAmountCents: number;
  readonly termMonths: number;
  readonly monthlyRate: number;
  readonly ltv: number;
  readonly firstInstallmentCents: number;
  readonly summary: ScheduleTotals;
  readonly cet: CetResult;
  readonly createdAt: Date;
}

/**
 * Cria uma simulação: valida elegibilidade, persiste e devolve o resumo calculado.
 *
 * O caso de uso **orquestra**, não calcula. Toda a matemática vive no núcleo
 * financeiro e toda a regra de elegibilidade vive na entidade; aqui só há a sequência
 * — montar o domínio a partir da entrada, mandar a entidade se validar, salvar e
 * mapear a saída.
 *
 * Depende da **interface** `SimulationRepository`, nunca de uma implementação
 * (ADR-001). É isso que permite testá-lo inteiro com um fake em memória.
 */
export class CreateSimulationUseCase {
  constructor(
    private readonly simulations: SimulationRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly policy: EligibilityPolicy,
  ) {}

  async execute(input: CreateSimulationInput): Promise<CreateSimulationOutput> {
    // `Simulation.create` lança se alguma regra de elegibilidade for violada, então
    // nada é persistido quando a entrada é inválida — a ordem garante isso.
    const simulation = Simulation.create(
      {
        id: this.ids.generate(),
        userId: input.userId,
        propertyValue: Money.fromCents(input.propertyValueCents),
        downPayment: Money.fromCents(input.downPaymentCents),
        termMonths: input.termMonths,
        annualRate: input.annualRate,
        rateConvention: input.rateConvention,
        amortizationSystem: input.amortizationSystem,
        monthlyIncome:
          input.monthlyIncomeCents === undefined
            ? undefined
            : Money.fromCents(input.monthlyIncomeCents),
        charges: input.charges,
        createdAt: this.clock.now(),
      },
      this.policy,
    );

    await this.simulations.create(simulation);

    return toOutput(simulation);
  }
}

/** Mapeia a entidade para o DTO de saída, recalculando o que é derivado. */
export function toOutput(simulation: Simulation): CreateSimulationOutput {
  const schedule = simulation.buildSchedule();

  return {
    id: simulation.id,
    userId: simulation.userId,
    financedAmountCents: simulation.financedAmount.cents,
    termMonths: simulation.termMonths,
    monthlyRate: simulation.monthlyRate,
    ltv: simulation.ltv,
    firstInstallmentCents: schedule[0]?.totalPayment ?? 0,
    summary: simulation.summarize(),
    cet: simulation.calculateCet(),
    createdAt: simulation.createdAt,
  };
}
