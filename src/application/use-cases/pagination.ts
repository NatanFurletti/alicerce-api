import { InvalidPaginationError } from '../../domain/errors/domain-errors';
import type { PageQuery } from '../../domain/repositories/simulation-repository';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/**
 * Normaliza e valida parâmetros de paginação.
 *
 * O teto de `MAX_PAGE_SIZE` não é capricho: sem ele, `?pageSize=100000` numa tabela de
 * 420 meses ou numa lista grande vira um vetor de ataque trivial de exaustão de
 * memória. Limitar na aplicação, e não só no banco, protege também a serialização
 * JSON da resposta.
 */
export function normalizePageQuery(
  page: number | undefined,
  pageSize: number | undefined,
): PageQuery {
  const resolvedPage = page ?? 1;
  const resolvedSize = pageSize ?? DEFAULT_PAGE_SIZE;

  if (!Number.isInteger(resolvedPage) || resolvedPage < 1) {
    throw new InvalidPaginationError(
      `page deve ser inteiro >= 1, recebido ${resolvedPage}.`,
    );
  }
  if (!Number.isInteger(resolvedSize) || resolvedSize < 1) {
    throw new InvalidPaginationError(
      `pageSize deve ser inteiro >= 1, recebido ${resolvedSize}.`,
    );
  }
  if (resolvedSize > MAX_PAGE_SIZE) {
    throw new InvalidPaginationError(`pageSize excede o máximo de ${MAX_PAGE_SIZE}.`);
  }

  return { page: resolvedPage, pageSize: resolvedSize };
}
