import { DEFAULT_ELIGIBILITY_POLICY } from '../../domain/policies/eligibility-policy';
import { loadEligibilityPolicy } from './eligibility-policy.factory';

describe('loadEligibilityPolicy', () => {
  it('usa os defaults de referência quando nada é configurado', () => {
    expect(loadEligibilityPolicy({})).toEqual(DEFAULT_ELIGIBILITY_POLICY);
  });

  it('lê os limites das variáveis de ambiente (ADR-014)', () => {
    // A razão de ser desta factory: mudar o LTV máximo em produção é configuração,
    // não deploy de código.
    expect(
      loadEligibilityPolicy({
        MAX_LTV_PERCENT: '90',
        MAX_INCOME_COMMITMENT_PERCENT: '35',
        MAX_TERM_MONTHS: '480',
      }),
    ).toEqual({
      maxLtvPercent: 90,
      maxIncomeCommitmentPercent: 35,
      maxTermMonths: 480,
    });
  });

  it('cai no default quando o valor é inválido, sem derrubar o boot', () => {
    // Diferente dos segredos de JWT: um limite de LTV errado não é falha de
    // segurança, e o default documentado é razoável.
    for (const invalido of ['abc', '', '0', '-10', '150']) {
      expect(loadEligibilityPolicy({ MAX_LTV_PERCENT: invalido }).maxLtvPercent).toBe(
        DEFAULT_ELIGIBILITY_POLICY.maxLtvPercent,
      );
    }
  });

  it('aceita 100% de LTV — financiamento sem entrada é configuração válida', () => {
    expect(loadEligibilityPolicy({ MAX_LTV_PERCENT: '100' }).maxLtvPercent).toBe(100);
  });

  it('rejeita prazo não inteiro ou não positivo', () => {
    for (const invalido of ['12.5', '0', '-1', 'muitos']) {
      expect(loadEligibilityPolicy({ MAX_TERM_MONTHS: invalido }).maxTermMonths).toBe(
        DEFAULT_ELIGIBILITY_POLICY.maxTermMonths,
      );
    }
  });

  it('aceita percentual fracionário', () => {
    expect(
      loadEligibilityPolicy({ MAX_INCOME_COMMITMENT_PERCENT: '32.5' })
        .maxIncomeCommitmentPercent,
    ).toBe(32.5);
  });
});
