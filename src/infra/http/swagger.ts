import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/**
 * Documentação interativa em `/docs`.
 *
 * O schema é derivado dos mesmos decorators do class-validator que já validam a
 * entrada (ADR-007): uma única declaração vira validação e documentação, sem risco de
 * a documentação descrever um contrato que o código não cumpre.
 */
export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Alicerce API')
    .setDescription(
      [
        'API de simulação de financiamento imobiliário com SAC, Price, CET e amortização',
        'extraordinária.',
        '',
        '### Valores monetários',
        '',
        'Todo valor em dinheiro trafega como **inteiro de centavos** — `50000000` são',
        'R$ 500.000,00. Ponto flutuante acumula erro ao longo de até 420 parcelas, e o',
        'saldo devedor deixaria de fechar em zero.',
        '',
        '### Convenção de taxa',
        '',
        '`EFFECTIVE` usa `(1 + i_a)^(1/12) - 1`; `NOMINAL` usa `i_a / 12`. Não é detalhe',
        'acadêmico: 12% a.a. pela convenção nominal capitalizam em **12,68% a.a.** efetivos.',
        '',
        '### Códigos de erro',
        '',
        'Toda falha devolve `{ statusCode, code, message, path, timestamp }`. O `code` é',
        'estável e deve ser usado pelo cliente.',
        '',
        '**400** indica erro de sintaxe (corrija o envio); **422** indica regra de negócio',
        'violada (os valores são válidos, mas a operação não é permitida).',
        '',
        '### Autenticação',
        '',
        'Faça login em `POST /auth/login`, copie o `accessToken` e clique em **Authorize**.',
        'O access token vale 15 minutos; use `POST /auth/refresh` para renovar.',
      ].join('\n'),
    )
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      // Nome referenciado por `@ApiBearerAuth('access-token')` nos controllers.
      'access-token',
    )
    .addTag('auth', 'Cadastro, login e renovação de token')
    .addTag('simulations', 'Criação, consulta e recálculo de simulações')
    .addTag('health', 'Verificação de disponibilidade')
    .build();

  const document = SwaggerModule.createDocument(app, config);

  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: {
      // Mantém o token entre recarregamentos da página: sem isso o avaliador
      // precisa refazer o login a cada F5.
      persistAuthorization: true,
      tagsSorter: 'alpha',
    },
    customSiteTitle: 'Alicerce API — documentação',
  });
}
