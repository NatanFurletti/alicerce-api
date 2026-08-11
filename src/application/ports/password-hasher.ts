/**
 * Hashing de senha.
 *
 * Porta para que a aplicação não dependa de argon2 nem de bcrypt (ADR-006, a decidir
 * na Etapa 4). Além do desacoplamento, há um ganho prático de teste: algoritmos de
 * hash de senha são propositalmente lentos — centenas de milissegundos por chamada —
 * e um fake trivial mantém a suíte de casos de uso rápida.
 */
export interface PasswordHasher {
  hash(plain: string): Promise<string>;

  compare(plain: string, hash: string): Promise<boolean>;
}
