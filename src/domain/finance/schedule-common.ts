import { type Cents, multiplyByRate } from '../../shared/money';
import {
  InvalidAmountError,
  InvalidPrincipalError,
  InvalidRateError,
  InvalidTermError,
} from '../errors/domain-errors';
import type { Charges, ScheduleEntry, ScheduleInput, ScheduleTotals } from './types';

/**
 * Validação compartilhada por SAC e Price.
 *
 * Roda uma única vez, na fronteira do cálculo, para que o laço de até 420 iterações
 * seja aritmética pura sem checagem repetida.
 */
export function assertValidScheduleInput(input: ScheduleInput): void {
  if (!Number.isSafeInteger(input.principal) || input.principal <= 0) {
    throw new InvalidPrincipalError(input.principal);
  }
  if (!Number.isInteger(input.termMonths) || input.termMonths <= 0) {
    throw new InvalidTermError(input.termMonths);
  }
  if (!Number.isFinite(input.monthlyRate) || input.monthlyRate < 0) {
    throw new InvalidRateError(input.monthlyRate);
  }
  if (!Number.isSafeInteger(input.propertyValue) || input.propertyValue < 0) {
    throw new InvalidAmountError('propertyValue', input.propertyValue);
  }

  const { mipMonthlyRate, dfiMonthlyRate, adminFeeCents } = input.charges;
  if (!Number.isFinite(mipMonthlyRate) || mipMonthlyRate < 0) {
    throw new InvalidRateError(mipMonthlyRate);
  }
  if (!Number.isFinite(dfiMonthlyRate) || dfiMonthlyRate < 0) {
    throw new InvalidRateError(dfiMonthlyRate);
  }
  if (!Number.isSafeInteger(adminFeeCents) || adminFeeCents < 0) {
    throw new InvalidAmountError('adminFeeCents', adminFeeCents);
  }
}

/**
 * Encargos do mês (SPEC 2.4).
 *
 * O MIP incide sobre o **saldo de abertura** — a mesma base dos juros do mês. Manter a
 * base consistente entre juros e seguro evita a pergunta "por que o MIP do mês 1 não
 * bate com o saldo contratado?". Consequência: a última parcela ainda cobra MIP, sobre
 * o saldo que está sendo quitado.
 */
export function computeCharges(
  openingBalance: Cents,
  propertyValue: Cents,
  charges: Charges,
): { mip: Cents; dfi: Cents; adminFee: Cents } {
  return {
    mip: multiplyByRate(openingBalance, charges.mipMonthlyRate),
    dfi: multiplyByRate(propertyValue, charges.dfiMonthlyRate),
    adminFee: charges.adminFeeCents,
  };
}

/** Consolida os totais de uma tabela já calculada. */
export function summarizeSchedule(schedule: readonly ScheduleEntry[]): ScheduleTotals {
  const totals = {
    totalInterest: 0,
    totalAmortization: 0,
    totalMip: 0,
    totalDfi: 0,
    totalAdminFee: 0,
    totalPaid: 0,
    months: schedule.length,
  };

  for (const entry of schedule) {
    totals.totalInterest += entry.interest;
    // O aporte extraordinário abate principal, portanto conta como amortização.
    totals.totalAmortization += entry.amortization + entry.extraPayment;
    totals.totalMip += entry.mip;
    totals.totalDfi += entry.dfi;
    totals.totalAdminFee += entry.adminFee;
    totals.totalPaid += entry.totalPayment;
  }

  return totals;
}
