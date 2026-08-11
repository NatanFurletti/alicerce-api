import { loadEnv } from './env';

const valid = { DATABASE_URL: 'postgresql://u:p@localhost:5432/db' };

describe('loadEnv', () => {
  it('aplica defaults de porta e ambiente', () => {
    expect(loadEnv({ ...valid })).toEqual({
      nodeEnv: 'development',
      port: 3000,
      databaseUrl: valid.DATABASE_URL,
    });
  });

  it('falha no boot quando DATABASE_URL está ausente ou vazia', () => {
    expect(() => loadEnv({})).toThrow(/DATABASE_URL/);
    expect(() => loadEnv({ DATABASE_URL: '' })).toThrow(/DATABASE_URL/);
  });

  it('lista todas as variáveis inválidas de uma vez, não só a primeira', () => {
    expect(() => loadEnv({ PORT: 'abc' })).toThrow(/DATABASE_URL.*PORT/);
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
});
