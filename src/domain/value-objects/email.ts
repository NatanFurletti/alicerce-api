import { InvalidEmailError } from '../errors/domain-errors';

/**
 * Regex deliberadamente conservadora.
 *
 * Validar e-mail pela RFC 5322 completa exige um parser, e mesmo assim não diz se o
 * endereço existe. A verificação que importa é a de posse (link de confirmação), que
 * está fora do escopo deste projeto. Aqui o objetivo é apenas barrar erro de digitação
 * óbvio: exige local, arroba, domínio e um TLD de ao menos duas letras.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[a-z]{2,}$/i;

/**
 * Endereço de e-mail válido e normalizado.
 *
 * **A normalização é a razão de existir deste tipo.** Sem ela, "Natan@Example.com" e
 * "natan@example.com" viram dois cadastros distintos — e a constraint `UNIQUE` do
 * Postgres não impede, porque para o banco são strings diferentes. Normalizar na
 * fronteira do domínio garante que só existe uma forma canônica circulando.
 */
export class Email {
  private constructor(readonly value: string) {}

  static create(raw: string): Email {
    const normalized = raw.trim().toLowerCase();

    if (!EMAIL_PATTERN.test(normalized)) {
      throw new InvalidEmailError(raw);
    }

    return new Email(normalized);
  }

  equals(other: Email): boolean {
    return this.value === other.value;
  }

  toJSON(): string {
    return this.value;
  }

  toString(): string {
    return this.value;
  }
}
