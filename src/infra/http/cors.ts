import type { INestApplication } from '@nestjs/common';

/**
 * Libera chamadas do navegador vindas das origens configuradas em `CORS_ORIGINS`.
 *
 * **Lista explícita, nunca `*`.** Um curinga deixaria qualquer site chamar a API com o
 * token que o usuário colou no próprio front. Com a lista, só o front conhecido passa.
 *
 * `credentials` fica desligado porque a autenticação viaja no header `Authorization`,
 * não em cookie: o navegador não anexa esse header sozinho, então não há credencial
 * ambiente a proteger. Ligar `credentials` só faria sentido com sessão em cookie.
 *
 * Sem origens configuradas, o CORS nem é registrado: o padrão seguro é recusar.
 */
export function setupCors(app: INestApplication, origins: readonly string[]): void {
  if (origins.length === 0) return;

  app.enableCors({
    origin: [...origins],
    methods: ['GET', 'POST', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    // Preflight em cache por 10 minutos: sem isso, cada POST do front custa duas
    // idas ao servidor — e no plano gratuito do Render cada ida pesa.
    maxAge: 600,
  });
}
