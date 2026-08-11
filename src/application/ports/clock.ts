/**
 * Fonte de tempo.
 *
 * Existe para que casos de uso não chamem `new Date()` diretamente. Tempo é entrada
 * do sistema, não detalhe ambiental: injetá-lo torna os testes determinísticos e
 * permite congelar o relógio em cenários de borda (virada de mês, fuso).
 */
export interface Clock {
  now(): Date;
}

/** Implementação de produção. */
export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

/** Relógio parado, para testes. */
export class FixedClock implements Clock {
  constructor(private readonly fixed: Date) {}

  now(): Date {
    return new Date(this.fixed);
  }
}
