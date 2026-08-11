import type { Cents } from '../../shared/money';

/**
 * Convenção de conversão da taxa anual para mensal (ADR-004).
 *
 * O mercado usa as duas, e elas produzem parcelas diferentes para a mesma taxa
 * contratada — por isso a convenção é entrada, não constante.
 */
export type RateConvention = 'EFFECTIVE' | 'NOMINAL';

/** Sistema de amortização. */
export type AmortizationSystem = 'SAC' | 'PRICE';

/** Estratégia de aplicação de um aporte extraordinário (SPEC 2.6). */
export type ExtraPaymentStrategy = 'REDUCE_TERM' | 'REDUCE_INSTALLMENT';

/**
 * Encargos mensais que compõem a parcela além de juros e amortização (SPEC 2.4).
 *
 * As alíquotas são MENSAIS e vêm sempre de fora: são parâmetros de mercado, não
 * fatos hardcoded.
 */
export interface Charges {
  /** Alíquota mensal do MIP, aplicada sobre o saldo devedor de abertura do mês. */
  readonly mipMonthlyRate: number;
  /** Alíquota mensal do DFI, aplicada sobre o valor do imóvel (constante). */
  readonly dfiMonthlyRate: number;
  /** Taxa de administração: valor fixo mensal, em centavos. */
  readonly adminFeeCents: Cents;
}

/** Uma linha da tabela de amortização. */
export interface ScheduleEntry {
  /** Número do mês, começando em 1. */
  readonly month: number;
  /** Saldo devedor no início do mês, antes do pagamento. */
  readonly openingBalance: Cents;
  /** Juros do mês: saldo de abertura × taxa mensal. */
  readonly interest: Cents;
  /** Parcela de amortização do principal. */
  readonly amortization: Cents;
  /** Aporte extraordinário aplicado neste mês, se houver. */
  readonly extraPayment: Cents;
  /** Seguro MIP do mês. */
  readonly mip: Cents;
  /** Seguro DFI do mês. */
  readonly dfi: Cents;
  /** Taxa de administração do mês. */
  readonly adminFee: Cents;
  /** Prestação sem encargos: juros + amortização. */
  readonly installment: Cents;
  /** Desembolso total do mês: prestação + encargos + aporte extraordinário. */
  readonly totalPayment: Cents;
  /** Saldo devedor ao final do mês. */
  readonly closingBalance: Cents;
}

/** Entrada do cálculo de uma tabela de amortização. */
export interface ScheduleInput {
  /** Valor financiado (principal), em centavos. */
  readonly principal: Cents;
  /** Prazo em meses. */
  readonly termMonths: number;
  /** Taxa mensal já convertida, em decimal (0.008 = 0,8% a.m.). */
  readonly monthlyRate: number;
  /** Valor do imóvel, em centavos — base do DFI. */
  readonly propertyValue: Cents;
  readonly charges: Charges;
}

/** Aporte extraordinário num mês específico (SPEC 2.6). */
export interface ExtraPayment {
  /** Mês em que o aporte é feito, começando em 1. */
  readonly month: number;
  /** Valor do aporte, em centavos. */
  readonly amount: Cents;
  readonly strategy: ExtraPaymentStrategy;
}

/** Efeito de um conjunto de aportes sobre o contrato. */
export interface ExtraPaymentSummary {
  readonly totalInterestWithoutExtra: Cents;
  readonly totalInterestWithExtra: Cents;
  /** Juros economizados: sempre >= 0. */
  readonly interestSaved: Cents;
  /** Encargos economizados pelos meses eliminados do contrato. */
  readonly chargesSaved: Cents;
  /** Meses eliminados do prazo original. Zero na estratégia REDUCE_INSTALLMENT. */
  readonly monthsSaved: number;
  readonly totalExtraPaid: Cents;
}

/** Resultado do recálculo com aportes. */
export interface ExtraPaymentResult {
  readonly schedule: readonly ScheduleEntry[];
  readonly summary: ExtraPaymentSummary;
}

/** Totais de uma tabela de amortização. */
export interface ScheduleTotals {
  readonly totalInterest: Cents;
  readonly totalAmortization: Cents;
  readonly totalMip: Cents;
  readonly totalDfi: Cents;
  readonly totalAdminFee: Cents;
  readonly totalPaid: Cents;
  readonly months: number;
}
