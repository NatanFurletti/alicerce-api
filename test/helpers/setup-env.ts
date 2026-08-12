/**
 * Roda antes de cada suíte e2e.
 *
 * Fixa `NODE_ENV=test`, o que relaxa os limites do throttler (ver
 * `throttler.config.ts`) e reduz o custo do bcrypt. O rate limit real continua
 * verificado em `throttler.e2e-spec.ts`, que sobe uma aplicação com os valores de
 * produção.
 */
process.env.NODE_ENV = 'test';
