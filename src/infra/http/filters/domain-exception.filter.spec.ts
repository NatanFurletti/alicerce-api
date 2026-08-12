import {
  type ArgumentsHost,
  BadRequestException,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';

import {
  EmailAlreadyInUseError,
  ExtraPaymentOutOfRangeError,
  InvalidCredentialsError,
  InvalidPaginationError,
  InvalidTokenError,
  LtvExceededError,
  SimulationNotFoundError,
} from '../../../domain/errors/domain-errors';
import { DomainExceptionFilter, type ErrorResponse } from './domain-exception.filter';

function makeHost(url = '/rota'): {
  host: ArgumentsHost;
  captured: { status?: number; body?: ErrorResponse };
} {
  const captured: { status?: number; body?: ErrorResponse } = {};

  const response = {
    status(code: number) {
      captured.status = code;
      return this;
    },
    json(body: ErrorResponse) {
      captured.body = body;
    },
  };

  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({ url, method: 'GET' }),
    }),
  } as unknown as ArgumentsHost;

  return { host, captured };
}

function run(exception: unknown, url?: string): ErrorResponse {
  const { host, captured } = makeHost(url);
  new DomainExceptionFilter().catch(exception, host);

  return captured.body as ErrorResponse;
}

describe('DomainExceptionFilter', () => {
  describe('mapeamento de erro de domínio para status', () => {
    it.each([
      [new SimulationNotFoundError('x'), HttpStatus.NOT_FOUND, 'SIMULATION_NOT_FOUND'],
      [new EmailAlreadyInUseError('a@b.c'), HttpStatus.CONFLICT, 'EMAIL_ALREADY_IN_USE'],
      [new InvalidCredentialsError(), HttpStatus.UNAUTHORIZED, 'INVALID_CREDENTIALS'],
      [new InvalidTokenError(), HttpStatus.UNAUTHORIZED, 'INVALID_TOKEN'],
      [new InvalidPaginationError('x'), HttpStatus.BAD_REQUEST, 'INVALID_PAGINATION'],
      [new LtvExceededError(90, 80), HttpStatus.UNPROCESSABLE_ENTITY, 'LTV_EXCEEDED'],
      [
        new ExtraPaymentOutOfRangeError(400, 360),
        HttpStatus.UNPROCESSABLE_ENTITY,
        'EXTRA_PAYMENT_OUT_OF_RANGE',
      ],
    ])('%s -> %i', (error, status, code) => {
      const body = run(error);

      expect(body.statusCode).toBe(status);
      expect(body.code).toBe(code);
    });

    it('simulação alheia devolve 404, não 403 — não vaza existência (ADR-015)', () => {
      expect(run(new SimulationNotFoundError('x')).statusCode).toBe(HttpStatus.NOT_FOUND);
    });

    it('violação de regra de negócio é 422, não 400', () => {
      // O corpo estava sintaticamente correto; o que falhou foi a regra. A distinção
      // diz ao cliente se ele deve corrigir o formato ou os valores.
      expect(run(new LtvExceededError(90, 80)).statusCode).toBe(422);
    });
  });

  describe('erro inesperado', () => {
    it('vira 500 genérico', () => {
      const body = run(new Error('falha qualquer'));

      expect(body.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(body.code).toBe('INTERNAL_ERROR');
    });

    it('NÃO vaza a mensagem original', () => {
      // Um erro do Prisma exporia nome de tabela e trecho de SQL.
      const body = run(
        new Error('Invalid `prisma.user.findUnique()` — column "password_hash"'),
      );

      expect(body.message).toBe('Erro interno do servidor.');
      expect(JSON.stringify(body)).not.toContain('prisma');
      expect(JSON.stringify(body)).not.toContain('password_hash');
    });

    it('lida com valores lançados que não são Error', () => {
      expect(run('string solta').statusCode).toBe(500);
      expect(run(null).statusCode).toBe(500);
      expect(run({ algo: 'estranho' }).statusCode).toBe(500);
    });
  });

  describe('HttpException do Nest', () => {
    it('preserva o status', () => {
      expect(run(new NotFoundException()).statusCode).toBe(404);
    });

    it('normaliza o corpo do ValidationPipe, que vem como array de mensagens', () => {
      const body = run(
        new BadRequestException({
          message: ['propertyValueCents must be an integer', 'termMonths is required'],
          error: 'Bad Request',
          statusCode: 400,
        }),
      );

      expect(body.statusCode).toBe(400);
      expect(body.code).toBe('VALIDATION_ERROR');
      expect(body.message).toBe('propertyValueCents must be an integer');
    });

    it('aceita corpo em string', () => {
      expect(run(new HttpException('mensagem simples', 418)).message).toBe(
        'mensagem simples',
      );
    });

    it('respeita um `code` já presente no corpo', () => {
      // O guard de autenticação devolve `{ code: 'UNAUTHORIZED' }`.
      const body = run(
        new HttpException(
          { code: 'UNAUTHORIZED', message: 'Credenciais inválidas.' },
          401,
        ),
      );

      expect(body.code).toBe('UNAUTHORIZED');
    });
  });

  describe('formato da resposta', () => {
    it('sempre inclui path e timestamp válidos', () => {
      const body = run(new SimulationNotFoundError('x'), '/simulations/abc');

      expect(body.path).toBe('/simulations/abc');
      expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
    });

    it('o código é estável e independente da mensagem', () => {
      // Clientes reagem ao `code`; a `message` é para humanos e pode mudar.
      expect(run(new LtvExceededError(90, 80)).code).toBe('LTV_EXCEEDED');
      expect(run(new LtvExceededError(99, 70)).code).toBe('LTV_EXCEEDED');
    });
  });
});
