import { InvalidAmountError, InvalidRateError } from '../errors/domain-errors';
import { buildPriceSchedule } from './price';
import { buildSacSchedule } from './sac';
import { assertValidScheduleInput, summarizeSchedule } from './schedule-common';
import type { ScheduleInput } from './types';

const input: ScheduleInput = {
  principal: 12_000_000,
  termMonths: 12,
  monthlyRate: 0.01,
  propertyValue: 20_000_000,
  charges: { mipMonthlyRate: 0.00025, dfiMonthlyRate: 0.00005, adminFeeCents: 2500 },
};

describe('summarizeSchedule', () => {
  it('soma juros, encargos e desembolso de uma tabela SAC', () => {
    const totals = summarizeSchedule(buildSacSchedule(input));

    expect(totals.months).toBe(12);
    expect(totals.totalInterest).toBe(780_000);
    expect(totals.totalAmortization).toBe(12_000_000);
    expect(totals.totalDfi).toBe(12 * 1000);
    expect(totals.totalAdminFee).toBe(12 * 2500);
    expect(totals.totalMip).toBeGreaterThan(0);
  });

  it('totalPaid é a soma de amortização, juros e todos os encargos', () => {
    const totals = summarizeSchedule(buildPriceSchedule(input));

    expect(totals.totalPaid).toBe(
      totals.totalAmortization +
        totals.totalInterest +
        totals.totalMip +
        totals.totalDfi +
        totals.totalAdminFee,
    );
  });

  it('a amortização total é sempre o principal, nos dois sistemas', () => {
    expect(summarizeSchedule(buildSacSchedule(input)).totalAmortization).toBe(12_000_000);
    expect(summarizeSchedule(buildPriceSchedule(input)).totalAmortization).toBe(
      12_000_000,
    );
  });

  it('inclui o aporte extraordinário na amortização total', () => {
    // O aporte abate principal, portanto conta como amortização — do contrário a
    // soma não fecharia no principal em contratos com aporte.
    const schedule = buildSacSchedule(input).map((entry, i) =>
      i === 0 ? { ...entry, extraPayment: 500_000 } : entry,
    );
    expect(summarizeSchedule(schedule).totalAmortization).toBe(12_000_000 + 500_000);
  });

  it('tabela vazia devolve zeros', () => {
    expect(summarizeSchedule([])).toEqual({
      totalInterest: 0,
      totalAmortization: 0,
      totalMip: 0,
      totalDfi: 0,
      totalAdminFee: 0,
      totalPaid: 0,
      months: 0,
    });
  });
});

describe('assertValidScheduleInput — guardas compartilhadas por SAC e Price', () => {
  it('rejeita valor do imóvel inválido — é a base do DFI', () => {
    expect(() => assertValidScheduleInput({ ...input, propertyValue: -1 })).toThrow(
      InvalidAmountError,
    );
    expect(() => assertValidScheduleInput({ ...input, propertyValue: 10.5 })).toThrow(
      InvalidAmountError,
    );
  });

  it('rejeita alíquota de MIP inválida', () => {
    for (const mipMonthlyRate of [-0.001, Number.NaN]) {
      expect(() =>
        assertValidScheduleInput({
          ...input,
          charges: { ...input.charges, mipMonthlyRate },
        }),
      ).toThrow(InvalidRateError);
    }
  });

  it('rejeita alíquota de DFI inválida', () => {
    expect(() =>
      assertValidScheduleInput({
        ...input,
        charges: { ...input.charges, dfiMonthlyRate: -0.001 },
      }),
    ).toThrow(InvalidRateError);
  });

  it('rejeita taxa de administração inválida', () => {
    for (const adminFeeCents of [-100, 25.5]) {
      expect(() =>
        assertValidScheduleInput({
          ...input,
          charges: { ...input.charges, adminFeeCents },
        }),
      ).toThrow(InvalidAmountError);
    }
  });

  it('aceita entrada válida sem lançar', () => {
    expect(() => assertValidScheduleInput(input)).not.toThrow();
  });
});
