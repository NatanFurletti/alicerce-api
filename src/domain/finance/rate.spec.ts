import { InvalidRateError } from '../errors/domain-errors';
import { annualToMonthlyRate, monthlyToAnnualRate } from './rate';

describe('conversão de taxa (SPEC 2.1)', () => {
  describe('EFFECTIVE — taxa efetiva equivalente: (1 + i_a)^(1/12) - 1', () => {
    it('converte 12% a.a. para ~0,9489% a.m.', () => {
      // 1.12^(1/12) - 1 = 0.00948879...
      expect(annualToMonthlyRate(0.12, 'EFFECTIVE')).toBeCloseTo(0.0094888, 7);
    });

    it('capitaliza de volta exatamente para a taxa anual — é o que "equivalente" significa', () => {
      const annual = 0.0975;
      const monthly = annualToMonthlyRate(annual, 'EFFECTIVE');
      expect((1 + monthly) ** 12 - 1).toBeCloseTo(annual, 12);
    });

    it('taxa zero permanece zero', () => {
      expect(annualToMonthlyRate(0, 'EFFECTIVE')).toBe(0);
    });
  });

  describe('NOMINAL — taxa nominal linear: i_a / 12', () => {
    it('converte 12% a.a. para exatamente 1% a.m.', () => {
      expect(annualToMonthlyRate(0.12, 'NOMINAL')).toBeCloseTo(0.01, 12);
    });

    it('taxa zero permanece zero', () => {
      expect(annualToMonthlyRate(0, 'NOMINAL')).toBe(0);
    });
  });

  describe('diferença entre as convenções', () => {
    it('a nominal é sempre maior que a efetiva para taxa positiva', () => {
      // Consequência de juros compostos: dividir por 12 ignora a capitalização.
      // É por isso que a convenção precisa ser explícita no contrato.
      for (const annual of [0.05, 0.0975, 0.12, 0.2]) {
        expect(annualToMonthlyRate(annual, 'NOMINAL')).toBeGreaterThan(
          annualToMonthlyRate(annual, 'EFFECTIVE'),
        );
      }
    });

    it('a nominal de 12% a.a. capitalizada dá 12,68% a.a., não 12%', () => {
      const monthly = annualToMonthlyRate(0.12, 'NOMINAL');
      expect((1 + monthly) ** 12 - 1).toBeCloseTo(0.126825, 6);
    });
  });

  describe('validação', () => {
    it('rejeita taxa negativa', () => {
      expect(() => annualToMonthlyRate(-0.01, 'EFFECTIVE')).toThrow(InvalidRateError);
      expect(() => annualToMonthlyRate(-0.01, 'NOMINAL')).toThrow(InvalidRateError);
    });

    it('rejeita valores não finitos', () => {
      expect(() => annualToMonthlyRate(Number.NaN, 'EFFECTIVE')).toThrow(
        InvalidRateError,
      );
      expect(() => annualToMonthlyRate(Number.POSITIVE_INFINITY, 'NOMINAL')).toThrow(
        InvalidRateError,
      );
    });
  });

  describe('monthlyToAnnualRate — usada para anualizar o CET', () => {
    it('é a inversa da conversão efetiva', () => {
      const monthly = annualToMonthlyRate(0.0975, 'EFFECTIVE');
      expect(monthlyToAnnualRate(monthly)).toBeCloseTo(0.0975, 12);
    });

    it('anualiza 1% a.m. em 12,68% a.a.', () => {
      expect(monthlyToAnnualRate(0.01)).toBeCloseTo(0.126825, 6);
    });

    it('taxa zero permanece zero', () => {
      expect(monthlyToAnnualRate(0)).toBe(0);
    });
  });
});
