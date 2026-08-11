/**
 * Tokens de injeção da camada de autenticação.
 *
 * Mesma motivação da `domain/repositories/tokens.ts`: interfaces do TypeScript não
 * existem em runtime. `PASSWORD_HASHER` e `TOKEN_SERVICE` são portas da aplicação,
 * implementadas aqui em `infra/auth`.
 */
export const PASSWORD_HASHER = 'PasswordHasher';
export const TOKEN_SERVICE = 'TokenService';
