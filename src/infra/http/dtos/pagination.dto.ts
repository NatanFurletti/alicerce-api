import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

import { MAX_PAGE_SIZE } from '../../../application/use-cases/pagination';

/**
 * Parâmetros de paginação em query string.
 *
 * `@Type(() => Number)` é indispensável: query strings chegam sempre como texto, e sem
 * a conversão `@IsInt()` reprovaria `?page=1` — que é literalmente a chamada mais
 * comum da API.
 *
 * O teto de `pageSize` é duplicado aqui e em `normalizePageQuery` de propósito: o DTO
 * protege a borda HTTP com mensagem amigável, e o caso de uso permanece seguro quando
 * chamado de outro lugar (um job, um teste, a Etapa 7).
 */
export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize?: number;
}
