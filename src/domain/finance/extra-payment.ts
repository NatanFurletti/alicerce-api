import { type Cents, divideCents, multiplyByRate } from '../../shared/money';
import {
  ExtraPaymentExceedsBalanceError,
  ExtraPaymentOutOfRangeError,
  InvalidAmountError,
} from '../errors/domain-errors';
import { buildPriceSchedule, calculatePmt } from './price';
import { buildSacSchedule } from './sac';
import { assertValidScheduleInput, computeCharges } from './schedule-common';
import type {
  AmortizationSystem,
  ExtraPayment,
  ExtraPaymentResult,
  ScheduleEntry,
  ScheduleInput,
} from './types';

function assertValidExtraPayments(
  extraPayments: readonly ExtraPayment[],
  termMonths: number,
): void {
  for (const { month, amount } of extraPayments) {
    if (!Number.isInteger(month) || month < 1 || month > termMonths) {
      throw new ExtraPaymentOutOfRangeError(month, termMonths);
    }
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      throw new InvalidAmountError('extraPayment.amount', amount);
    }
  }
}

/** Agrupa aportes do mesmo mês, para que a ordem de entrada não altere o resultado. */
function groupByMonth(
  extraPayments: readonly ExtraPayment[],
): Map<number, { amount: Cents; strategy: ExtraPayment['strategy'] }> {
  const byMonth = new Map<
    number,
    { amount: Cents; strategy: ExtraPayment['strategy'] }
  >();

  for (const payment of extraPayments) {
    const existing = byMonth.get(payment.month);
    byMonth.set(payment.month, {
      // Aportes no mesmo mês somam; a última estratégia informada prevalece.
      amount: (existing?.amount ?? 0) + payment.amount,
      strategy: payment.strategy,
    });
  }

  return byMonth;
}

/**
 * Recalcula a tabela de amortização aplicando aportes extraordinários (SPEC 2.6).
 *
 * O laço é único e percorre os meses do contrato mantendo dois parâmetros vivos — a
 * amortização-alvo (SAC) ou a prestação-alvo (Price). Um aporte abate o saldo devedor
 * e, dependendo da estratégia, atualiza esses parâmetros:
 *
 * - `REDUCE_TERM` — nada é recalculado. O saldo menor com a mesma amortização mensal
 *   simplesmente se esgota antes, e o laço encerra quando chega a zero. O cliente
 *   continua pagando o mesmo valor e termina mais cedo.
 * - `REDUCE_INSTALLMENT` — o alvo é recalculado sobre o saldo remanescente e o prazo
 *   que resta, então a prestação cai e o contrato vai até o fim do prazo original.
 *
 * Por que os dois numa função só: a diferença entre as estratégias é *o que se
 * recalcula após o abatimento*, não a mecânica da tabela. Duplicar o laço para cada
 * combinação de sistema e estratégia produziria quatro cópias da mesma aritmética.
 */
export function applyExtraPayments(
  input: ScheduleInput,
  system: AmortizationSystem,
  extraPayments: readonly ExtraPayment[],
): ExtraPaymentResult {
  assertValidScheduleInput(input);
  assertValidExtraPayments(extraPayments, input.termMonths);

  const baseline = system === 'SAC' ? buildSacSchedule(input) : buildPriceSchedule(input);

  if (extraPayments.length === 0) {
    return {
      schedule: baseline,
      summary: {
        totalInterestWithoutExtra: sumInterest(baseline),
        totalInterestWithExtra: sumInterest(baseline),
        interestSaved: 0,
        chargesSaved: 0,
        monthsSaved: 0,
        totalExtraPaid: 0,
      },
    };
  }

  const { termMonths, monthlyRate, propertyValue, charges } = input;
  const byMonth = groupByMonth(extraPayments);

  // Parâmetro-alvo do sistema: amortização fixa no SAC, prestação fixa no Price.
  let target =
    system === 'SAC'
      ? divideCents(input.principal, termMonths).base
      : calculatePmt(input.principal, termMonths, monthlyRate);

  const schedule: ScheduleEntry[] = [];
  let balance: Cents = input.principal;

  for (let month = 1; month <= termMonths && balance > 0; month += 1) {
    const interest = multiplyByRate(balance, monthlyRate);
    const { mip, dfi, adminFee } = computeCharges(balance, propertyValue, charges);

    // A amortização regular nunca pode exceder o saldo: no último mês ela o quita.
    const regular = system === 'SAC' ? target : target - interest;
    const amortization = Math.min(Math.max(regular, 0), balance);

    const extra = byMonth.get(month);
    let extraPayment: Cents = 0;

    if (extra !== undefined) {
      const remainingAfterAmortization = balance - amortization;
      if (extra.amount > remainingAfterAmortization) {
        throw new ExtraPaymentExceedsBalanceError(
          extra.amount,
          remainingAfterAmortization,
        );
      }
      extraPayment = extra.amount;
    }

    const installment = amortization + interest;
    const closingBalance = balance - amortization - extraPayment;

    schedule.push({
      month,
      openingBalance: balance,
      interest,
      amortization,
      extraPayment,
      mip,
      dfi,
      adminFee,
      installment,
      totalPayment: installment + extraPayment + mip + dfi + adminFee,
      closingBalance,
    });

    balance = closingBalance;

    // REDUCE_INSTALLMENT: recalcula o alvo sobre o saldo e o prazo remanescentes.
    // REDUCE_TERM não faz nada aqui — é justamente por manter o alvo que o prazo cai.
    if (extra?.strategy === 'REDUCE_INSTALLMENT' && balance > 0) {
      const remainingMonths = termMonths - month;
      if (remainingMonths > 0) {
        target =
          system === 'SAC'
            ? divideCents(balance, remainingMonths).base
            : calculatePmt(balance, remainingMonths, monthlyRate);
      }
    }
  }

  // O resíduo da divisão inteira pode deixar centavos no saldo após o último mês
  // planejado. A política do projeto (ADR-002) é fechar na última parcela.
  if (balance > 0 && schedule.length > 0) {
    settleResidualBalance(schedule, balance);
  }

  return {
    schedule,
    summary: buildSummary(baseline, schedule),
  };
}

/** Absorve o saldo remanescente na última linha, mantendo o saldo final em zero. */
function settleResidualBalance(schedule: ScheduleEntry[], residual: Cents): void {
  const last = schedule[schedule.length - 1]!;
  schedule[schedule.length - 1] = {
    ...last,
    amortization: last.amortization + residual,
    installment: last.installment + residual,
    totalPayment: last.totalPayment + residual,
    closingBalance: 0,
  };
}

function sumInterest(schedule: readonly ScheduleEntry[]): Cents {
  return schedule.reduce((total, entry) => total + entry.interest, 0);
}

function sumCharges(schedule: readonly ScheduleEntry[]): Cents {
  return schedule.reduce((total, e) => total + e.mip + e.dfi + e.adminFee, 0);
}

function buildSummary(
  baseline: readonly ScheduleEntry[],
  withExtra: readonly ScheduleEntry[],
): ExtraPaymentResult['summary'] {
  const totalInterestWithoutExtra = sumInterest(baseline);
  const totalInterestWithExtra = sumInterest(withExtra);

  return {
    totalInterestWithoutExtra,
    totalInterestWithExtra,
    interestSaved: totalInterestWithoutExtra - totalInterestWithExtra,
    chargesSaved: sumCharges(baseline) - sumCharges(withExtra),
    monthsSaved: baseline.length - withExtra.length,
    totalExtraPaid: withExtra.reduce((total, entry) => total + entry.extraPayment, 0),
  };
}
