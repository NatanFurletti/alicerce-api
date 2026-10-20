import { loadEnv } from './env';

const ACCESS_SECRET = 'a'.repeat(32);
const REFRESH_SECRET = 'b'.repeat(32);

const valid = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  JWT_ACCESS_SECRET: ACCESS_SECRET,
  JWT_REFRESH_SECRET: REFRESH_SECRET,
};

describe('loadEnv', () => {
  it('aplica defaults de porta, ambiente e TTLs', () => {
    expect(loadEnv({ ...valid })).toEqual({
      nodeEnv: 'development',
      port: 3000,
      databaseUrl: valid.DATABASE_URL,
      jwt: {
        accessSecret: ACCESS_SECRET,
        accessTtl: '15m',
        refreshSecret: REFRESH_SECRET,
        refreshTtl: '7d',
      },
      corsOrigins: [],
    });
  });

  it('falha no boot quando DATABASE_URL está ausente ou vazia', () => {
    expect(() => loadEnv({ ...valid, DATABASE_URL: undefined })).toThrow(/DATABASE_URL/);
    expect(() => loadEnv({ ...valid, DATABASE_URL: '' })).toThrow(/DATABASE_URL/);
  });

  it('lista todas as variáveis inválidas de uma vez, não só a primeira', () => {
    expect(() => loadEnv({ PORT: 'abc' })).toThrow(/DATABASE_URL.*PORT/s);
  });

  it('rejeita portas fora do intervalo válido', () => {
    for (const PORT of ['0', '-1', '70000', '3000.5']) {
      expect(() => loadEnv({ ...valid, PORT })).toThrow(/PORT/);
    }
  });

  it('reconhece production e test, e trata valor desconhecido como development', () => {
    expect(loadEnv({ ...valid, NODE_ENV: 'production' }).nodeEnv).toBe('production');
    expect(loadEnv({ ...valid, NODE_ENV: 'test' }).nodeEnv).toBe('test');
    expect(loadEnv({ ...valid, NODE_ENV: 'staging' }).nodeEnv).toBe('development');
  });

  describe('segredos de JWT', () => {
    it('exige os dois segredos', () => {
      expect(() => loadEnv({ ...valid, JWT_ACCESS_SECRET: undefined })).toThrow(
        /JWT_ACCESS_SECRET/,
      );
      expect(() => loadEnv({ ...valid, JWT_REFRESH_SECRET: undefined })).toThrow(
        /JWT_REFRESH_SECRET/,
      );
    });

    it('rejeita segredo curto demais para HMAC-SHA256', () => {
      // Segredo menor que a saída do hash (256 bits) fica ao alcance de força bruta
      // offline — o atacante tem o token e pode testar chaves à vontade.
      expect(() => loadEnv({ ...valid, JWT_ACCESS_SECRET: 'curto' })).toThrow(
        /mínimo de 32/,
      );
    });

    it('REJEITA segredos iguais entre access e refresh', () => {
      // Segredos iguais anulam a separação: um refresh token passaria a ter assinatura
      // válida na rota de acesso.
      expect(() => loadEnv({ ...valid, JWT_REFRESH_SECRET: ACCESS_SECRET })).toThrow(
        /devem ser diferentes/,
      );
    });

    it('em produção, rejeita o valor de exemplo do .env.example', () => {
      const placeholder = `troque-este-valor-em-producao-${'x'.repeat(10)}`;

      expect(() =>
        loadEnv({ ...valid, NODE_ENV: 'production', JWT_ACCESS_SECRET: placeholder }),
      ).toThrow(/valor de exemplo/);
    });

    it('fora de produção o placeholder é tolerado, se tiver comprimento suficiente', () => {
      const placeholder = `troque-este-valor-em-producao-${'x'.repeat(10)}`;

      expect(() =>
        loadEnv({ ...valid, NODE_ENV: 'development', JWT_ACCESS_SECRET: placeholder }),
      ).not.toThrow();
    });
  });

  describe('TTLs', () => {
    it('aceita os formatos da lib ms', () => {
      const env = loadEnv({ ...valid, JWT_ACCESS_TTL: '900s', JWT_REFRESH_TTL: '30d' });

      expect(env.jwt.accessTtl).toBe('900s');
      expect(env.jwt.refreshTtl).toBe('30d');
    });

    it('rejeita formato inválido em vez de deixar o erro para a emissão do token', () => {
      for (const ttl of ['quinze-minutos', '15', '15x', 'm15']) {
        expect(() => loadEnv({ ...valid, JWT_ACCESS_TTL: ttl })).toThrow(
          /JWT_ACCESS_TTL/,
        );
      }
    });
  });
  describe('CORS_ORIGINS', () => {
    it('sem a variável, nenhuma origem é liberada', () => {
      expect(loadEnv({ ...valid }).corsOrigins).toEqual([]);
      expect(loadEnv({ ...valid, CORS_ORIGINS: '' }).corsOrigins).toEqual([]);
    });

    it('aceita lista separada por vírgula, ignorando espaços e itens vazios', () => {
      const env = loadEnv({
        ...valid,
        CORS_ORIGINS: ' http://localhost:3001 , https://alicerce-web.vercel.app,',
      });

      expect(env.corsOrigins).toEqual([
        'http://localhost:3001',
        'https://alicerce-web.vercel.app',
      ]);
    });

    it('rejeita valor que não é uma origem exata', () => {
      // Barra final, caminho ou curinga nunca casariam com o header Origin, que o
      // navegador envia sem eles: a configuração falharia em silêncio.
      for (const CORS_ORIGINS of [
        'localhost:3001',
        'http://localhost:3001/',
        'https://app.com/rota',
        '*',
      ]) {
        expect(() => loadEnv({ ...valid, CORS_ORIGINS })).toThrow(/CORS_ORIGINS/);
      }
    });
  });
});
