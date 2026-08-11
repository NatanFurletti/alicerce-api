import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';

import { loadEnv } from '../../shared/config/env';
import { BcryptPasswordHasher, DEFAULT_COST } from './bcrypt-password-hasher';
import { JwtAuthGuard } from './jwt-auth.guard';
import { JwtTokenService } from './jwt-token.service';
import { PASSWORD_HASHER, TOKEN_SERVICE } from './tokens';

/** Custo mínimo do bcrypt, usado apenas em `NODE_ENV=test`. */
const MIN_TEST_COST = 4;

/**
 * Autenticação: hashing, emissão de tokens e o guard global.
 *
 * **`APP_GUARD` torna o `JwtAuthGuard` global.** Toda rota passa a exigir um access
 * token válido, e as exceções são marcadas com `@Public()`. O inverso — aplicar o
 * guard rota a rota — falha por omissão: um endpoint novo sem o decorator ficaria
 * aberto sem ninguém notar. Aqui, esquecer o `@Public()` quebra de forma visível, que
 * é o modo de falha correto para uma decisão de segurança.
 */
@Global()
@Module({
  imports: [JwtModule.register({})],
  providers: [
    {
      provide: PASSWORD_HASHER,
      // Factory e não `useClass`: o construtor recebe o custo do bcrypt, que é um
      // `number` e portanto não resolvível por tipo. Em teste o custo cai para 4,
      // porque 12 levaria ~300ms por chamada e a suíte e2e faz várias.
      useFactory: (): BcryptPasswordHasher =>
        new BcryptPasswordHasher(
          loadEnv().nodeEnv === 'test' ? MIN_TEST_COST : DEFAULT_COST,
        ),
    },
    {
      provide: TOKEN_SERVICE,
      // A configuração vem de `loadEnv`, já validada no boot: segredos com
      // comprimento mínimo, diferentes entre si e sem o placeholder em produção.
      useFactory: (jwt: JwtService): JwtTokenService =>
        new JwtTokenService(jwt, loadEnv().jwt),
      inject: [JwtService],
    },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
  exports: [PASSWORD_HASHER, TOKEN_SERVICE],
})
export class AuthModule {}
