import { BcryptPasswordHasher, MAX_PASSWORD_BYTES } from './bcrypt-password-hasher';
import { PasswordTooLongError } from '../../domain/errors/domain-errors';

describe('BcryptPasswordHasher', () => {
  // Custo mínimo nos testes: o custo real (12) leva ~300ms por chamada e
  // multiplicaria a duração da suíte sem testar nada a mais.
  const hasher = new BcryptPasswordHasher(4);

  it('produz hash diferente da senha em claro', async () => {
    const hash = await hasher.hash('senha-forte-123');

    expect(hash).not.toBe('senha-forte-123');
    expect(hash).not.toContain('senha-forte-123');
  });

  it('o hash tem o formato bcrypt, com o custo embutido', async () => {
    // $2b$ = versão do algoritmo, 04 = custo. O custo viaja no próprio hash, o que
    // permite aumentá-lo no futuro sem invalidar as senhas já cadastradas.
    expect(await hasher.hash('x')).toMatch(/^\$2[aby]\$04\$/);
  });

  it('a mesma senha gera hashes DIFERENTES a cada chamada', async () => {
    // O salt é aleatório e vai embutido no hash. Sem isso, senhas iguais teriam
    // hashes iguais e uma rainbow table quebraria todas de uma vez.
    const [a, b] = await Promise.all([hasher.hash('mesma'), hasher.hash('mesma')]);

    expect(a).not.toBe(b);
  });

  it('valida a senha correta contra qualquer um dos hashes', async () => {
    const hash = await hasher.hash('senha-correta');

    expect(await hasher.compare('senha-correta', hash)).toBe(true);
  });

  it('rejeita senha incorreta', async () => {
    const hash = await hasher.hash('senha-correta');

    expect(await hasher.compare('senha-errada', hash)).toBe(false);
    expect(await hasher.compare('', hash)).toBe(false);
    expect(await hasher.compare('Senha-Correta', hash)).toBe(false);
  });

  it('devolve false para hash malformado, em vez de estourar', async () => {
    // Um hash corrompido no banco não pode derrubar o login com erro 500.
    expect(await hasher.compare('qualquer', 'nao-e-um-hash')).toBe(false);
    expect(await hasher.compare('qualquer', '')).toBe(false);
  });

  describe('limite de 72 bytes do bcrypt', () => {
    it('rejeita senha acima do limite em vez de truncar silenciosamente', async () => {
      // O bcrypt ignora tudo além de 72 bytes. Sem esta guarda, duas senhas longas
      // com o mesmo prefixo seriam intercambiáveis — e o usuário nunca saberia que
      // metade da senha dele não conta.
      await expect(hasher.hash('a'.repeat(MAX_PASSWORD_BYTES + 1))).rejects.toThrow(
        PasswordTooLongError,
      );
    });

    it('aceita exatamente 72 bytes', async () => {
      await expect(hasher.hash('a'.repeat(MAX_PASSWORD_BYTES))).resolves.toBeDefined();
    });

    it('conta BYTES e não caracteres — acentos e emoji ocupam mais de um', async () => {
      // 'á' são 2 bytes em UTF-8; emoji chegam a 4. Contar caracteres deixaria passar
      // senhas que o bcrypt truncaria mesmo assim.
      const senha = 'á'.repeat(37); // 74 bytes, 37 caracteres

      expect(senha.length).toBeLessThan(MAX_PASSWORD_BYTES);
      expect(Buffer.byteLength(senha, 'utf8')).toBeGreaterThan(MAX_PASSWORD_BYTES);
      await expect(hasher.hash(senha)).rejects.toThrow(PasswordTooLongError);
    });

    it('compare também recusa senha longa demais, sem consultar o bcrypt', async () => {
      const hash = await hasher.hash('curta');

      expect(await hasher.compare('a'.repeat(200), hash)).toBe(false);
    });
  });
});
