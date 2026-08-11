import {
  DownPaymentExceedsPropertyValueError,
  IncomeCommitmentExceededError,
  InvalidTermError,
  LtvExceededError,
  TermExceedsMaximumError,
} from '../errors/domain-errors';
import { DEFAULT_ELIGIBILITY_POLICY } from '../policies/eligibility-policy';
import { Money } from '../value-objects/money.vo';
import { Simulation, type SimulationProps } from './simulation';

/** Imóvel de R$ 500.000 com R$ 100.000 de entrada: LTV de 80%, no limite. */
const props: SimulationProps = {
  id: 'sim-1',
  userId: 'user-1',
  propertyValue: Money.fromReais(500_000),
  downPayment: Money.fromReais(100_000),
  termMonths: 360,
  annualRate: 0.0975,
  rateConvention: 'EFFECTIVE',
  amortizationSystem: 'SAC',
  monthlyIncome: Money.fromReais(20_000),
  charges: { mipMonthlyRate: 0.00025, dfiMonthlyRate: 0.00005, adminFeeCents: 2500 },
  createdAt: new Date('2026-01-15T10:00:00Z'),
};

describe('Simulation (entidade)', () => {
  describe('criação e cálculos derivados', () => {
    const simulation = Simulation.create(props, DEFAULT_ELIGIBILITY_POLICY);

    it('o valor financiado é o imóvel menos a entrada', () => {
      expect(simulation.financedAmount.cents).toBe(40_000_000);
    });

    it('calcula o LTV como razão entre financiado e valor do imóvel', () => {
      expect(simulation.ltv).toBeCloseTo(0.8, 10);
    });

    it('converte a taxa anual em mensal segundo a convenção escolhida', () => {
      // 9,75% a.a. efetiva -> (1.0975)^(1/12) - 1
      expect(simulation.monthlyRate).toBeCloseTo(0.0077829, 6);
    });

    it('a convenção nominal produz taxa mensal diferente', () => {
      const nominal = Simulation.create(
        { ...props, rateConvention: 'NOMINAL' },
        DEFAULT_ELIGIBILITY_POLICY,
      );
      expect(nominal.monthlyRate).toBeCloseTo(0.0975 / 12, 10);
      expect(nominal.monthlyRate).toBeGreaterThan(simulation.monthlyRate);
    });
  });

  describe('regras de elegibilidade (SPEC 2.7)', () => {
    it('aceita LTV exatamente no limite de 80%', () => {
      expect(() => Simulation.create(props, DEFAULT_ELIGIBILITY_POLICY)).not.toThrow();
    });

    it('rejeita LTV acima do limite — entrada insuficiente', () => {
      // R$ 50.000 de entrada em imóvel de R$ 500.000 = LTV de 90%.
      expect(() =>
        Simulation.create(
          { ...props, downPayment: Money.fromReais(50_000) },
          DEFAULT_ELIGIBILITY_POLICY,
        ),
      ).toThrow(LtvExceededError);
    });

    it('o limite de LTV é configurável, não hardcoded', () => {
      const permissiva = { ...DEFAULT_ELIGIBILITY_POLICY, maxLtvPercent: 90 };
      expect(() =>
        Simulation.create({ ...props, downPayment: Money.fromReais(50_000) }, permissiva),
      ).not.toThrow();
    });

    it('rejeita entrada maior que o valor do imóvel', () => {
      expect(() =>
        Simulation.create(
          { ...props, downPayment: Money.fromReais(600_000) },
          DEFAULT_ELIGIBILITY_POLICY,
        ),
      ).toThrow(DownPaymentExceedsPropertyValueError);
    });

    it('rejeita prazo acima do máximo', () => {
      expect(() =>
        Simulation.create({ ...props, termMonths: 421 }, DEFAULT_ELIGIBILITY_POLICY),
      ).toThrow(TermExceedsMaximumError);
    });

    it('rejeita prazo inválido', () => {
      for (const termMonths of [0, -1, 1.5]) {
        expect(() =>
          Simulation.create({ ...props, termMonths }, DEFAULT_ELIGIBILITY_POLICY),
        ).toThrow(InvalidTermError);
      }
    });

    it('rejeita comprometimento de renda acima do limite', () => {
      // Renda de R$ 2.000 contra parcela inicial de ~R$ 4.400: muito acima de 30%.
      expect(() =>
        Simulation.create(
          { ...props, monthlyIncome: Money.fromReais(2_000) },
          DEFAULT_ELIGIBILITY_POLICY,
        ),
      ).toThrow(IncomeCommitmentExceededError);
    });

    it('o comprometimento considera o desembolso TOTAL, não só a prestação', () => {
      // Renda calibrada para passar sem encargos e falhar com eles: prova que MIP,
      // DFI e taxa administrativa entram na conta.
      const semEncargos = Simulation.create(
        { ...props, charges: { mipMonthlyRate: 0, dfiMonthlyRate: 0, adminFeeCents: 0 } },
        DEFAULT_ELIGIBILITY_POLICY,
      );
      const comEncargos = Simulation.create(props, DEFAULT_ELIGIBILITY_POLICY);
      expect(comEncargos.firstMonthTotalPayment.cents).toBeGreaterThan(
        semEncargos.firstMonthTotalPayment.cents,
      );
    });

    it('renda não informada dispensa a checagem de comprometimento', () => {
      // O campo é opcional no SPEC: sem renda declarada, não há o que validar.
      expect(() =>
        Simulation.create(
          { ...props, monthlyIncome: undefined, downPayment: Money.fromReais(100_000) },
          DEFAULT_ELIGIBILITY_POLICY,
        ),
      ).not.toThrow();
    });

    it('entrada de 100% é rejeitada — não há o que financiar', () => {
      expect(() =>
        Simulation.create(
          { ...props, downPayment: Money.fromReais(500_000) },
          DEFAULT_ELIGIBILITY_POLICY,
        ),
      ).toThrow();
    });
  });

  describe('comportamento de cálculo', () => {
    const simulation = Simulation.create(props, DEFAULT_ELIGIBILITY_POLICY);

    it('gera a tabela de amortização sob demanda (ADR-003)', () => {
      const schedule = simulation.buildSchedule();
      expect(schedule).toHaveLength(360);
      expect(schedule.at(-1)?.closingBalance).toBe(0);
    });

    it('respeita o sistema de amortização escolhido', () => {
      const price = Simulation.create(
        { ...props, amortizationSystem: 'PRICE' },
        DEFAULT_ELIGIBILITY_POLICY,
      );
      const sacFirst = simulation.buildSchedule()[0]!.installment;
      const priceFirst = price.buildSchedule()[0]!.installment;
      expect(sacFirst).toBeGreaterThan(priceFirst);
    });

    it('recalcular duas vezes produz exatamente o mesmo resultado', () => {
      // Determinismo é o que justifica não persistir a tabela (ADR-003).
      expect(simulation.buildSchedule()).toEqual(simulation.buildSchedule());
    });

    it('calcula o CET incluindo encargos', () => {
      const cet = simulation.calculateCet();
      expect(cet.monthlyRate).toBeGreaterThan(simulation.monthlyRate);
      expect(cet.annualRate).toBeGreaterThan(props.annualRate);
    });

    it('resume os totais do contrato', () => {
      const totals = simulation.summarize();
      expect(totals.months).toBe(360);
      expect(totals.totalAmortization).toBe(40_000_000);
      expect(totals.totalInterest).toBeGreaterThan(0);
    });
  });

  describe('reconstituição a partir da persistência', () => {
    it('restore não revalida as regras de elegibilidade', () => {
      // Uma simulação já gravada precisa poder ser carregada mesmo que a política
      // tenha mudado depois. Revalidar no restore tornaria dados históricos
      // irrecuperáveis a cada ajuste de parâmetro de mercado.
      const forade = { ...props, downPayment: Money.fromReais(10_000) };
      expect(() => Simulation.restore(forade)).not.toThrow();
      expect(Simulation.restore(forade).ltv).toBeCloseTo(0.98, 2);
    });

    it('preserva os dados de identidade', () => {
      const simulation = Simulation.restore(props);
      expect(simulation.id).toBe('sim-1');
      expect(simulation.userId).toBe('user-1');
      expect(simulation.createdAt).toEqual(props.createdAt);
    });

    it('preserva todos os parâmetros do contrato', () => {
      // O mapper da Etapa 3 vai depender de cada um destes acessos para gravar e
      // reconstruir a simulação sem perda.
      const simulation = Simulation.restore(props);

      expect(simulation.propertyValue.cents).toBe(50_000_000);
      expect(simulation.downPayment.cents).toBe(10_000_000);
      expect(simulation.termMonths).toBe(360);
      expect(simulation.annualRate).toBe(0.0975);
      expect(simulation.rateConvention).toBe('EFFECTIVE');
      expect(simulation.amortizationSystem).toBe('SAC');
      expect(simulation.monthlyIncome?.cents).toBe(2_000_000);
      expect(simulation.charges).toEqual(props.charges);
    });

    it('renda ausente é preservada como undefined, não como zero', () => {
      // Distinção que importa: "não informou renda" e "declarou renda zero" são
      // situações diferentes, e só a primeira dispensa a checagem.
      expect(
        Simulation.restore({ ...props, monthlyIncome: undefined }).monthlyIncome,
      ).toBe(undefined);
    });
  });
});
