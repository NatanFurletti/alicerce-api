import { type Cents, divideCents, multiplyByRate } from '../../shared/money';
import { assertValidScheduleInput, computeCharges } from './schedule-common';
import type { ScheduleEntry, ScheduleInput } from './types';

/**
 * Tabela de amortização pelo SAC — Sistema de Amortização Constante (SPEC 2.2).
 *
 * ```
 * amortizacao       = principal / n            (constante)
 * juros_k           = saldo_k * i
 * parcela_k         = amortizacao + juros_k    (decrescente)
 * saldo_k+1         = saldo_k - amortizacao
 * ```
 *
 * **Resíduo (ADR-002).** `principal / n` raramente é exato em centavos. Em vez de
 * arredondar cada mês e deixar o erro se acumular, a divisão inteira é feita uma vez
 * e o resto é somado à última amortização. Assim as n-1 primeiras parcelas são
 * idênticas — como o nome do sistema promete — e o saldo fecha exatamente em zero.
 *
 * A alternativa, distribuir o resto centavo a centavo nas primeiras parcelas, foi
 * descartada: tornaria as amortizações desiguais num sistema chamado "constante".
 */
export function buildSacSchedule(input: ScheduleInput): ScheduleEntry[] {
  assertValidScheduleInput(input);

  const { principal, termMonths, monthlyRate, propertyValue, charges } = input;
  const { base: amortizationBase, remainder } = divideCents(principal, termMonths);

  const schedule: ScheduleEntry[] = [];
  let balance: Cents = principal;

  for (let month = 1; month <= termMonths; month += 1) {
    const isLast = month === termMonths;
    const amortization = isLast ? amortizationBase + remainder : amortizationBase;

    const interest = multiplyByRate(balance, monthlyRate);
    const { mip, dfi, adminFee } = computeCharges(balance, propertyValue, charges);

    const installment = amortization + interest;
    const closingBalance = balance - amortization;

    schedule.push({
      month,
      openingBalance: balance,
      interest,
      amortization,
      extraPayment: 0,
      mip,
      dfi,
      adminFee,
      installment,
      totalPayment: installment + mip + dfi + adminFee,
      closingBalance,
    });

    balance = closingBalance;
  }

  return schedule;
}
