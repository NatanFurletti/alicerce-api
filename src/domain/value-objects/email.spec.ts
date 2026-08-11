import { InvalidEmailError } from '../errors/domain-errors';
import { Email } from './email';

describe('Email (value object)', () => {
  it('aceita endereços válidos', () => {
    for (const value of [
      'natan@example.com',
      'natan.furletti@sub.example.com.br',
      'a+tag@example.io',
      'nome_com_underscore@example.org',
    ]) {
      expect(Email.create(value).value).toBe(value.toLowerCase());
    }
  });

  it('normaliza para minúsculas e remove espaços nas bordas', () => {
    // Sem isto, "Natan@X.com" e "natan@x.com" viram dois cadastros distintos, e a
    // constraint UNIQUE do banco não impede — para o Postgres são strings diferentes.
    expect(Email.create('  Natan@Example.COM  ').value).toBe('natan@example.com');
  });

  it('rejeita endereços inválidos', () => {
    for (const value of [
      '',
      '   ',
      'sem-arroba',
      '@sem-local.com',
      'sem-dominio@',
      'sem@tld',
      'espaço no meio@example.com',
      'dois@@arrobas.com',
    ]) {
      expect(() => Email.create(value)).toThrow(InvalidEmailError);
    }
  });

  it('compara por valor, não por identidade', () => {
    // A razão de ser de um value object: dois objetos com o mesmo conteúdo são
    // o mesmo valor, ainda que sejam instâncias diferentes.
    const a = Email.create('natan@example.com');
    const b = Email.create('NATAN@example.com');
    expect(a.equals(b)).toBe(true);
    expect(a === b).toBe(false);
    expect(a.equals(Email.create('outro@example.com'))).toBe(false);
  });

  it('serializa como string', () => {
    expect(String(Email.create('natan@example.com'))).toBe('natan@example.com');
    expect(JSON.stringify({ email: Email.create('natan@example.com') })).toBe(
      '{"email":"natan@example.com"}',
    );
  });
});
