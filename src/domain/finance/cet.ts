import type { Cents } from '../../shared/money';
import { CetDidNotConvergeError, InvalidCashFlowError } from '../errors/domain-errors';
import { monthlyToAnnualRate } from './rate';
import type { ScheduleEntry } from './types';

/** Parâmetros do método numérico. Explícitos por exigência do SPEC 2.5. */
export interface IrrOptions {
  /** Tolerância no VPL para considerar a raiz encontrada. Default 1e-9. */
  readonly tolerance?: number;
  /** Teto de iterações antes de desistir. Default 100. */
  readonly maxIterations?: number;
  /** Chute inicial do Newton-Raphson. Default 1% a.m. */
  readonly initialGuess?: number;
}

const DEFAULT_TOLERANCE = 1e-9;
const DEFAULT_MAX_ITERATIONS = 100;
const DEFAULT_GUESS = 0.01;

/** Piso e teto da bissecção: -99,99% a 100% ao mês cobre qualquer contrato real. */
const MIN_RATE = -0.9999;
const MAX_RATE = 1;

/**
 * Abaixo disto, a taxa é ruído de ponto flutuante e não uma taxa.
 *
 * Um contrato sem juros e sem encargos tem TIR exatamente zero, mas o método numérico
 * chega a algo como -2.18e-17. Sem este saneamento, esse "zero negativo" é propagado
 * como taxa negativa e faz a anualização estourar. 1e-12 a.m. é dez ordens de grandeza
 * menor que um centésimo de ponto-base: nenhuma taxa real vive nessa faixa.
 */
const RATE_NOISE_FLOOR = 1e-12;

/** Colapsa ruído numérico em zero exato, preservando taxas negativas de verdade. */
function sanitizeRate(rate: number): number {
  return Math.abs(rate) < RATE_NOISE_FLOOR ? 0 : rate;
}

/**
 * Valor presente líquido do fluxo, descontado à taxa informada.
 *
 * `flow[0]` é o instante zero (não descontado), `flow[k]` é o mês k.
 */
export function netPresentValue(flow: readonly number[], rate: number): number {
  let npv = 0;
  for (let k = 0; k < flow.length; k += 1) {
    npv += flow[k]! / (1 + rate) ** k;
  }
  return npv;
}

/** Derivada do VPL em relação à taxa — usada pelo passo de Newton. */
function netPresentValueDerivative(flow: readonly number[], rate: number): number {
  let derivative = 0;
  for (let k = 1; k < flow.length; k += 1) {
    derivative -= (k * flow[k]!) / (1 + rate) ** (k + 1);
  }
  return derivative;
}

function assertValidCashFlow(flow: readonly number[]): void {
  if (flow.length < 2) {
    throw new InvalidCashFlowError('o fluxo precisa de ao menos dois períodos.');
  }
  if (!flow.every((value) => Number.isFinite(value))) {
    throw new InvalidCashFlowError('há valores não finitos no fluxo.');
  }
  // Sem troca de sinal, o VPL é monótono e nunca cruza zero: não existe TIR.
  const hasOutflow = flow.some((value) => value < 0);
  const hasInflow = flow.some((value) => value > 0);
  if (!hasOutflow || !hasInflow) {
    throw new InvalidCashFlowError(
      'é necessário ao menos um valor negativo e um positivo (regra de sinal de Descartes).',
    );
  }
}

/**
 * TIR do fluxo de caixa por Newton-Raphson com fallback para bissecção (SPEC 2.5).
 *
 * **Por que os dois métodos.** Newton converge quadraticamente — tipicamente em 4 ou 5
 * iterações — mas depende da derivada: se ela ficar próxima de zero, o passo dispara
 * para longe e o método diverge. A bissecção é lenta (converge linearmente) porém
 * infalível desde que a raiz esteja no intervalo, porque só depende da troca de sinal.
 *
 * A estratégia é usar Newton pela velocidade e cair na bissecção quando ele sai do
 * intervalo válido ou a derivada degenera. Assim o cálculo é rápido no caso comum e
 * ainda assim garantido no caso patológico.
 *
 * Se nenhum dos dois convergir dentro de `maxIterations`, lança
 * `CetDidNotConvergeError` — nunca devolve `NaN` disfarçado de taxa.
 */
