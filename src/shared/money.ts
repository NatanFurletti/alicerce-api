/**
 * Representação monetária do projeto (ADR-002).
 *
 * Todo valor em dinheiro trafega como número INTEIRO de centavos. Nunca `float`,
 * nunca reais fracionários. O núcleo financeiro percorre até 420 parcelas: em ponto
 * flutuante binário, 0.1 + 0.2 !== 0.3, e esse erro se acumula parcela a parcela até
 * o saldo devedor final não fechar.
 *
 * `number` comporta inteiros exatos até 2^53-1 (Number.MAX_SAFE_INTEGER), o que em
 * centavos são ~90 trilhões de reais. Folga suficiente para financiamento imobiliário,
 * e por isso não é necessário BigInt no núcleo — a exatidão vem de trabalhar só com
 * inteiros, não do tipo.
 */
export type Cents = number;

/** Erro de programação: um valor monetário chegou fracionário ou não finito. */
export class InvalidMoneyError extends Error {
  constructor(value: number) {
    super(`Valor monetário inválido: ${value}. Esperado inteiro de centavos.`);
    this.name = 'InvalidMoneyError';
  }
}

export function assertCents(value: number): asserts value is Cents {
  if (!Number.isSafeInteger(value)) {
    throw new InvalidMoneyError(value);
  }
}

/**
 * Converte reais para centavos.
 *
 * Usa arredondamento no produto porque `19.99 * 100` resulta em 1998.9999999999998
 * em IEEE 754 — truncar produziria 1998, um centavo a menos.
 */
export function toCents(reais: number): Cents {
  if (!Number.isFinite(reais)) {
    throw new InvalidMoneyError(reais);
  }
  return Math.round(reais * 100);
}

/** Converte centavos para reais. Use apenas na borda de saída (HTTP), nunca no cálculo. */
export function toReais(cents: Cents): number {
  assertCents(cents);
  return cents / 100;
}

/**
 * Multiplica um valor monetário por uma taxa (juros, alíquota de seguro) e devolve
 * centavos inteiros.
 *
 * Política de arredondamento: half-up sobre o valor absoluto (arredondamento
 * comercial), aplicado a cada parcela individualmente — é o que instituições
 * financeiras fazem, e é o que torna o resíduo da última parcela previsível.
 * `Math.round` sozinho não serve: em JavaScript ele arredonda -0.5 para -0, ou seja,
 * é half-up "em direção a +infinito", assimétrico para negativos.
 */
export function multiplyByRate(cents: Cents, rate: number): Cents {
  assertCents(cents);
  if (!Number.isFinite(rate)) {
    throw new InvalidMoneyError(rate);
  }
  const product = cents * rate;
  return Math.sign(product) * Math.round(Math.abs(product));
}

/**
 * Divide um montante em `parts` parcelas inteiras de centavos.
 *
 * Devolve a parcela base e o resíduo (0 <= residuo < parts) que a divisão não
 * distribuiu. Quem chama decide o que fazer com o resíduo — a política do projeto é
 * absorvê-lo na última parcela, para que a soma feche exatamente no principal.
 * Ignorar esse resíduo é a origem clássica do saldo devedor que termina em R$ 0,03.
 */
export function divideCents(
  cents: Cents,
  parts: number,
): { base: Cents; remainder: Cents } {
  assertCents(cents);
  if (!Number.isInteger(parts) || parts <= 0) {
    throw new RangeError(`Número de parcelas inválido: ${parts}`);
  }
  const base = Math.trunc(cents / parts);
  return { base, remainder: cents - base * parts };
}
