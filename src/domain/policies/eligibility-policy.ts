/**
 * Limites de elegibilidade do financiamento (SPEC 2.7).
 *
 * **São parâmetros, não fatos.** O CLAUDE.md é explícito: teto do SFH, limite de
 * comprometimento de renda e LTV máximo variam por instituição, por programa e ao
 * longo do tempo. Hardcodar como constante do domínio seria afirmar que são
 * regulação — e amanhã estariam errados, silenciosamente.
 *
 * Por isso a política é um objeto que o caso de uso recebe, com os defaults vindos de
 * configuração. O domínio valida contra a política que lhe entregam; ele nunca lê
 * `process.env` nem decide qual é o limite.
 */
export interface EligibilityPolicy {
  /** Percentual máximo do valor do imóvel passível de financiamento. */
  readonly maxLtvPercent: number;
  /** Percentual máximo da renda bruta comprometido com o desembolso mensal. */
  readonly maxIncomeCommitmentPercent: number;
  /** Prazo máximo do contrato, em meses. */
  readonly maxTermMonths: number;
}

/**
 * Valores de **referência de mercado**, não regulação vigente.
 *
 * Espelham os defaults do `.env.example` e existem para que testes e o endpoint
 * público tenham um ponto de partida razoável. Verifique a vigência junto ao agente
 * financeiro antes de tratar qualquer um deles como verdade.
 */
export const DEFAULT_ELIGIBILITY_POLICY: EligibilityPolicy = {
  maxLtvPercent: 80,
  maxIncomeCommitmentPercent: 30,
  maxTermMonths: 420,
};
