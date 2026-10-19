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

/** Duração aceita pela lib `ms`, usada nos TTLs de token. */
export type Duration = `${number}${'s' | 'm' | 'h' | 'd'}`;

export interface JwtEnv {
  accessSecret: string;
  accessTtl: Duration;
  refreshSecret: string;
  refreshTtl: Duration;
}

export interface Env {
  nodeEnv: NodeEnv;
  port: number;
  databaseUrl: string;
  jwt: JwtEnv;
  /** Origens autorizadas a chamar a API pelo navegador. Vazio = CORS desligado. */
  corsOrigins: readonly string[];
}

/**
 * Comprimento mínimo dos segredos de JWT.
 *
 * HS256 usa HMAC-SHA256, cuja saída tem 256 bits. Um segredo mais curto que isso
 * enfraquece a assinatura e fica ao alcance de força bruta offline — o atacante tem o
 * token em mãos e pode testar chaves à vontade. 32 caracteres é o piso; a orientação
 * no `.env.example` é gerar com `openssl rand -base64 32`.
 */
const MIN_SECRET_LENGTH = 32;

const DURATION_PATTERN = /^\d+[smhd]$/;

function parseSecret(
  raw: string | undefined,
  name: string,
  nodeEnv: NodeEnv,
  missing: string[],
): string {
  if (raw === undefined || raw === '') {
    missing.push(name);
    return '';
  }

  // Em produção, um segredo curto ou o placeholder do .env.example derrubam o boot.
  // Fora dela apenas o comprimento é exigido, para não atrapalhar o desenvolvimento.
  if (raw.length < MIN_SECRET_LENGTH) {
    missing.push(`${name} (mínimo de ${MIN_SECRET_LENGTH} caracteres)`);
  } else if (nodeEnv === 'production' && raw.includes('troque-este-valor')) {
    missing.push(`${name} (valor de exemplo não pode ser usado em produção)`);
  }

  return raw;
}

function parseDuration(
  raw: string | undefined,
  name: string,
  fallback: Duration,
  missing: string[],
): Duration {
  if (raw === undefined || raw === '') return fallback;

  if (!DURATION_PATTERN.test(raw)) {
    missing.push(`${name} (formato esperado: 15m, 7d, 900s)`);
    return fallback;
  }

  return raw as Duration;
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

/**
 * Lê `CORS_ORIGINS`: lista de origens exatas separadas por vírgula.
 *
 * Cada item precisa ser uma origem pura (`esquema://host[:porta]`), sem barra final nem
 * caminho. O navegador envia o header `Origin` exatamente nesse formato, e o CORS do
 * Express compara por igualdade de texto: `http://localhost:3001/` nunca casaria, e a
 * API recusaria o front sem nenhum erro no boot. Validar aqui transforma esse engano
 * silencioso numa falha clara na inicialização.
 */
function parseCorsOrigins(raw: string | undefined, missing: string[]): string[] {
  if (raw === undefined || raw.trim() === '') return [];

  const origins = raw
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '');

  const invalid = origins.filter((origin) => !isExactOrigin(origin));
  if (invalid.length > 0) {
    missing.push(`CORS_ORIGINS (origens inválidas: ${invalid.join(', ')})`);
  }

  return origins;
}

function isExactOrigin(value: string): boolean {
  try {
    return new URL(value).origin === value;
  } catch {
    return false;
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

  const nodeEnv = parseNodeEnv(source.NODE_ENV);

  const jwt: JwtEnv = {
    accessSecret: parseSecret(
      source.JWT_ACCESS_SECRET,
      'JWT_ACCESS_SECRET',
      nodeEnv,
      missing,
    ),
    accessTtl: parseDuration(source.JWT_ACCESS_TTL, 'JWT_ACCESS_TTL', '15m', missing),
    refreshSecret: parseSecret(
      source.JWT_REFRESH_SECRET,
      'JWT_REFRESH_SECRET',
      nodeEnv,
      missing,
    ),
    refreshTtl: parseDuration(source.JWT_REFRESH_TTL, 'JWT_REFRESH_TTL', '7d', missing),
  };

  const corsOrigins = parseCorsOrigins(source.CORS_ORIGINS, missing);

  // Segredos iguais anulam a separação entre access e refresh: um refresh token
  // passaria a ter assinatura válida na rota de acesso. A checagem de `type` ainda
  // barraria, mas depender de uma única linha de defesa aqui não é aceitável.
  if (jwt.accessSecret !== '' && jwt.accessSecret === jwt.refreshSecret) {
    missing.push('JWT_ACCESS_SECRET e JWT_REFRESH_SECRET devem ser diferentes');
  }

  if (missing.length > 0) {
    throw new MissingEnvVarError(missing);
  }

  return {
    nodeEnv,
    port: port as number,
    databaseUrl: databaseUrl as string,
    jwt,
    corsOrigins,
  };
}
