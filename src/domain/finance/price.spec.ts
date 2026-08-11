import {
  InvalidPrincipalError,
  InvalidRateError,
  InvalidTermError,
} from '../errors/domain-errors';
import { buildPriceSchedule, calculatePmt } from './price';
import { buildSacSchedule } from './sac';
import type { Charges, ScheduleInput } from './types';

const noCharges: Charges = { mipMonthlyRate: 0, dfiMonthlyRate: 0, adminFeeCents: 0 };

const base: ScheduleInput = {
  principal: 12_000_000,
  termMonths: 12,
  monthlyRate: 0.01,
  propertyValue: 20_000_000,
  charges: noCharges,
};

describe('Price — Sistema Francês (SPEC 2.3)', () => {
  describe('calculatePmt — PMT = PV × [i(1+i)^n] / [(1+i)^n - 1]', () => {
    it('R$ 120.000 / 12 meses / 1% a.m. = R$ 10.661,85', () => {
      // Verificável em qualquer planilha: PGTO(1%; 12; -120000) = 10661.8514...
      expect(calculatePmt(12_000_000, 12, 0.01)).toBe(1_066_185);
    });

    it('R$ 400.000 / 360 meses / 0,8% a.m. = R$ 3.392,64', () => {
      // PGTO(0,8%; 360; -400000) = 3392.639882... -> half-up em centavos.
      expect(calculatePmt(40_000_000, 360, 0.008)).toBe(339_264);
    });

    it('CASO DE BORDA OBRIGATÓRIO: taxa zero não pode dividir por zero', () => {
      // A fórmula geral teria denominador (1+0)^n - 1 = 0.
      // Com o tratamento explícito: PMT = PV / n = 120.000 / 12 = 10.000.
      expect(calculatePmt(12_000_000, 12, 0)).toBe(1_000_000);
      expect(Number.isFinite(calculatePmt(12_000_000, 12, 0))).toBe(true);
    });

    it('prazo de 1 mês: PMT é principal + juros do único mês', () => {
      expect(calculatePmt(12_000_000, 1, 0.01)).toBe(12_120_000);
    });

    it('rejeita entradas inválidas', () => {
      expect(() => calculatePmt(0, 12, 0.01)).toThrow(InvalidPrincipalError);
      expect(() => calculatePmt(12_000_000, 0, 0.01)).toThrow(InvalidTermError);
      expect(() => calculatePmt(12_000_000, 12, -0.01)).toThrow(InvalidRateError);
    });
  });

  describe('caso conferível à mão: R$ 120.000 / 12 meses / 1% a.m.', () => {
    const schedule = buildPriceSchedule(base);

    it('gera uma linha por mês', () => {
      expect(schedule).toHaveLength(12);
    });

    it('a parcela é constante em todos os meses, exceto o ajuste da última', () => {
      for (let k = 0; k < 11; k += 1) {
        expect(schedule[k]!.installment).toBe(1_066_185);
      }
    });

    it('primeira parcela: juros 1.200,00 e amortização 9.461,85', () => {
      const first = schedule[0];
      expect(first?.interest).toBe(120_000);
      expect(first?.amortization).toBe(946_185);
    });

    it('a amortização cresce e os juros decrescem — assinatura do Price', () => {
      for (let k = 1; k < schedule.length; k += 1) {
        expect(schedule[k]!.amortization).toBeGreaterThan(schedule[k - 1]!.amortization);
        expect(schedule[k]!.interest).toBeLessThan(schedule[k - 1]!.interest);
      }
    });
  });

  describe('política de resíduo: a última parcela fecha a conta', () => {
    it('o saldo devedor termina exatamente em zero', () => {
      for (const termMonths of [1, 7, 13, 180, 360, 420]) {
        const schedule = buildPriceSchedule({
          ...base,
          principal: 40_000_033,
          termMonths,
        });
        expect(schedule.at(-1)?.closingBalance).toBe(0);
      }
    });

    it('a soma das amortizações é exatamente o principal', () => {
      for (const termMonths of [7, 13, 360, 420]) {
        const schedule = buildPriceSchedule({
          ...base,
          principal: 40_000_033,
          termMonths,
        });
        const total = schedule.reduce((sum, e) => sum + e.amortization, 0);
        expect(total).toBe(40_000_033);
      }
    });

    it('o ajuste da última parcela é desprezível em termos relativos (< 1% do PMT)', () => {
      // Não são "alguns centavos": arredondar o PMT em até meio centavo por mês e
      // deixar esse desvio render juros por 360 meses acumula ~R$ 13,00 num contrato
      // de R$ 400 mil. Isso é o custo real de trabalhar em centavos inteiros, não um
      // defeito. O que precisa ser garantido é que o desvio seja limitado e
      // proporcionalmente irrelevante — daí a asserção ser relativa, não absoluta.
      for (const termMonths of [12, 120, 360, 420]) {
        const schedule = buildPriceSchedule({
          ...base,
          principal: 40_000_033,
          termMonths,
        });
        const regular = schedule[0]!.installment;
        const last = schedule.at(-1)!.installment;
        expect(Math.abs(last - regular) / regular).toBeLessThan(0.01);
      }
    });

    it('a última amortização quita exatamente o saldo de abertura dela', () => {
      const schedule = buildPriceSchedule({
        ...base,
        principal: 40_000_033,
        termMonths: 97,
      });
      const last = schedule.at(-1)!;
      expect(last.amortization).toBe(last.openingBalance);
    });
  });

  describe('invariantes estruturais', () => {
    it('encadeamento de saldos entre meses consecutivos', () => {
      const schedule = buildPriceSchedule({
        ...base,
        principal: 40_000_033,
        termMonths: 36,
      });
      for (let k = 1; k < schedule.length; k += 1) {
        expect(schedule[k]!.openingBalance).toBe(schedule[k - 1]!.closingBalance);
      }
    });

    it('todo valor monetário é inteiro de centavos', () => {
      const schedule = buildPriceSchedule({
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

    it('o saldo devedor nunca fica negativo', () => {
      const schedule = buildPriceSchedule({
        ...base,
        principal: 40_000_033,
        termMonths: 420,
      });
      expect(schedule.every((e) => e.closingBalance >= 0)).toBe(true);
    });
  });

  describe('casos de borda', () => {
    it('taxa zero: parcela é principal / n e não há juros', () => {
      const schedule = buildPriceSchedule({ ...base, monthlyRate: 0 });
      expect(schedule.every((e) => e.interest === 0)).toBe(true);
      expect(schedule[0]?.installment).toBe(1_000_000);
      expect(schedule.at(-1)?.closingBalance).toBe(0);
    });

    it('taxa zero em Price e SAC produzem exatamente a mesma tabela', () => {
      // Sem juros, os dois sistemas degeneram para "principal dividido em n".
      const price = buildPriceSchedule({
        ...base,
        monthlyRate: 0,
        principal: 10_000_001,
      });
      const sac = buildSacSchedule({ ...base, monthlyRate: 0, principal: 10_000_001 });
      expect(price).toEqual(sac);
    });

    it('prazo de 1 mês quita tudo', () => {
      const schedule = buildPriceSchedule({ ...base, termMonths: 1 });
      expect(schedule).toHaveLength(1);
      expect(schedule[0]?.amortization).toBe(12_000_000);
      expect(schedule[0]?.closingBalance).toBe(0);
    });
  });

  describe('comparação SAC × Price — para o endpoint /compare', () => {
    it('Price cobra mais juros no total que o SAC, para os mesmos parâmetros', () => {
      const input = {
        ...base,
        principal: 40_000_000,
        termMonths: 360,
        monthlyRate: 0.008,
      };
      const sacInterest = buildSacSchedule(input).reduce((s, e) => s + e.interest, 0);
      const priceInterest = buildPriceSchedule(input).reduce((s, e) => s + e.interest, 0);
      // O SAC amortiza mais rápido no início, então o saldo que gera juros cai antes.
      expect(priceInterest).toBeGreaterThan(sacInterest);
    });

    it('a primeira parcela do SAC é maior que a do Price', () => {
      const input = {
        ...base,
        principal: 40_000_000,
        termMonths: 360,
        monthlyRate: 0.008,
      };
      expect(buildSacSchedule(input)[0]!.installment).toBeGreaterThan(
        buildPriceSchedule(input)[0]!.installment,
      );
    });
  });

  describe('encargos', () => {
    const withCharges: ScheduleInput = {
      ...base,
      charges: { mipMonthlyRate: 0.00025, dfiMonthlyRate: 0.00005, adminFeeCents: 2500 },
    };

    it('MIP decresce com o saldo e DFI permanece constante', () => {
      const schedule = buildPriceSchedule(withCharges);
      expect(schedule[0]?.mip).toBe(3000);
      expect(schedule.at(-1)!.mip).toBeLessThan(schedule[0]!.mip);
      expect(schedule.every((e) => e.dfi === 1000)).toBe(true);
    });

    it('o desembolso total NÃO é constante, mesmo com parcela fixa', () => {
      // Detalhe que o cliente sente no boleto: a prestação é fixa, o pagamento não,
      // porque o MIP acompanha o saldo devedor.
      const schedule = buildPriceSchedule(withCharges);
      expect(schedule.at(-1)!.totalPayment).toBeLessThan(schedule[0]!.totalPayment);
    });
  });
});
