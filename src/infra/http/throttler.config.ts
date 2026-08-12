import type { ThrottlerOptions } from '@nestjs/throttler';

const MINUTE = 60_000;

/**
 * Limites de requisição por IP.
 *
 * **Em `NODE_ENV=test` os limites sobem para um valor efetivamente infinito.** Sem
 * isso, a suíte e2e — que faz dezenas de cadastros e logins do mesmo IP em segundos —
 * bate no teto e falha por 429 em testes que nada têm a ver com rate limiting.
 *
 * O limite real continua sendo exercitado: `throttler.e2e-spec.ts` sobe uma aplicação
 * com os valores de produção e verifica que o bloqueio acontece. Relaxar aqui e testar
 * lá separadamente é mais honesto que remover o guard em teste — que deixaria a
 * funcionalidade sem cobertura nenhuma.
 */
const isTest = process.env.NODE_ENV === 'test';

/** Teto global, aplicado a todas as rotas. */
export const GLOBAL_THROTTLE: ThrottlerOptions = {
  ttl: MINUTE,
  limit: isTest ? 100_000 : 100,
};

/**
 * Teto de cadastro e login: alvos preferidos de força bruta e criação de contas em
 * massa. Também é a mitigação para o custo de CPU que a ADR-022 assumiu — o login
 * gasta ~300ms de bcrypt mesmo quando o e-mail não existe.
 */
export const AUTH_THROTTLE = { default: { limit: isTest ? 100_000 : 5, ttl: MINUTE } };

/**
 * Teto do cálculo público: a única rota que aceita trabalho de qualquer um sem
 * identificação, e cada chamada custa uma tabela de até 420 meses mais a busca de
 * raiz do CET.
 */
export const PUBLIC_PREVIEW_THROTTLE = {
  default: { limit: isTest ? 100_000 : 10, ttl: MINUTE },
};
