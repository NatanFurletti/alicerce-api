import { Simulation } from '../../domain/entities/simulation';
import type { CetResult } from '../../domain/finance/cet';
import type {
  AmortizationSystem,
  Charges,
  RateConvention,
  ScheduleTotals,
} from '../../domain/finance/types';
import type { EligibilityPolicy } from '../../domain/policies/eligibility-policy';
import { Money } from '../../domain/value-objects/money.vo';

export interface CompareSystemsInput {
  readonly propertyValueCents: number;
  readonly downPaymentCents: number;
  readonly termMonths: number;
  readonly annualRate: number;
  readonly rateConvention: RateConvention;
  readonly monthlyIncomeCents?: number;
  readonly charges: Charges;
}

export interface SystemComparison {
  readonly system: AmortizationSystem;
  readonly firstInstallmentCents: number;
  readonly lastInstallmentCents: number;
  readonly summary: ScheduleTotals;
  readonly cet: CetResult;
}

export interface CompareSystemsOutput {
  readonly financedAmountCents: number;
  readonly termMonths: number;
  readonly sac: SystemComparison;
  readonly price: SystemComparison;
  /** Quanto o Price custa a mais em juros. Positivo em qualquer taxa acima de zero. */
  readonly interestDifferenceCents: number;
}

/**
 * Compara SAC e Price para os mesmos parâmetros, sem persistir nada.
 *
 * A comparação é o argumento de venda da API: o mesmo contrato, os dois sistemas, lado
 * a lado. O SAC começa com parcela maior e cobra menos juros no total; o Price começa
 * mais leve e custa mais. Números, não opinião.
 *
 * As duas simulações usam ids sintéticos e nunca chegam ao repositório — este caso de
 * uso não tem dependência de persistência alguma.
 */
export class CompareSystemsUseCase {
  constructor(private readonly policy: EligibilityPolicy) {}

  execute(input: CompareSystemsInput): CompareSystemsOutput {
    const sac = this.buildComparison(input, 'SAC');
    const price = this.buildComparison(input, 'PRICE');

    return {
      financedAmountCents: input.propertyValueCents - input.downPaymentCents,
      termMonths: input.termMonths,
      sac,
      price,
      interestDifferenceCents: price.summary.totalInterest - sac.summary.totalInterest,
    };
  }

  private buildComparison(
    input: CompareSystemsInput,
    system: AmortizationSystem,
  ): SystemComparison {
    const simulation = Simulation.create(
      {
        // Efêmero: nada aqui é persistido, mas a entidade exige identidade.
        id: `compare-${system.toLowerCase()}`,
        userId: 'compare',
        propertyValue: Money.fromCents(input.propertyValueCents),
        downPayment: Money.fromCents(input.downPaymentCents),
        termMonths: input.termMonths,
        annualRate: input.annualRate,
        rateConvention: input.rateConvention,
        amortizationSystem: system,
        monthlyIncome:
          input.monthlyIncomeCents === undefined
            ? undefined
            : Money.fromCents(input.monthlyIncomeCents),
        charges: input.charges,
        createdAt: new Date(0),
      },
      this.policy,
    );

    const schedule = simulation.buildSchedule();

    return {
      system,
      firstInstallmentCents: schedule[0]?.totalPayment ?? 0,
      lastInstallmentCents: schedule.at(-1)?.totalPayment ?? 0,
      summary: simulation.summarize(),
      cet: simulation.calculateCet(),
    };
  }
}
