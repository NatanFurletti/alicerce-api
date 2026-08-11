import {
  DownPaymentExceedsPropertyValueError,
  IncomeCommitmentExceededError,
  InvalidTermError,
  LtvExceededError,
  TermExceedsMaximumError,
} from '../errors/domain-errors';
import { calculateCet, type CetResult } from '../finance/cet';
import { buildPriceSchedule } from '../finance/price';
import { annualToMonthlyRate } from '../finance/rate';
import { buildSacSchedule } from '../finance/sac';
import { summarizeSchedule } from '../finance/schedule-common';
import type {
  AmortizationSystem,
  Charges,
  RateConvention,
  ScheduleEntry,
  ScheduleInput,
  ScheduleTotals,
} from '../finance/types';
import type { EligibilityPolicy } from '../policies/eligibility-policy';
import { Money } from '../value-objects/money.vo';

export interface SimulationProps {
  readonly id: string;
  readonly userId: string;
  readonly propertyValue: Money;
  readonly downPayment: Money;
  readonly termMonths: number;
  /** Taxa contratada ao ano, em decimal (0.0975 = 9,75% a.a.). */
  readonly annualRate: number;
  readonly rateConvention: RateConvention;
  readonly amortizationSystem: AmortizationSystem;
  /** Renda bruta familiar mensal. Opcional: sem ela não há checagem de comprometimento. */
  readonly monthlyIncome?: Money;
  readonly charges: Charges;
  readonly createdAt: Date;
}

/**
 * Uma simulação de financiamento.
 *
 * A entidade **não guarda a tabela de amortização** — ela sabe como produzi-la a
 * partir dos próprios parâmetros (ADR-003). Tudo que ela carrega é o que o usuário
 * informou; o resto é derivado sob demanda por funções puras do núcleo financeiro.
 *
 * **Dois construtores, de propósito.** `create` é a porta de entrada de uma simulação
 * nova e aplica todas as regras de elegibilidade. `restore` reconstrói uma simulação
 * que já existe no banco e **não revalida nada** — ver a nota no método.
 */
export class Simulation {
  private constructor(private readonly props: SimulationProps) {}

  /**
   * Cria uma simulação nova, validando-a contra a política de elegibilidade.
   *
   * A ordem das validações importa: prazo e entrada primeiro, porque são baratas e
   * porque a checagem de renda precisa montar a primeira parcela — o que exige que os
   * parâmetros já façam sentido.
   */
  static create(props: SimulationProps, policy: EligibilityPolicy): Simulation {
    Simulation.assertValidTerm(props.termMonths, policy);

    if (!props.downPayment.isLessThan(props.propertyValue)) {
      throw new DownPaymentExceedsPropertyValueError(
        props.downPayment.cents,
        props.propertyValue.cents,
      );
    }

    const simulation = new Simulation(props);
    simulation.assertLtvWithinPolicy(policy);
    simulation.assertIncomeCommitmentWithinPolicy(policy);

    return simulation;
  }

  /**
   * Reconstrói uma simulação já persistida, **sem revalidar elegibilidade**.
   *
   * Deliberado: os limites são parâmetros de mercado e mudam. Se `restore` revalidasse,
   * baixar o LTV máximo de 80% para 70% tornaria toda simulação antiga irrecuperável —
   * o usuário perderia acesso ao próprio histórico por causa de uma mudança de
   * configuração. Regra de elegibilidade governa a criação, não a leitura.
   */
  static restore(props: SimulationProps): Simulation {
    return new Simulation(props);
  }

  private static assertValidTerm(termMonths: number, policy: EligibilityPolicy): void {
    if (!Number.isInteger(termMonths) || termMonths <= 0) {
      throw new InvalidTermError(termMonths);
    }
    if (termMonths > policy.maxTermMonths) {
      throw new TermExceedsMaximumError(termMonths, policy.maxTermMonths);
    }
  }

  private assertLtvWithinPolicy(policy: EligibilityPolicy): void {
    const ltvPercent = this.ltv * 100;
    // Tolerância de meio centésimo: um LTV de exatamente 80% não pode ser reprovado
    // por ruído de ponto flutuante na divisão.
    if (ltvPercent > policy.maxLtvPercent + 1e-9) {
      throw new LtvExceededError(ltvPercent, policy.maxLtvPercent);
    }
  }

  private assertIncomeCommitmentWithinPolicy(policy: EligibilityPolicy): void {
    const income = this.props.monthlyIncome;
    if (income === undefined || income.isZero()) {
      return;
    }

    const commitmentPercent = this.firstMonthTotalPayment.ratioTo(income) * 100;
    if (commitmentPercent > policy.maxIncomeCommitmentPercent + 1e-9) {
      throw new IncomeCommitmentExceededError(
        commitmentPercent,
        policy.maxIncomeCommitmentPercent,
      );
    }
  }

  get id(): string {
    return this.props.id;
  }

  get userId(): string {
    return this.props.userId;
  }

  get propertyValue(): Money {
    return this.props.propertyValue;
  }

  get downPayment(): Money {
    return this.props.downPayment;
  }

  get termMonths(): number {
    return this.props.termMonths;
  }

  get annualRate(): number {
    return this.props.annualRate;
  }

  get rateConvention(): RateConvention {
    return this.props.rateConvention;
  }

  get amortizationSystem(): AmortizationSystem {
    return this.props.amortizationSystem;
  }

  get monthlyIncome(): Money | undefined {
    return this.props.monthlyIncome;
  }

  get charges(): Charges {
    return this.props.charges;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  /** Valor efetivamente financiado: imóvel menos entrada. */
  get financedAmount(): Money {
    return this.props.propertyValue.minus(this.props.downPayment);
  }

  /** Loan-to-value: fração do imóvel que está sendo financiada. */
  get ltv(): number {
    return this.financedAmount.ratioTo(this.props.propertyValue);
  }

  /** Taxa mensal, convertida da anual segundo a convenção contratada (ADR-004). */
  get monthlyRate(): number {
    return annualToMonthlyRate(this.props.annualRate, this.props.rateConvention);
  }

  /**
   * Desembolso total do primeiro mês — prestação **mais** encargos.
   *
   * É esta a base do comprometimento de renda, e não a prestação pura: o que sai da
   * conta do cliente inclui MIP, DFI e taxa administrativa. Usar só a prestação
   * aprovaria contratos que, na prática, não cabem no orçamento.
   */
  get firstMonthTotalPayment(): Money {
    const first = this.buildSchedule()[0];
    return first === undefined ? Money.zero() : Money.fromCents(first.totalPayment);
  }

  private toScheduleInput(): ScheduleInput {
    return {
      principal: this.financedAmount.cents,
      termMonths: this.props.termMonths,
      monthlyRate: this.monthlyRate,
      propertyValue: this.props.propertyValue.cents,
      charges: this.props.charges,
    };
  }

  /** Tabela de amortização, recalculada sob demanda (ADR-003). */
  buildSchedule(): ScheduleEntry[] {
    const input = this.toScheduleInput();
    return this.props.amortizationSystem === 'SAC'
      ? buildSacSchedule(input)
      : buildPriceSchedule(input);
  }

  summarize(): ScheduleTotals {
    return summarizeSchedule(this.buildSchedule());
  }

  calculateCet(upfrontCostsCents = 0): CetResult {
    return calculateCet(this.buildSchedule(), this.financedAmount.cents, {
      upfrontCostsCents,
    });
  }
}
