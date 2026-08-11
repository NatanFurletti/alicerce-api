import type { PasswordHasher } from '../../src/application/ports/password-hasher';

/**
 * Hasher falso para testes: prefixa em vez de derivar chave.
 *
 * NUNCA use fora de teste — é reversível por inspeção. O objetivo é justamente evitar
 * o custo do argon2 (centenas de milissegundos por chamada) na suíte de casos de uso,
 * que não está testando criptografia e sim orquestração.
 */
export class FakePasswordHasher implements PasswordHasher {
  hash(plain: string): Promise<string> {
    return Promise.resolve(`hashed:${plain}`);
  }

  compare(plain: string, hash: string): Promise<boolean> {
    return Promise.resolve(hash === `hashed:${plain}`);
  }
}
