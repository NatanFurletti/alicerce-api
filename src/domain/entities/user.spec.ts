import { InvalidEmailError, InvalidUserNameError } from '../errors/domain-errors';
import { Email } from '../value-objects/email';
import { User } from './user';

const props = {
  id: 'user-1',
  name: 'Natan Furletti',
  email: Email.create('natan@example.com'),
  passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$abc',
  createdAt: new Date('2026-01-15T10:00:00Z'),
  updatedAt: new Date('2026-01-15T10:00:00Z'),
};

describe('User (entidade)', () => {
  it('cria um usuário válido', () => {
    const user = User.create(props);
    expect(user.id).toBe('user-1');
    expect(user.name).toBe('Natan Furletti');
    expect(user.email.value).toBe('natan@example.com');
  });

  it('remove espaços das bordas do nome', () => {
    expect(User.create({ ...props, name: '  Natan  ' }).name).toBe('Natan');
  });

  it('rejeita nome vazio ou só com espaços', () => {
    for (const name of ['', '   ', '\t\n']) {
      expect(() => User.create({ ...props, name })).toThrow(InvalidUserNameError);
    }
  });

  it('rejeita nome absurdamente longo', () => {
    expect(() => User.create({ ...props, name: 'a'.repeat(201) })).toThrow(
      InvalidUserNameError,
    );
  });

  it('rejeita hash de senha vazio', () => {
    // Guarda contra o pior bug possível de autenticação: usuário sem credencial.
    expect(() => User.create({ ...props, passwordHash: '' })).toThrow();
  });

  it('o e-mail já chega validado pelo value object', () => {
    expect(() => Email.create('invalido')).toThrow(InvalidEmailError);
  });

  it('nunca expõe o hash da senha em JSON', () => {
    // Serializar a entidade por engano numa resposta HTTP não pode vazar credencial.
    const serialized = JSON.stringify(User.create(props));
    expect(serialized).not.toContain('argon2');
    expect(serialized).toContain('natan@example.com');
  });

  it('expõe o hash apenas por acesso explícito, para o serviço de autenticação', () => {
    expect(User.create(props).passwordHash).toBe(props.passwordHash);
  });

  it('restore reconstrói sem revalidar', () => {
    const user = User.restore({ ...props, name: '' });
    expect(user.name).toBe('');
  });
});
