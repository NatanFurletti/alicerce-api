import {
  DEFAULT_ELIGIBILITY_POLICY,
  type EligibilityPolicy,
} from '../../domain/policies/eligibility-policy';

/**
 * Monta a política de elegibilidade a partir das variáveis de ambiente.
 *
 * É aqui que a ADR-014 se completa: os limites de mercado entram por configuração e o
 * domínio apenas os recebe. Mudar o LTV máximo em produção é variável de ambiente, não
 * deploy de código.
 *
 * Valores ausentes ou inválidos caem no default de referência em vez de derrubar o
 * boot — diferente dos segredos de JWT, um limite de LTV errado não é falha de
 * segurança, e o default documentado é razoável.
 */
export function loadEligibilityPolicy(
  source: NodeJS.ProcessEnv = process.env,
): EligibilityPolicy {
  return {
    maxLtvPercent: readPercent(
      source.MAX_LTV_PERCENT,
      DEFAULT_ELIGIBILITY_POLICY.maxLtvPercent,
    ),
    maxIncomeCommitmentPercent: readPercent(
      source.MAX_INCOME_COMMITMENT_PERCENT,
      DEFAULT_ELIGIBILITY_POLICY.maxIncomeCommitmentPercent,
    ),
    maxTermMonths: readPositiveInt(
      source.MAX_TERM_MONTHS,
      DEFAULT_ELIGIBILITY_POLICY.maxTermMonths,
    ),
  };
}

function readPercent(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 && value <= 100 ? value : fallback;
}

function readPositiveInt(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}
