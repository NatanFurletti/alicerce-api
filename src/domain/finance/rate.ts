import { InvalidRateError } from '../errors/domain-errors';
import type { RateConvention } from './types';

const MONTHS_PER_YEAR = 12;

function assertValidRate(rate: number): void {
  if (!Number.isFinite(rate) || rate < 0) {
    throw new InvalidRateError(rate);
  }
}

/**
 * Converte a taxa anual contratada em taxa mensal (SPEC 2.1, ADR-004).
 *
 * Duas convenções, ambas usadas no mercado brasileiro:
 *
 * - `EFFECTIVE` — taxa efetiva equivalente: `(1 + i_a)^(1/12) - 1`. Doze meses dessa
 *   taxa capitalizam de volta exatamente na taxa anual contratada.
 * - `NOMINAL` — taxa nominal linear: `i_a / 12`. Ignora a capitalização, portanto
 *   resulta numa taxa mensal MAIOR: 12% a.a. nominal capitaliza em 12,68% a.a. efetivos.
 *
 * A diferença não é acadêmica — muda o valor da parcela. Por isso a convenção é
 * parâmetro de entrada, e não uma constante escondida no código.
 */
export function annualToMonthlyRate(
  annualRate: number,
  convention: RateConvention,
): number {
  assertValidRate(annualRate);

  return convention === 'NOMINAL'
    ? annualRate / MONTHS_PER_YEAR
    : (1 + annualRate) ** (1 / MONTHS_PER_YEAR) - 1;
}

/**
 * Capitaliza uma taxa mensal em taxa anual equivalente: `(1 + i_m)^12 - 1`.
 *
 * Usada para anualizar o CET, que é calculado como TIR mensal do fluxo de caixa.
 */
export function monthlyToAnnualRate(monthlyRate: number): number {
  assertValidRate(monthlyRate);

  return (1 + monthlyRate) ** MONTHS_PER_YEAR - 1;
}
