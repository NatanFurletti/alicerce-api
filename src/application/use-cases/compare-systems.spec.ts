import { LtvExceededError } from '../../domain/errors/domain-errors';
import { DEFAULT_ELIGIBILITY_POLICY } from '../../domain/policies/eligibility-policy';
import { CompareSystemsUseCase, type CompareSystemsInput } from './compare-systems';

const input: CompareSystemsInput = {
  propertyValueCents: 50_000_000,
  downPaymentCents: 10_000_000,
  termMonths: 360,
  annualRate: 0.0975,
  rateConvention: 'EFFECTIVE',
  charges: { mipMonthlyRate: 0.00025, dfiMonthlyRate: 0.00005, adminFeeCents: 2500 },
};

describe('CompareSystemsUseCase', () => {
  const useCase = new CompareSystemsUseCase(DEFAULT_ELIGIBILITY_POLICY);

  it('devolve os dois sistemas para os mesmos parâmetros', () => {
    const result = useCase.execute(input);

    expect(result.sac.system).toBe('SAC');
    expect(result.price.system).toBe('PRICE');
    expect(result.financedAmountCents).toBe(40_000_000);
    expect(result.sac.summary.months).toBe(360);
    expect(result.price.summary.months).toBe(360);
  });

  it('SAC começa mais caro e termina mais barato que o Price', () => {
    const result = useCase.execute(input);

    expect(result.sac.firstInstallmentCents).toBeGreaterThan(
      result.price.firstInstallmentCents,
    );
    expect(result.sac.lastInstallmentCents).toBeLessThan(
      result.price.lastInstallmentCents,
    );
  });

  it('Price custa mais juros no total, e a diferença é positiva', () => {
    const result = useCase.execute(input);

    expect(result.price.summary.totalInterest).toBeGreaterThan(
      result.sac.summary.totalInterest,
    );
    expect(result.interestDifferenceCents).toBe(
      result.price.summary.totalInterest - result.sac.summary.totalInterest,
    );
    expect(result.interestDifferenceCents).toBeGreaterThan(0);
  });

  it('os dois amortizam exatamente o mesmo principal', () => {
    const result = useCase.execute(input);

    expect(result.sac.summary.totalAmortization).toBe(40_000_000);
    expect(result.price.summary.totalAmortization).toBe(40_000_000);
  });

  it('calcula CET para ambos, sempre acima da taxa contratada', () => {
    const result = useCase.execute(input);

    expect(result.sac.cet.annualRate).toBeGreaterThan(input.annualRate);
    expect(result.price.cet.annualRate).toBeGreaterThan(input.annualRate);
  });

  it('aplica as regras de elegibilidade também na comparação', () => {
    expect(() => useCase.execute({ ...input, downPaymentCents: 1_000_000 })).toThrow(
      LtvExceededError,
    );
  });

  it('aceita comparação com renda declarada, aplicando o comprometimento', () => {
    // Com renda alta passa; com renda baixa o limite de 30% reprova a comparação
    // inteira, e não apenas um dos sistemas.
    expect(() =>
      useCase.execute({ ...input, monthlyIncomeCents: 3_000_000 }),
    ).not.toThrow();
    expect(() => useCase.execute({ ...input, monthlyIncomeCents: 200_000 })).toThrow();
  });

  it('não depende de repositório — nada é persistido', () => {
    // O construtor recebe apenas a política: é impossível este caso de uso escrever
    // no banco, e isso é garantido pelo tipo, não por disciplina.
    expect(useCase.execute(input).sac.summary.totalInterest).toBeGreaterThan(0);
  });
});
