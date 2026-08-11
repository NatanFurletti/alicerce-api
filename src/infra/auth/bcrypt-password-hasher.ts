import * as bcrypt from 'bcrypt';

import type { PasswordHasher } from '../../application/ports/password-hasher';
import { PasswordTooLongError } from '../../domain/errors/domain-errors';

/**
 * Limite do bcrypt: ele ignora tudo além de 72 **bytes** (não caracteres).
 *
 * Este é o detalhe que morde: o algoritmo trunca em silêncio. Duas senhas longas com
 * os mesmos 72 primeiros bytes autenticam uma à outra, e o usuário nunca fica sabendo
 * que metade da senha dele é decorativa.
 */
export const MAX_PASSWORD_BYTES = 72;

/**
 * Custo padrão (fator de trabalho). Cada incremento **dobra** o tempo de cálculo.
 *
 * 12 leva ~250-300ms num servidor moderno — lento o bastante para inviabilizar força
 * bruta em massa, rápido o bastante para não travar um login legítimo. O valor fica
 * embutido no hash gerado, então subir o custo no futuro não invalida as senhas já
 * cadastradas: elas continuam validando com o custo antigo.
 */
export const DEFAULT_COST = 12;

/**
 * Implementação de `PasswordHasher` com bcrypt (ADR-006).
 *
 * Vive em `infra/` porque é detalhe de infraestrutura: a aplicação depende da porta,
 * nunca desta classe.
 *
 * Sem `@Injectable()` de propósito: o construtor recebe um `number`, que o Nest não
 * sabe resolver por tipo. O `AuthModule` a registra por factory, o que também deixa o
 * custo configurável por ambiente.
 */
export class BcryptPasswordHasher implements PasswordHasher {
  constructor(private readonly cost: number = DEFAULT_COST) {}

  async hash(plain: string): Promise<string> {
    // Falha alto em vez de truncar. Uma senha silenciosamente encurtada é pior que
    // uma senha rejeitada, porque o usuário acha que está protegido.
    if (exceedsLimit(plain)) {
      throw new PasswordTooLongError(MAX_PASSWORD_BYTES);
    }

    return bcrypt.hash(plain, this.cost);
  }

  async compare(plain: string, hash: string): Promise<boolean> {
    // Recusa antes de chamar o bcrypt: uma senha longa demais jamais foi cadastrada,
    // então não pode casar com hash nenhum.
    if (exceedsLimit(plain)) {
      return false;
    }

    try {
      return await bcrypt.compare(plain, hash);
    } catch {
      // Hash corrompido ou em formato desconhecido no banco. Devolver `false` mantém
      // o login como "credencial inválida" em vez de derrubar a requisição com 500.
      return false;
    }
  }
}

function exceedsLimit(plain: string): boolean {
  return Buffer.byteLength(plain, 'utf8') > MAX_PASSWORD_BYTES;
}
