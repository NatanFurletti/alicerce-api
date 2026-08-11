/**
 * Validação das variáveis de ambiente no boot.
 *
 * Falha rápido: se `DATABASE_URL` estiver ausente, o processo morre na inicialização
 * com uma mensagem clara, em vez de estourar na primeira requisição que toca o banco.
 *
 * Por que não class-validator aqui, já que o projeto o usa nos DTOs HTTP? Porque
 * decorators exigem uma classe instanciada e `reflect-metadata` carregado, e isso roda
 * antes de o Nest existir. Trinta linhas de função pura resolvem, sem dependência.
 */

export type NodeEnv = 'development' | 'test' | 'production';

export interface Env {
  nodeEnv: NodeEnv;
  port: number;
  databaseUrl: string;
}

class MissingEnvVarError extends Error {
  constructor(names: readonly string[]) {
    super(
      `Variáveis de ambiente obrigatórias ausentes ou inválidas: ${names.join(', ')}. ` +
        'Copie .env.example para .env e preencha os valores.',
    );
    this.name = 'MissingEnvVarError';
  }
}

function parsePort(raw: string | undefined): number | null {
  if (raw === undefined || raw === '') return 3000;
  const port = Number(raw);
  return Number.isInteger(port) && port > 0 && port < 65_536 ? port : null;
}

function parseNodeEnv(raw: string | undefined): NodeEnv {
  return raw === 'production' || raw === 'test' ? raw : 'development';
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const missing: string[] = [];

  const databaseUrl = source.DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl === '') {
    missing.push('DATABASE_URL');
  }

  const port = parsePort(source.PORT);
  if (port === null) {
    missing.push('PORT');
  }

  if (missing.length > 0) {
    throw new MissingEnvVarError(missing);
  }

  return {
    nodeEnv: parseNodeEnv(source.NODE_ENV),
    port: port as number,
    databaseUrl: databaseUrl as string,
  };
}
