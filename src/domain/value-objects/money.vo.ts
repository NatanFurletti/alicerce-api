import { type Cents, multiplyByRate, toCents, toReais } from '../../shared/money';
import { InvalidAmountError } from '../errors/domain-errors';

/**
 * Valor monetário não negativo, em centavos inteiros (ADR-002).
 *
 * Por que um value object sobre o `Cents` que já existe em `shared/money.ts`: aquele
 * módulo oferece funções soltas sobre `number`, e nada impede passar um saldo onde se
 * espera uma taxa, ou somar centavos a reais. `Money` fecha esse buraco — o tipo passa
 * a carregar a unidade, e a validação acontece na construção, uma vez, em vez de em
 * cada operação.
 *
 * Imutável: toda operação devolve nova instância. Isso é o que permite passar um
 * `Money` adiante sem medo de que alguém o altere pelas costas.
 *
 * **Não negativo por construção.** Valor de imóvel, entrada e saldo devedor nunca são
 * negativos no domínio. Uma subtração que estouraria esse limite lança em vez de
 * devolver lixo — é onde "entrada maior que o valor do imóvel" é pego.
 */
export class Money {
  private constructor(readonly cents: Cents) {}

  static fromCents(cents: number): Money {
    if (!Number.isSafeInteger(cents) || cents < 0) {
      throw new InvalidAmountError('money', cents);
    }
    return new Money(cents);
  }

  static fromReais(reais: number): Money {
    if (!Number.isFinite(reais) || reais < 0) {
      throw new InvalidAmountError('money', reais);
    }
    return new Money(toCents(reais));
  }

  static zero(): Money {
    return new Money(0);
  }

  plus(other: Money): Money {
    return Money.fromCents(this.cents + other.cents);
  }

  /** Subtrai. Lança se o resultado for negativo — ver nota da classe. */
  minus(other: Money): Money {
    const result = this.cents - other.cents;
    if (result < 0) {
      throw new InvalidAmountError(
        'money',
        result,
        'Subtração resultaria em valor negativo.',
      );
    }
    return new Money(result);
  }

  /** Percentual do valor, arredondado half-up. `percentage(20)` são 20%. */
  percentage(percent: number): Money {
    if (!Number.isFinite(percent) || percent < 0) {
      throw new InvalidAmountError('percent', percent);
    }
    return Money.fromCents(multiplyByRate(this.cents, percent / 100));
  }

  /**
   * Razão entre dois valores, em decimal. Base do LTV: `financiado.ratioTo(imovel)`.
   *
   * Devolve `number` e não `Money` de propósito — a razão entre dois valores
   * monetários é adimensional, não é dinheiro.
   */
  ratioTo(other: Money): number {
    if (other.isZero()) {
      throw new InvalidAmountError('money', other.cents, 'Divisão por zero.');
    }
    return this.cents / other.cents;
  }

  isZero(): boolean {
    return this.cents === 0;
  }

  equals(other: Money): boolean {
    return this.cents === other.cents;
  }

  isGreaterThan(other: Money): boolean {
    return this.cents > other.cents;
  }

  isLessThan(other: Money): boolean {
    return this.cents < other.cents;
  }

  /** Converte para reais. Use apenas na borda de saída, nunca no cálculo. */
  toReais(): number {
    return toReais(this.cents);
  }

  /** Em JSON, um valor monetário é sempre centavos inteiros — nunca float. */
  toJSON(): number {
    return this.cents;
  }

  toString(): string {
    return String(this.cents);
  }
}
