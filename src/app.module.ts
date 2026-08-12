import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AuthModule } from './infra/auth/auth.module';
import { DatabaseModule } from './infra/database/database.module';
import { DomainExceptionFilter } from './infra/http/filters/domain-exception.filter';
import { HttpModule } from './infra/http/http.module';
import { GLOBAL_THROTTLE } from './infra/http/throttler.config';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    HttpModule,
    // Limite global de 100 req/min por IP. Rotas sensíveis (login, cadastro,
    // preview público) apertam esse teto com `@Throttle` próprio.
    ThrottlerModule.forRoot([GLOBAL_THROTTLE]),
  ],
  providers: [
    // O filtro é global: nenhuma exceção escapa sem virar resposta estruturada.
    // É o que permite ao domínio lançar erro próprio sem conhecer HTTP (ADR-001).
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
