import {
  InvalidMoneyError,
  assertCents,
  divideCents,
  multiplyByRate,
  toCents,
  toReais,
} from './money';

describe('money', () => {
  describe('toCents', () => {
    it('converte reais inteiros', () => {
      expect(toCents(500_000)).toBe(50_000_000);
    });

    it('converte o caso que motiva o arredondamento: 19.99 * 100 é 1998.9999... em IEEE 754', () => {
      expect(19.99 * 100).not.toBe(1999); // documenta o problema
      expect(toCents(19.99)).toBe(1999); // documenta a solução
    });

    it('rejeita valores não finitos', () => {
      expect(() => toCents(Number.NaN)).toThrow(InvalidMoneyError);
      expect(() => toCents(Number.POSITIVE_INFINITY)).toThrow(InvalidMoneyError);
    });
  });

  describe('toReais', () => {
    it('faz o caminho de volta', () => {
      expect(toReais(1999)).toBe(19.99);
    });

    it('rejeita centavos fracionários — indicam vazamento de float no cálculo', () => {
      expect(() => toReais(10.5)).toThrow(InvalidMoneyError);
    });
  });

  describe('assertCents', () => {
    it('aceita inteiro seguro e rejeita fora do intervalo seguro', () => {
      expect(() => assertCents(0)).not.toThrow();
      expect(() => assertCents(-1)).not.toThrow();
      expect(() => assertCents(Number.MAX_SAFE_INTEGER + 1)).toThrow(InvalidMoneyError);
    });
  });

  describe('multiplyByRate', () => {
    it('calcula juros do mês sobre o saldo devedor', () => {
      // R$ 400.000,00 a 0,8% ao mês = R$ 3.200,00
      expect(multiplyByRate(40_000_000, 0.008)).toBe(320_000);
    });

    it('devolve sempre inteiro, mesmo com taxa de muitas casas', () => {
      const juros = multiplyByRate(40_000_000, 0.0064341);
      expect(Number.isInteger(juros)).toBe(true);
      expect(juros).toBe(257_364);
    });

    it('arredonda half-up simetricamente em torno de zero', () => {
      expect(multiplyByRate(100, 0.005)).toBe(1); // 0.5 -> 1
      expect(multiplyByRate(-100, 0.005)).toBe(-1); // -0.5 -> -1, não -0
    });

    it('taxa zero não gera encargo', () => {
      expect(multiplyByRate(40_000_000, 0)).toBe(0);
    });

    it('rejeita taxa não finita e saldo fracionário', () => {
      expect(() => multiplyByRate(40_000_000, Number.NaN)).toThrow(InvalidMoneyError);
      expect(() => multiplyByRate(10.5, 0.008)).toThrow(InvalidMoneyError);
    });
  });

  describe('divideCents', () => {
    it('divide sem resíduo quando é exato', () => {
      expect(divideCents(1200, 12)).toEqual({ base: 100, remainder: 0 });
    });

    it('expõe o resíduo em vez de escondê-lo', () => {
      // R$ 100,00 em 3 parcelas: 33,33 cada, sobra 1 centavo.
      expect(divideCents(10_000, 3)).toEqual({ base: 3333, remainder: 1 });
    });

    it('base * parts + remainder reconstrói o principal exatamente', () => {
      // Propriedade que garante que o saldo devedor fecha em zero na última parcela.
      const principal = 40_000_000;
      for (const parts of [1, 3, 7, 180, 360, 420]) {
        const { base, remainder } = divideCents(principal, parts);
        expect(base * parts + remainder).toBe(principal);
        expect(remainder).toBeGreaterThanOrEqual(0);
        expect(remainder).toBeLessThan(parts);
      }
    });

    it('prazo de 1 mês devolve o principal inteiro', () => {
      expect(divideCents(40_000_000, 1)).toEqual({ base: 40_000_000, remainder: 0 });
    });

    it('rejeita número de parcelas inválido', () => {
      expect(() => divideCents(1000, 0)).toThrow(RangeError);
      expect(() => divideCents(1000, -5)).toThrow(RangeError);
      expect(() => divideCents(1000, 1.5)).toThrow(RangeError);
    });
  });
});
