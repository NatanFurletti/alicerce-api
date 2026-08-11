import { CetDidNotConvergeError, InvalidCashFlowError } from '../errors/domain-errors';
import { calculateCet, calculateIrr, netPresentValue } from './cet';
import { buildPriceSchedule } from './price';
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

describe('CET — Custo Efetivo Total (SPEC 2.5)', () => {
  describe('netPresentValue', () => {
    it('a taxa zero, o VPL é a soma simples do fluxo', () => {
      expect(netPresentValue([-1000, 300, 300, 300, 300], 0)).toBeCloseTo(200, 10);
    });

    it('desconta cada período pelo fator correto', () => {
      // -100 + 110/1.1 = 0
      expect(netPresentValue([-100, 110], 0.1)).toBeCloseTo(0, 10);
    });

    it('o VPL decresce conforme a taxa aumenta — base da bissecção', () => {
      const flow = [-10_000, 3000, 3000, 3000, 3000];
      expect(netPresentValue(flow, 0.05)).toBeGreaterThan(netPresentValue(flow, 0.15));
    });
  });

  describe('calculateIrr — casos de resultado conhecido', () => {
    it('empréstimo de 100 pago com 110 em um período: TIR = 10%', () => {
      expect(calculateIrr([-100, 110])).toBeCloseTo(0.1, 10);
    });

    it('fluxo com TIR exata de 1% ao mês', () => {
      // Construído a partir de um Price puro: se a única despesa é o juro
      // contratado, a TIR do fluxo tem de ser a própria taxa de juros.
      const schedule = buildPriceSchedule(base);
      const flow = [-base.principal, ...schedule.map((e) => e.totalPayment)];
      expect(calculateIrr(flow)).toBeCloseTo(0.01, 6);
    });

    it('converge para TIR zero quando se paga exatamente o que se tomou', () => {
      expect(
        calculateIrr([-1200, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100]),
      ).toBeCloseTo(0, 8);
    });

    it('encontra TIR alta sem estourar (fluxo caro)', () => {
      // 1000 emprestados, 12 parcelas de 150 = 1800 pagos.
      const irr = calculateIrr([-1000, ...Array<number>(12).fill(150)]);
      expect(irr).toBeGreaterThan(0.05);
      expect(netPresentValue([-1000, ...Array<number>(12).fill(150)], irr)).toBeCloseTo(
        0,
        6,
      );
    });

    it('o resultado sempre zera o VPL — definição de TIR', () => {
      const flows = [
        [-100, 110],
        [-10_000, 1000, 2000, 3000, 5000],
        [-50_000, ...Array<number>(24).fill(2500)],
      ];
      for (const flow of flows) {
        expect(netPresentValue(flow, calculateIrr(flow))).toBeCloseTo(0, 6);
      }
    });

    it('respeita a tolerância configurada', () => {
      const flow = [-10_000, ...Array<number>(36).fill(350)];
      expect(
        Math.abs(netPresentValue(flow, calculateIrr(flow, { tolerance: 1e-12 }))),
      ).toBeLessThan(1e-6);
    });

    it('lança erro quando o limite de iterações é baixo demais para convergir', () => {
      expect(() =>
        calculateIrr([-1000, ...Array<number>(12).fill(150)], { maxIterations: 1 }),
      ).toThrow(CetDidNotConvergeError);
    });
  });

  describe('fallback de Newton-Raphson para bissecção', () => {
    it('um chute inicial absurdo ainda converge, via bissecção', () => {
      // Newton com chute de 99% a.m. dá um passo para fora do intervalo válido e
      // aborta; a bissecção assume e encontra a raiz assim mesmo. É esse par que
      // torna o cálculo rápido no caso comum e garantido no caso ruim.
      const flow = [-10_000, ...Array<number>(24).fill(500)];
      const irr = calculateIrr(flow, { initialGuess: 0.99 });
      expect(netPresentValue(flow, irr)).toBeCloseTo(0, 6);
    });

    it('chute inicial negativo extremo também converge', () => {
      const flow = [-10_000, ...Array<number>(24).fill(500)];
      const irr = calculateIrr(flow, { initialGuess: -0.98 });
      expect(netPresentValue(flow, irr)).toBeCloseTo(0, 6);
    });

    it('encontra TIR fortemente negativa (prejuízo), que ainda é uma resposta válida', () => {
      // Receber 100.000 e devolver 12 parcelas de 1 é um péssimo negócio para quem
      // emprestou, mas a TIR existe e está dentro do intervalo suportado. O método
      // deve devolvê-la, não falhar.
      const flow = [-100_000, ...Array<number>(12).fill(1)];
      const irr = calculateIrr(flow);
      expect(irr).toBeLessThan(0);
      expect(irr).toBeGreaterThan(-1);
    });

    it('lança erro quando o VPL não troca de sinal no intervalo suportado', () => {
      // Fluxo cujo VPL é positivo em toda a faixa [-99,99%, 100%]: não há raiz a
      // encontrar, e o método precisa dizer isso em vez de devolver lixo.
      expect(() => calculateIrr([-1, 1e12, 1e12])).toThrow(CetDidNotConvergeError);
      expect(() => calculateIrr([-1, 1e12, 1e12])).toThrow(
        /não convergiu em 100 iterações/,
      );
    });
  });

  describe('validação do fluxo de caixa', () => {
    it('rejeita fluxo sem entrada e saída (não há TIR)', () => {
      expect(() => calculateIrr([100, 200, 300])).toThrow(InvalidCashFlowError);
      expect(() => calculateIrr([-100, -200])).toThrow(InvalidCashFlowError);
    });

    it('rejeita fluxo curto demais', () => {
      expect(() => calculateIrr([])).toThrow(InvalidCashFlowError);
      expect(() => calculateIrr([-100])).toThrow(InvalidCashFlowError);
    });

    it('rejeita valores não finitos', () => {
      expect(() => calculateIrr([-100, Number.NaN])).toThrow(InvalidCashFlowError);
    });
  });

  describe('calculateCet — sobre uma tabela de amortização', () => {
    it('sem encargos nem despesas, o CET é a própria taxa de juros', () => {
      const schedule = buildPriceSchedule(base);
      const cet = calculateCet(schedule, base.principal);
      expect(cet.monthlyRate).toBeCloseTo(0.01, 6);
      // Anualizada: (1.01)^12 - 1 = 12,68%
      expect(cet.annualRate).toBeCloseTo(0.126825, 5);
    });

    it('vale para o SAC também', () => {
      const schedule = buildSacSchedule(base);
      const cet = calculateCet(schedule, base.principal);
      expect(cet.monthlyRate).toBeCloseTo(0.01, 6);
    });

    it('COM encargos, o CET é MAIOR que a taxa contratada', () => {
      // Este é o ponto do CET: seguros e taxa administrativa são custo real, e é por
      // isso que o CET é a taxa que o cliente deve comparar entre bancos.
      const withCharges: ScheduleInput = {
        ...base,
        charges: {
          mipMonthlyRate: 0.00025,
          dfiMonthlyRate: 0.00005,
          adminFeeCents: 2500,
        },
      };
      const schedule = buildPriceSchedule(withCharges);
      const cet = calculateCet(schedule, withCharges.principal);
      expect(cet.monthlyRate).toBeGreaterThan(0.01);
      expect(cet.annualRate).toBeGreaterThan(0.126825);
    });

    it('despesas iniciais reduzem o valor líquido liberado e elevam o CET', () => {
      const schedule = buildPriceSchedule(base);
      const semDespesas = calculateCet(schedule, base.principal);
      const comDespesas = calculateCet(schedule, base.principal, {
        upfrontCostsCents: 300_000, // R$ 3.000 de avaliação e registro
      });
      expect(comDespesas.monthlyRate).toBeGreaterThan(semDespesas.monthlyRate);
    });

    it('taxa zero e sem encargos resulta em CET zero', () => {
      const schedule = buildPriceSchedule({ ...base, monthlyRate: 0 });
      const cet = calculateCet(schedule, base.principal);
      expect(cet.monthlyRate).toBeCloseTo(0, 8);
      expect(cet.annualRate).toBeCloseTo(0, 8);
    });

    it('rejeita tabela de amortização vazia', () => {
      expect(() => calculateCet([], 12_000_000)).toThrow(InvalidCashFlowError);
    });

    it('colapsa ruído de ponto flutuante em zero exato', () => {
      // O método numérico chega a -2.18e-17 num contrato sem juros. Sem saneamento,
      // esse "zero negativo" seria propagado como taxa negativa.
      const schedule = buildPriceSchedule({ ...base, monthlyRate: 0 });
      expect(calculateCet(schedule, base.principal).monthlyRate).toBe(0);
      expect(Object.is(calculateCet(schedule, base.principal).monthlyRate, -0)).toBe(
        false,
      );
    });

    it('a anualização é consistente com a taxa mensal encontrada', () => {
      const withCharges: ScheduleInput = {
        ...base,
        principal: 40_000_000,
        termMonths: 360,
        monthlyRate: 0.008,
        charges: {
          mipMonthlyRate: 0.00025,
          dfiMonthlyRate: 0.00005,
          adminFeeCents: 2500,
        },
      };
      const cet = calculateCet(buildSacSchedule(withCharges), withCharges.principal);
      expect(cet.annualRate).toBeCloseTo((1 + cet.monthlyRate) ** 12 - 1, 10);
    });

    it('converge para um contrato longo de 420 meses', () => {
      const long: ScheduleInput = {
        ...base,
        principal: 40_000_000,
        termMonths: 420,
        monthlyRate: 0.0075,
        charges: { mipMonthlyRate: 0.0003, dfiMonthlyRate: 0.00006, adminFeeCents: 2500 },
      };
      const cet = calculateCet(buildSacSchedule(long), long.principal);
      expect(Number.isFinite(cet.monthlyRate)).toBe(true);
      expect(cet.monthlyRate).toBeGreaterThan(0.0075);
    });
  });
});
