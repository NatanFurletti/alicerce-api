/**
 * Erros de domínio.
 *
 * São classes próprias, com `code` estável, e NUNCA `HttpException` — o domínio não
 * conhece HTTP (ADR-001). A tradução para status code acontece num exception filter
 * na Etapa 5. O `code` é o que o cliente da API consome; a `message` é para humanos e
 * pode mudar sem quebrar contrato.
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;

  protected constructor(message: string) {
    super(message);
    // Necessário porque TypeScript compilando para ES5/ES2015+ quebra a cadeia de
    // protótipos ao estender built-ins: sem isto, `instanceof` falha.
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Taxa de juros inválida: negativa ou não finita. */
export class InvalidRateError extends DomainError {
  readonly code = 'INVALID_RATE';

  constructor(rate: number) {
    super(`Taxa inválida: ${rate}. Deve ser um número finito não negativo.`);
  }
}

/** Prazo inválido: não inteiro, zero ou negativo. */
export class InvalidTermError extends DomainError {
  readonly code = 'INVALID_TERM';

  constructor(termMonths: number) {
    super(`Prazo inválido: ${termMonths}. Deve ser um inteiro maior que zero.`);
  }
}

/** Valor monetário inválido no domínio: negativo, fracionário ou fora do range seguro. */
export class InvalidAmountError extends DomainError {
  readonly code = 'INVALID_AMOUNT';

  constructor(field: string, value: number) {
    super(
      `Valor inválido para ${field}: ${value}. Deve ser inteiro de centavos não negativo.`,
    );
  }
}

/** Principal a financiar é zero ou negativo — nada a amortizar. */
export class InvalidPrincipalError extends DomainError {
  readonly code = 'INVALID_PRINCIPAL';

  constructor(principal: number) {
    super(`Principal inválido: ${principal}. Deve ser maior que zero.`);
  }
}

/** Aporte extraordinário agendado para um mês fora do prazo do contrato. */
export class ExtraPaymentOutOfRangeError extends DomainError {
  readonly code = 'EXTRA_PAYMENT_OUT_OF_RANGE';

  constructor(month: number, termMonths: number) {
    super(`Aporte no mês ${month} está fora do prazo do contrato (1 a ${termMonths}).`);
  }
}

/** Aporte extraordinário maior que o saldo devedor do mês. */
export class ExtraPaymentExceedsBalanceError extends DomainError {
  readonly code = 'EXTRA_PAYMENT_EXCEEDS_BALANCE';

  constructor(amount: number, balance: number) {
    super(
      `Aporte de ${amount} centavos excede o saldo devedor de ${balance} centavos no mês.`,
    );
  }
}

/** O método numérico do CET não convergiu dentro do limite de iterações. */
export class CetDidNotConvergeError extends DomainError {
  readonly code = 'CET_DID_NOT_CONVERGE';

  constructor(iterations: number) {
    super(`O cálculo do CET não convergiu em ${iterations} iterações.`);
  }
}

/** Fluxo de caixa sem solução de TIR: precisa de ao menos uma entrada e uma saída. */
export class InvalidCashFlowError extends DomainError {
  readonly code = 'INVALID_CASH_FLOW';

  constructor(reason: string) {
    super(`Fluxo de caixa inválido para cálculo de TIR: ${reason}`);
  }
}
