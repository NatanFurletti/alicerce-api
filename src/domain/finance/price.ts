import { type Cents, multiplyByRate } from '../../shared/money';
import {
  InvalidPrincipalError,
  InvalidRateError,
  InvalidTermError,
} from '../errors/domain-errors';
import { assertValidScheduleInput, computeCharges } from './schedule-common';
import type { ScheduleEntry, ScheduleInput } from './types';

/**
 * Prestação fixa do sistema Price (SPEC 2.3).
 *
 * ```
 * PMT = PV * [ i * (1+i)^n ] / [ (1+i)^n - 1 ]
 * ```
 *
 * **Caso de borda obrigatório: i = 0.** O denominador vira `(1+0)^n - 1 = 0` e a
 * fórmula divide por zero, devolvendo `Infinity` ou `NaN` silenciosamente. Tratado
 * explicitamente como `PMT = PV / n`, que é o limite matemático da expressão quando
 * i → 0: sem juros, o financiamento é o principal dividido em n parcelas.
 *
 * O resultado é arredondado para centavos inteiros — é o valor que vai no contrato.
 */
export function calculatePmt(
  principal: Cents,
  termMonths: number,
  monthlyRate: number,
): Cents {
  if (!Number.isSafeInteger(principal) || principal <= 0) {
    throw new InvalidPrincipalError(principal);
  }
  if (!Number.isInteger(termMonths) || termMonths <= 0) {
    throw new InvalidTermError(termMonths);
  }
  if (!Number.isFinite(monthlyRate) || monthlyRate < 0) {
    throw new InvalidRateError(monthlyRate);
  }

  if (monthlyRate === 0) {
    return Math.round(principal / termMonths);
  }

  const compound = (1 + monthlyRate) ** termMonths;
  return Math.round((principal * (monthlyRate * compound)) / (compound - 1));
}

/**
 * Tabela de amortização pelo sistema Price (SPEC 2.3).
 *
 * ```
 * juros_k   = saldo_k * i
 * amort_k   = PMT - juros_k        (crescente)
 * saldo_k+1 = saldo_k - amort_k
 * ```
 *
 * **Política de resíduo (ADR-002).** O PMT é arredondado para centavos, então a soma
 * das amortizações calculadas não fecha exatamente no principal: sobra ou falta alguns
 * centavos após n meses. A política é fechar na última parcela — a amortização final é
 * definida como o saldo de abertura remanescente, e a prestação daquele mês é
 * recomposta a partir dela. O saldo termina em zero por construção, não por sorte.
 *
 * A alternativa — deixar o saldo residual e "esquecer" alguns centavos — é o defeito
 * clássico de simulador que termina com R$ 0,03 em aberto.
 */
export function buildPriceSchedule(input: ScheduleInput): ScheduleEntry[] {
  assertValidScheduleInput(input);

  const { principal, termMonths, monthlyRate, propertyValue, charges } = input;
  const pmt = calculatePmt(principal, termMonths, monthlyRate);

  const schedule: ScheduleEntry[] = [];
  let balance: Cents = principal;

  for (let month = 1; month <= termMonths; month += 1) {
    const isLast = month === termMonths;
    const interest = multiplyByRate(balance, monthlyRate);
    const { mip, dfi, adminFee } = computeCharges(balance, propertyValue, charges);

    // Na última parcela a amortização é o que ainda resta, e não `PMT - juros`.
    // É isso que garante saldo final exatamente zero.
    const amortization = isLast ? balance : pmt - interest;
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