export function calculateIrr(flow: readonly number[], options: IrrOptions = {}): number {
  assertValidCashFlow(flow);

  const tolerance = options.tolerance ?? DEFAULT_TOLERANCE;
  const maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;

  let rate = options.initialGuess ?? DEFAULT_GUESS;

  for (let i = 0; i < maxIterations; i += 1) {
    const npv = netPresentValue(flow, rate);
    if (Math.abs(npv) < tolerance) {
      return sanitizeRate(rate);
    }

    const derivative = netPresentValueDerivative(flow, rate);
    if (derivative === 0 || !Number.isFinite(derivative)) {
      break;
    }

    const next = rate - npv / derivative;
    if (!Number.isFinite(next) || next <= MIN_RATE || next >= MAX_RATE) {
      break;
    }
    rate = next;
  }

  return bisect(flow, tolerance, maxIterations);
}

/**
 * Largura mínima do intervalo da bissecção antes de desistir de estreitá-lo.
 *
 * Distinta da tolerância do VPL de propósito: a tolerância é medida em unidades
 * monetárias e a largura do intervalo em taxa. Usar o mesmo número para as duas faz a
 * bissecção parar cedo demais — um intervalo de 1e-9 de largura ainda pode conter um
 * VPL de vários centavos num fluxo de centenas de milhares. 1e-15 é o limite prático
 * de resolução de um double nesta faixa.
 */
const BISECTION_INTERVAL_EPSILON = 1e-15;

/**
 * Bissecção no intervalo [MIN_RATE, MAX_RATE].
 *
 * Requer que o VPL troque de sinal entre os extremos — garantido para um fluxo de
 * financiamento convencional, onde há uma única troca de sinal (saída no mês 0,
 * entradas depois).
 */
function bisect(
  flow: readonly number[],
  tolerance: number,
  maxIterations: number,
): number {
  let low = MIN_RATE;
  let high = MAX_RATE;
  let npvLow = netPresentValue(flow, low);

  if (Math.sign(npvLow) === Math.sign(netPresentValue(flow, high))) {
    throw new CetDidNotConvergeError(maxIterations);
  }

  for (let i = 0; i < maxIterations; i += 1) {
    const mid = (low + high) / 2;
    const npvMid = netPresentValue(flow, mid);

    // A raiz está encontrada quando o VPL zera OU quando o intervalo é tão estreito
    // que não há mais precisão de ponto flutuante para estreitá-lo.
    if (Math.abs(npvMid) < tolerance || (high - low) / 2 < BISECTION_INTERVAL_EPSILON) {
      return sanitizeRate(mid);
    }

    if (Math.sign(npvMid) === Math.sign(npvLow)) {
      low = mid;
      npvLow = npvMid;
    } else {
      high = mid;
    }
  }

  throw new CetDidNotConvergeError(maxIterations);
}

export interface CetOptions extends IrrOptions {
  /**
   * Despesas iniciais pagas no ato (avaliação, ITBI, registro), em centavos.
   * Reduzem o valor líquido efetivamente liberado e, portanto, elevam o CET.
   */
  readonly upfrontCostsCents?: Cents;
}

export interface CetResult {
  /** TIR mensal do fluxo, em decimal. */
  readonly monthlyRate: number;
  /** Equivalente anual: `(1 + i_m)^12 - 1`. */
  readonly annualRate: number;
}

/**
 * CET de uma tabela de amortização (SPEC 2.5).
 *
 * O fluxo é montado do ponto de vista do **tomador**: no mês zero ele recebe o valor
 * líquido (montante financiado menos despesas iniciais), e nos meses seguintes paga o
 * desembolso total de cada parcela — juros, amortização, MIP, DFI e taxa
 * administrativa. A TIR desse fluxo é o custo efetivo.
 *
 * Por incluir os encargos, o CET é sempre maior que a taxa de juros contratada. É
 * exatamente por isso que ele é a taxa que permite comparar propostas de bancos
 * diferentes.
 */
export function calculateCet(
  schedule: readonly ScheduleEntry[],
  financedAmount: Cents,
  options: CetOptions = {},
): CetResult {
  if (schedule.length === 0) {
    throw new InvalidCashFlowError('a tabela de amortização está vazia.');
  }

  const netReleased = financedAmount - (options.upfrontCostsCents ?? 0);
  const flow = [-netReleased, ...schedule.map((entry) => entry.totalPayment)];

  const monthlyRate = calculateIrr(flow, options);
  return { monthlyRate, annualRate: monthlyToAnnualRate(monthlyRate) };
}
