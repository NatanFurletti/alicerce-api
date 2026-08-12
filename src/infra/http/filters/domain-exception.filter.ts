import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import {
  DomainError,
  DownPaymentExceedsPropertyValueError,
  EmailAlreadyInUseError,
  ExtraPaymentExceedsBalanceError,
  ExtraPaymentOutOfRangeError,
  IncomeCommitmentExceededError,
  InvalidCredentialsError,
  InvalidPaginationError,
  InvalidTokenError,
  LtvExceededError,
  SimulationNotFoundError,
  TermExceedsMaximumError,
} from '../../../domain/errors/domain-errors';

/** Formato único de erro da API (SPEC seção 4: código, mensagem, detalhes). */
export interface ErrorResponse {
  readonly statusCode: number;
  /** Código estável, consumido por clientes. A mensagem pode mudar; ele não. */
  readonly code: string;
  readonly message: string;
  readonly path: string;
  readonly timestamp: string;
  readonly details?: unknown;
}

/**
 * Mapeamento de erro de domínio para status HTTP.
 *
 * **É aqui que a decisão da ADR-001 se paga.** O domínio nunca lançou `HttpException`;
 * esta tabela é o único lugar do projeto que sabe que HTTP existe. Trocar a camada de
 * transporte não tocaria em nenhuma regra de negócio.
 *
 * Escolhas que merecem justificativa:
 *
 * - `SimulationNotFoundError` -> **404**, e não 403, mesmo quando o recurso existe e é
 *   de outro usuário (ADR-015). Status diferentes permitiriam enumerar ids alheios.
 * - Violações de elegibilidade -> **422** e não 400: o corpo está sintaticamente
 *   correto e foi compreendido; o que falha é uma regra de negócio. A distinção diz ao
 *   cliente se ele deve corrigir o formato ou os valores.
 * - `EmailAlreadyInUseError` -> **409**, que é o status de conflito de estado.
 */
const STATUS_BY_ERROR = new Map<new (...args: never[]) => DomainError, HttpStatus>([
  [SimulationNotFoundError, HttpStatus.NOT_FOUND],
  [EmailAlreadyInUseError, HttpStatus.CONFLICT],
  [InvalidCredentialsError, HttpStatus.UNAUTHORIZED],
  [InvalidTokenError, HttpStatus.UNAUTHORIZED],
  [InvalidPaginationError, HttpStatus.BAD_REQUEST],
  [LtvExceededError, HttpStatus.UNPROCESSABLE_ENTITY],
  [IncomeCommitmentExceededError, HttpStatus.UNPROCESSABLE_ENTITY],
  [TermExceedsMaximumError, HttpStatus.UNPROCESSABLE_ENTITY],
  [DownPaymentExceedsPropertyValueError, HttpStatus.UNPROCESSABLE_ENTITY],
  [ExtraPaymentOutOfRangeError, HttpStatus.UNPROCESSABLE_ENTITY],
  [ExtraPaymentExceedsBalanceError, HttpStatus.UNPROCESSABLE_ENTITY],
]);

/**
 * Erros de domínio sem entrada na tabela caem em **422**.
 *
 * Default deliberado: um erro de domínio novo significa "regra de negócio violada", e
 * 422 é a resposta correta para isso. Cair em 500 sugeriria defeito do servidor quando
 * o problema é a entrada do cliente.
 */
const DEFAULT_DOMAIN_STATUS = HttpStatus.UNPROCESSABLE_ENTITY;

/** A partir daqui a falha é do servidor, não da requisição — e merece log. */
const SERVER_ERROR_THRESHOLD = 500;

@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DomainExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();

    const body = this.toErrorResponse(exception, request.url);

    // Só erro inesperado vira log de erro. Regra de negócio violada é operação
    // normal da API e encheria o log de ruído.
    if (body.statusCode >= SERVER_ERROR_THRESHOLD) {
      this.logger.error(
        `${request.method} ${request.url} -> ${body.statusCode}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(body.statusCode).json(body);
  }

  private toErrorResponse(exception: unknown, path: string): ErrorResponse {
    const base = { path, timestamp: new Date().toISOString() };

    if (exception instanceof DomainError) {
      return {
        ...base,
        statusCode: resolveStatus(exception),
        code: exception.code,
        message: exception.message,
      };
    }

    if (exception instanceof HttpException) {
      return { ...base, ...fromHttpException(exception) };
    }

    // Qualquer outra coisa é defeito nosso. A mensagem original NÃO vai para a
    // resposta: um erro do Prisma vazaria nome de tabela e trecho de SQL.
    return {
      ...base,
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      message: 'Erro interno do servidor.',
    };
  }
}

function resolveStatus(error: DomainError): HttpStatus {
  for (const [type, status] of STATUS_BY_ERROR) {
    if (error instanceof type) {
      return status;
    }
  }
  return DEFAULT_DOMAIN_STATUS;
}

/** Normaliza `HttpException` do Nest para o mesmo formato dos erros de domínio. */
function fromHttpException(
  exception: HttpException,
): Pick<ErrorResponse, 'statusCode' | 'code' | 'message' | 'details'> {
  const statusCode = exception.getStatus();
  const payload: unknown = exception.getResponse();

  if (typeof payload === 'string') {
    return { statusCode, code: fallbackCode(statusCode), message: payload };
  }

  const record = payload as Record<string, unknown>;

  return {
    statusCode,
    code: typeof record.code === 'string' ? record.code : fallbackCode(statusCode),
    message: extractMessage(record) ?? exception.message,
    // `details` carrega a lista de campos inválidos do ValidationPipe.
    details: record.details,
  };
}

function extractMessage(record: Record<string, unknown>): string | undefined {
  const { message } = record;

  if (typeof message === 'string') return message;
  // O ValidationPipe devolve um array de mensagens; a primeira vira o resumo e a
  // lista completa fica em `details`.
  if (Array.isArray(message) && typeof message[0] === 'string') return message[0];

  return undefined;
}

function fallbackCode(statusCode: number): string {
  return (
    {
      [HttpStatus.BAD_REQUEST]: 'VALIDATION_ERROR',
      [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
      [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
      [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
      [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMIT_EXCEEDED',
    }[statusCode] ?? 'HTTP_ERROR'
  );
}
