import {
  ExtraPaymentExceedsBalanceError,
  ExtraPaymentOutOfRangeError,
  InvalidAmountError,
} from '../errors/domain-errors';
import { applyExtraPayments } from './extra-payment';
import type { Charges, ExtraPayment, ScheduleInput } from './types';

const noCharges: Charges = { mipMonthlyRate: 0, dfiMonthlyRate: 0, adminFeeCents: 0 };

/** R$ 400.000 em 360 meses a 0,8% a.m. — contrato realista. */
const base: ScheduleInput = {
  principal: 40_000_000,
  termMonths: 360,
  monthlyRate: 0.008,
  propertyValue: 50_000_000,
  charges: noCharges,
};

const aporte = (
  month: number,
  amount: number,
  strategy: ExtraPayment['strategy'],
): ExtraPayment => ({ month, amount, strategy });

describe('Amortização extraordinária (SPEC 2.6)', () => {
  describe('REDUCE_TERM — abate o saldo e encurta o prazo', () => {
    const result = applyExtraPayments(base, 'SAC', [
      aporte(13, 5_000_000, 'REDUCE_TERM'),
    ]);

    it('o contrato termina antes do prazo original', () => {
      expect(result.schedule.length).toBeLessThan(360);
      expect(result.summary.monthsSaved).toBe(360 - result.schedule.length);
      expect(result.summary.monthsSaved).toBeGreaterThan(0);
    });

    it('economiza juros em relação ao contrato sem aporte', () => {
      expect(result.summary.interestSaved).toBeGreaterThan(0);
      expect(result.summary.totalInterestWithExtra).toBeLessThan(
        result.summary.totalInterestWithoutExtra,
      );
    });

    it('mantém a amortização mensal do SAC inalterada — é o prazo que muda', () => {
      const semAporte = applyExtraPayments(base, 'SAC', []);
      const antes = semAporte.schedule[0]!.amortization;
      const depois = result.schedule.at(-2)!.amortization;
      expect(depois).toBe(antes);
    });

    it('o aporte aparece na linha do mês em que foi feito', () => {
      const linha = result.schedule.find((e) => e.month === 13)!;
      expect(linha.extraPayment).toBe(5_000_000);
      // O aporte abate saldo além da amortização regular do mês.
      expect(linha.closingBalance).toBe(
        linha.openingBalance - linha.amortization - linha.extraPayment,
      );
    });

    it('o saldo devedor ainda fecha exatamente em zero', () => {
      expect(result.schedule.at(-1)?.closingBalance).toBe(0);
    });
  });

  describe('REDUCE_INSTALLMENT — abate o saldo e recalcula a parcela', () => {
    const result = applyExtraPayments(base, 'PRICE', [
      aporte(13, 5_000_000, 'REDUCE_INSTALLMENT'),
    ]);

    it('o prazo permanece o original', () => {
      expect(result.schedule).toHaveLength(360);
      expect(result.summary.monthsSaved).toBe(0);
    });

    it('a parcela cai a partir do mês do aporte', () => {
      const antes = result.schedule.find((e) => e.month === 12)!.installment;
      const depois = result.schedule.find((e) => e.month === 14)!.installment;
      expect(depois).toBeLessThan(antes);
    });

    it('economiza juros mesmo mantendo o prazo', () => {
      expect(result.summary.interestSaved).toBeGreaterThan(0);
    });

    it('o saldo devedor fecha em zero no fim do prazo', () => {
      expect(result.schedule.at(-1)?.closingBalance).toBe(0);
    });
  });

  describe('comparação entre as estratégias', () => {
    it('REDUCE_TERM economiza mais juros que REDUCE_INSTALLMENT', () => {
      // Mesmo aporte, mesmo mês: encurtar o prazo elimina os juros dos meses finais
      // inteiros, enquanto reduzir a parcela mantém o saldo rendendo por todo o prazo.
      // É a resposta à pergunta que todo cliente faz no balcão.
      const prazo = applyExtraPayments(base, 'SAC', [
        aporte(13, 5_000_000, 'REDUCE_TERM'),
      ]);
      const parcela = applyExtraPayments(base, 'SAC', [
        aporte(13, 5_000_000, 'REDUCE_INSTALLMENT'),
      ]);
      expect(prazo.summary.interestSaved).toBeGreaterThan(parcela.summary.interestSaved);
    });

    it('quanto mais cedo o aporte, maior a economia', () => {
      const cedo = applyExtraPayments(base, 'SAC', [aporte(6, 5_000_000, 'REDUCE_TERM')]);
      const tarde = applyExtraPayments(base, 'SAC', [
        aporte(240, 5_000_000, 'REDUCE_TERM'),
      ]);
      expect(cedo.summary.interestSaved).toBeGreaterThan(tarde.summary.interestSaved);
    });
  });

  describe('múltiplos aportes', () => {
    it('aplica todos, em qualquer ordem de entrada', () => {
      const ordenado = applyExtraPayments(base, 'SAC', [
        aporte(12, 2_000_000, 'REDUCE_TERM'),
        aporte(24, 2_000_000, 'REDUCE_TERM'),
      ]);
      const desordenado = applyExtraPayments(base, 'SAC', [
        aporte(24, 2_000_000, 'REDUCE_TERM'),
        aporte(12, 2_000_000, 'REDUCE_TERM'),
      ]);
      expect(desordenado.schedule).toEqual(ordenado.schedule);
      expect(ordenado.schedule.at(-1)?.closingBalance).toBe(0);
    });

    it('dois aportes economizam mais que um', () => {
      const um = applyExtraPayments(base, 'SAC', [aporte(12, 2_000_000, 'REDUCE_TERM')]);
      const dois = applyExtraPayments(base, 'SAC', [
        aporte(12, 2_000_000, 'REDUCE_TERM'),
        aporte(24, 2_000_000, 'REDUCE_TERM'),
      ]);
      expect(dois.summary.interestSaved).toBeGreaterThan(um.summary.interestSaved);
    });
  });

  describe('casos de borda', () => {
    it('sem aportes, o resultado é idêntico à tabela original', () => {
      const result = applyExtraPayments(base, 'SAC', []);
      expect(result.schedule).toHaveLength(360);
      expect(result.summary.interestSaved).toBe(0);
      expect(result.summary.monthsSaved).toBe(0);
    });

    it('aporte que quita o saldo encerra o contrato naquele mês', () => {
      // Amortização mensal do SAC: 40.000.000 / 360 = 111.111 (resto 40).
      // No mês 2 o saldo de abertura é 40.000.000 - 111.111 = 39.888.889; após a
      // amortização regular do próprio mês 2 restam 39.777.778, que o aporte quita.
      const result = applyExtraPayments(base, 'SAC', [
        aporte(2, 39_777_778, 'REDUCE_TERM'),
      ]);
      expect(result.schedule).toHaveLength(2);
      expect(result.schedule.at(-1)?.closingBalance).toBe(0);
    });

    it('aporte no primeiro mês é válido', () => {
      const result = applyExtraPayments(base, 'SAC', [
        aporte(1, 1_000_000, 'REDUCE_TERM'),
      ]);
      expect(result.schedule[0]?.extraPayment).toBe(1_000_000);
      expect(result.schedule.at(-1)?.closingBalance).toBe(0);
    });

    it('funciona com encargos ativos', () => {
      const comEncargos: ScheduleInput = {
        ...base,
        charges: {
          mipMonthlyRate: 0.00025,
          dfiMonthlyRate: 0.00005,
          adminFeeCents: 2500,
        },
      };
      const result = applyExtraPayments(comEncargos, 'SAC', [
        aporte(13, 5_000_000, 'REDUCE_TERM'),
      ]);
      expect(result.schedule.at(-1)?.closingBalance).toBe(0);
      // Encurtar o prazo elimina meses inteiros de MIP, DFI e taxa administrativa.
      expect(result.summary.chargesSaved).toBeGreaterThan(0);
    });

    it('todos os valores continuam inteiros de centavos', () => {
      const result = applyExtraPayments(base, 'PRICE', [
        aporte(37, 3_333_333, 'REDUCE_INSTALLMENT'),
      ]);
      for (const e of result.schedule) {
        for (const value of Object.values(e)) {
          expect(Number.isInteger(value)).toBe(true);
        }
      }
    });
  });

  describe('validação', () => {
    it('rejeita aporte fora do prazo do contrato', () => {
      expect(() =>
        applyExtraPayments(base, 'SAC', [aporte(0, 1_000_000, 'REDUCE_TERM')]),
      ).toThrow(ExtraPaymentOutOfRangeError);
      expect(() =>
        applyExtraPayments(base, 'SAC', [aporte(361, 1_000_000, 'REDUCE_TERM')]),
      ).toThrow(ExtraPaymentOutOfRangeError);
    });

    it('rejeita valor inválido', () => {
      for (const amount of [0, -100, 1.5]) {
        expect(() =>
          applyExtraPayments(base, 'SAC', [aporte(12, amount, 'REDUCE_TERM')]),
        ).toThrow(InvalidAmountError);
      }
    });

    it('rejeita aporte maior que o saldo devedor do mês', () => {
      expect(() =>
        applyExtraPayments(base, 'SAC', [aporte(12, 99_000_000, 'REDUCE_TERM')]),
      ).toThrow(ExtraPaymentExceedsBalanceError);
    });
  });
});
