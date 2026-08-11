import {
  InvalidPrincipalError,
  InvalidRateError,
  InvalidTermError,
} from '../errors/domain-errors';
import { buildSacSchedule } from './sac';
import type { Charges, ScheduleInput } from './types';

const noCharges: Charges = {
  mipMonthlyRate: 0,
  dfiMonthlyRate: 0,
  adminFeeCents: 0,
};

/** R$ 120.000,00 em 12 meses a 1% a.m., sem encargos — números redondos, conferíveis à mão. */
const base: ScheduleInput = {
  principal: 12_000_000,
  termMonths: 12,
  monthlyRate: 0.01,
  propertyValue: 20_000_000,
  charges: noCharges,
};

describe('SAC — Sistema de Amortização Constante (SPEC 2.2)', () => {
  describe('caso conferível à mão: R$ 120.000 / 12 meses / 1% a.m.', () => {
    const schedule = buildSacSchedule(base);

    it('gera uma linha por mês do prazo', () => {
      expect(schedule).toHaveLength(12);
      expect(schedule[0]?.month).toBe(1);
      expect(schedule[11]?.month).toBe(12);
    });

    it('amortização é constante: 120.000 / 12 = R$ 10.000,00', () => {
      for (const entry of schedule) {
        expect(entry.amortization).toBe(1_000_000);
      }
    });

    it('primeira parcela: juros = 120.000 × 1% = R$ 1.200, total R$ 11.200', () => {
      const first = schedule[0];
      expect(first?.openingBalance).toBe(12_000_000);
      expect(first?.interest).toBe(120_000);
      expect(first?.installment).toBe(1_120_000);
      expect(first?.closingBalance).toBe(11_000_000);
    });

    it('última parcela: juros = 10.000 × 1% = R$ 100, total R$ 10.100', () => {
      const last = schedule[11];
      expect(last?.openingBalance).toBe(1_000_000);
      expect(last?.interest).toBe(10_000);
      expect(last?.installment).toBe(1_010_000);
    });

    it('a parcela decresce mês a mês — é a assinatura do SAC', () => {
      for (let k = 1; k < schedule.length; k += 1) {
        expect(schedule[k]!.installment).toBeLessThan(schedule[k - 1]!.installment);
      }
    });

    it('juros totais: soma de PA de 1.200 a 100 = R$ 7.800,00', () => {
      const total = schedule.reduce((sum, e) => sum + e.interest, 0);
      expect(total).toBe(780_000);
    });
  });

  describe('invariantes estruturais', () => {
    it('o saldo devedor fecha exatamente em zero na última parcela', () => {
      // Inclui prazos que NÃO dividem o principal de forma exata.
      for (const termMonths of [1, 7, 13, 180, 360, 420]) {
        const schedule = buildSacSchedule({ ...base, principal: 40_000_033, termMonths });
        expect(schedule.at(-1)?.closingBalance).toBe(0);
      }
    });

    it('a soma das amortizações é exatamente o principal', () => {
      for (const termMonths of [1, 7, 13, 360, 420]) {
        const schedule = buildSacSchedule({ ...base, principal: 40_000_033, termMonths });
        const total = schedule.reduce((sum, e) => sum + e.amortization, 0);
        expect(total).toBe(40_000_033);
      }
    });

    it('o saldo de abertura de um mês é o saldo de fechamento do anterior', () => {
      const schedule = buildSacSchedule({
        ...base,
        principal: 40_000_033,
        termMonths: 36,
      });
      for (let k = 1; k < schedule.length; k += 1) {
        expect(schedule[k]!.openingBalance).toBe(schedule[k - 1]!.closingBalance);
      }
    });

    it('todo valor monetário é inteiro de centavos', () => {
      const schedule = buildSacSchedule({
        ...base,
        principal: 40_000_033,
        termMonths: 37,
      });
      for (const e of schedule) {
        for (const value of Object.values(e)) {
          expect(Number.isInteger(value)).toBe(true);
        }
      }
    });

    it('o resíduo é absorvido na última parcela, não distribuído', () => {
      // 100.000,01 em 3 meses: base 3.333.333, resíduo 2 centavos na última.
      const schedule = buildSacSchedule({
        ...base,
        principal: 10_000_001,
        termMonths: 3,
      });
      expect(schedule[0]?.amortization).toBe(3_333_333);
      expect(schedule[1]?.amortization).toBe(3_333_333);
      expect(schedule[2]?.amortization).toBe(3_333_335);
      expect(schedule.at(-1)?.closingBalance).toBe(0);
    });
  });

  describe('casos de borda', () => {
    it('taxa zero: parcela é só amortização e não há juros', () => {
      const schedule = buildSacSchedule({ ...base, monthlyRate: 0 });
      expect(schedule.every((e) => e.interest === 0)).toBe(true);
      expect(schedule[0]?.installment).toBe(1_000_000);
      expect(schedule.at(-1)?.closingBalance).toBe(0);
    });

    it('prazo de 1 mês: quita tudo de uma vez', () => {
      const schedule = buildSacSchedule({ ...base, termMonths: 1 });
      expect(schedule).toHaveLength(1);
      expect(schedule[0]?.amortization).toBe(12_000_000);
      expect(schedule[0]?.interest).toBe(120_000);
      expect(schedule[0]?.closingBalance).toBe(0);
    });

    it('prazo máximo de 420 meses permanece consistente', () => {
      const schedule = buildSacSchedule({
        ...base,
        principal: 40_000_000,
        termMonths: 420,
      });
      expect(schedule).toHaveLength(420);
      expect(schedule.at(-1)?.closingBalance).toBe(0);
    });
  });

  describe('encargos (SPEC 2.4)', () => {
    const withCharges: ScheduleInput = {
      ...base,
      charges: {
        mipMonthlyRate: 0.00025,
        dfiMonthlyRate: 0.00005,
        adminFeeCents: 2500,
      },
    };

    it('MIP incide sobre o saldo de abertura, portanto é decrescente', () => {
      const schedule = buildSacSchedule(withCharges);
      // 120.000,00 × 0,00025 = R$ 30,00
      expect(schedule[0]?.mip).toBe(3000);
      for (let k = 1; k < schedule.length; k += 1) {
        expect(schedule[k]!.mip).toBeLessThan(schedule[k - 1]!.mip);
      }
      // Na última parcela ainda há MIP: 10.000,00 × 0,00025 = R$ 2,50
      expect(schedule.at(-1)?.mip).toBe(250);
    });

    it('DFI incide sobre o valor do imóvel, portanto é constante', () => {
      const schedule = buildSacSchedule(withCharges);
      // 200.000,00 × 0,00005 = R$ 10,00
      expect(schedule.every((e) => e.dfi === 1000)).toBe(true);
    });

    it('taxa de administração é fixa', () => {
      const schedule = buildSacSchedule(withCharges);
      expect(schedule.every((e) => e.adminFee === 2500)).toBe(true);
    });

    it('totalPayment soma prestação e encargos', () => {
      const first = buildSacSchedule(withCharges)[0]!;
      expect(first.totalPayment).toBe(
        first.installment + first.mip + first.dfi + first.adminFee,
      );
      expect(first.totalPayment).toBe(1_120_000 + 3000 + 1000 + 2500);
    });

    it('encargos não afetam o saldo devedor — não são amortização', () => {
      const semEncargos = buildSacSchedule(base);
      const comEncargos = buildSacSchedule(withCharges);
      for (let k = 0; k < semEncargos.length; k += 1) {
        expect(comEncargos[k]!.closingBalance).toBe(semEncargos[k]!.closingBalance);
      }
    });
  });

  describe('validação de entrada', () => {
    it('rejeita principal zero ou negativo', () => {
      expect(() => buildSacSchedule({ ...base, principal: 0 })).toThrow(
        InvalidPrincipalError,
      );
      expect(() => buildSacSchedule({ ...base, principal: -1 })).toThrow(
        InvalidPrincipalError,
      );
    });

    it('rejeita prazo inválido', () => {
      for (const termMonths of [0, -12, 1.5]) {
        expect(() => buildSacSchedule({ ...base, termMonths })).toThrow(InvalidTermError);
      }
    });

    it('rejeita taxa negativa', () => {
      expect(() => buildSacSchedule({ ...base, monthlyRate: -0.01 })).toThrow(
        InvalidRateError,
      );
    });
  });
});
