import { InvalidAmountError } from '../errors/domain-errors';
import { Money } from './money.vo';

describe('Money (value object)', () => {
  describe('construção', () => {
    it('cria a partir de centavos', () => {
      expect(Money.fromCents(12_345).cents).toBe(12_345);
    });

    it('cria a partir de reais, arredondando corretamente', () => {
      expect(Money.fromReais(19.99).cents).toBe(1999);
      expect(Money.fromReais(0).cents).toBe(0);
    });

    it('zero é um valor válido — entrada de 100% zera o financiado', () => {
      expect(Money.zero().cents).toBe(0);
      expect(Money.zero().isZero()).toBe(true);
    });

    it('rejeita valores negativos: não existe imóvel de preço negativo', () => {
      expect(() => Money.fromCents(-1)).toThrow(InvalidAmountError);
      expect(() => Money.fromReais(-0.01)).toThrow(InvalidAmountError);
    });

    it('rejeita centavos fracionários — indicam vazamento de float', () => {
      expect(() => Money.fromCents(10.5)).toThrow(InvalidAmountError);
      expect(() => Money.fromCents(Number.NaN)).toThrow(InvalidAmountError);
    });
  });

  describe('aritmética', () => {
    it('soma e subtrai', () => {
      expect(Money.fromCents(1000).plus(Money.fromCents(500)).cents).toBe(1500);
      expect(Money.fromCents(1000).minus(Money.fromCents(300)).cents).toBe(700);
    });

    it('subtração que resultaria em negativo é erro, não silêncio', () => {
      // Entrada maior que o valor do imóvel cairia aqui. Melhor estourar no domínio
      // do que gerar um principal negativo e uma tabela sem sentido.
      expect(() => Money.fromCents(100).minus(Money.fromCents(101))).toThrow(
        InvalidAmountError,
      );
    });

    it('é imutável: operações devolvem nova instância', () => {
      const original = Money.fromCents(1000);
      original.plus(Money.fromCents(500));
      expect(original.cents).toBe(1000);
    });

    it('aplica percentual com arredondamento half-up', () => {
      // 20% de R$ 500.000,00 = R$ 100.000,00
      expect(Money.fromCents(50_000_000).percentage(20).cents).toBe(10_000_000);
      expect(Money.fromCents(100).percentage(0.5).cents).toBe(1);
    });

    it('rejeita percentual inválido', () => {
      expect(() => Money.fromCents(1000).percentage(-1)).toThrow(InvalidAmountError);
      expect(() => Money.fromCents(1000).percentage(Number.NaN)).toThrow(
        InvalidAmountError,
      );
    });
  });

  describe('comparação', () => {
    const cem = Money.fromCents(100);

    it('compara por valor', () => {
      expect(cem.equals(Money.fromCents(100))).toBe(true);
      expect(cem.equals(Money.fromCents(101))).toBe(false);
    });

    it('ordena', () => {
      expect(cem.isGreaterThan(Money.fromCents(99))).toBe(true);
      expect(cem.isGreaterThan(Money.fromCents(100))).toBe(false);
      expect(cem.isLessThan(Money.fromCents(101))).toBe(true);
      expect(cem.isLessThan(Money.fromCents(100))).toBe(false);
    });

    it('calcula a razão entre dois valores — base do LTV', () => {
      // 400.000 financiados sobre imóvel de 500.000 = 80%
      expect(
        Money.fromCents(40_000_000).ratioTo(Money.fromCents(50_000_000)),
      ).toBeCloseTo(0.8, 10);
    });

    it('razão sobre zero é erro, não Infinity', () => {
      expect(() => Money.fromCents(100).ratioTo(Money.zero())).toThrow(
        InvalidAmountError,
      );
    });
  });

  describe('serialização', () => {
    it('converte para reais na borda de saída', () => {
      expect(Money.fromCents(1999).toReais()).toBe(19.99);
    });

    it('toString devolve os centavos', () => {
      expect(String(Money.fromCents(1999))).toBe('1999');
    });

    it('serializa em JSON como inteiro de centavos, não como float', () => {
      // Preserva a exatidão através da fronteira HTTP: quem consome recebe centavos.
      expect(JSON.stringify({ v: Money.fromCents(1999) })).toBe('{"v":1999}');
    });
  });
});
