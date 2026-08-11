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

  /**
   * `reason` permite descrever violações que não são "valor fora da faixa" — divisão
   * por zero no cálculo de razão, por exemplo — sem precisar de uma classe de erro
   * nova para cada caso.
   */
  constructor(field: string, value: number, reason?: string) {
    super(
      reason === undefined
        ? `Valor inválido para ${field}: ${value}. Deve ser inteiro de centavos não negativo.`
        : `Valor inválido para ${field}: ${value}. ${reason}`,
    );
  }
}

/** Endereço de e-mail malformado. */
export class InvalidEmailError extends DomainError {
  readonly code = 'INVALID_EMAIL';

  constructor(value: string) {
    super(`E-mail inválido: "${value}".`);
  }
}

/**
 * Simulação não encontrada — ou não pertence a quem pediu.
 *
 * **Um único erro para os dois casos, de propósito.** Responder 404 para inexistente e
 * 403 para "existe mas é de outro" permitiria enumerar ids alheios pelo código de
 * status. Do ponto de vista de quem pergunta, um recurso que ele não pode ver não
 * existe.
 */
export class SimulationNotFoundError extends DomainError {
  readonly code = 'SIMULATION_NOT_FOUND';

  constructor(id: string) {
    super(`Simulação ${id} não encontrada.`);
  }
}

/** E-mail já cadastrado. */
export class EmailAlreadyInUseError extends DomainError {
  readonly code = 'EMAIL_ALREADY_IN_USE';

  constructor(email: string) {
    super(`O e-mail ${email} já está em uso.`);
  }
}

/** Parâmetros de paginação fora da faixa permitida. */
export class InvalidPaginationError extends DomainError {
  readonly code = 'INVALID_PAGINATION';

  constructor(reason: string) {
    super(`Paginação inválida: ${reason}`);
  }
}

/** Nome de usuário vazio ou longo demais. */
export class InvalidUserNameError extends DomainError {
  readonly code = 'INVALID_USER_NAME';

  constructor(reason: string) {
    super(`Nome de usuário inválido: ${reason}`);
  }
}

/**
 * Senha maior que o limite do algoritmo de hash.
 *
 * Existe porque o bcrypt **trunca silenciosamente** em 72 bytes: sem esta guarda, duas
 * senhas longas com o mesmo prefixo seriam intercambiáveis, e o usuário acharia que
 * tem uma senha mais forte do que realmente tem.
 */
export class PasswordTooLongError extends DomainError {
  readonly code = 'PASSWORD_TOO_LONG';

  constructor(maxBytes: number) {
    super(`A senha excede o limite de ${maxBytes} bytes.`);
  }
}

/** Credenciais inválidas no login. */
export class InvalidCredentialsError extends DomainError {
  readonly code = 'INVALID_CREDENTIALS';

  constructor() {
    // Mensagem deliberadamente genérica: distinguir "e-mail não existe" de "senha
    // errada" permitiria enumerar quais e-mails estão cadastrados.
    super('E-mail ou senha inválidos.');
  }
}

/** Token ausente, malformado, expirado ou de tipo errado. */
export class InvalidTokenError extends DomainError {
  readonly code = 'INVALID_TOKEN';

  constructor(reason = 'Token inválido ou expirado.') {
    super(reason);
  }
}

/** Usuário sem credencial — nunca deve ser possível persistir um. */
export class MissingPasswordHashError extends DomainError {
  readonly code = 'MISSING_PASSWORD_HASH';

  constructor() {
    super('Usuário não pode ser criado sem hash de senha.');
  }
}

/** Principal a financiar é zero ou negativo — nada a amortizar. */
export class InvalidPrincipalError extends DomainError {
  readonly code = 'INVALID_PRINCIPAL';

  constructor(principal: number) {
    super(`Principal inválido: ${principal}. Deve ser maior que zero.`);
  }
}

/**
 * Erros de elegibilidade (SPEC 2.7).
 *
 * Cada violação tem classe própria, e não uma mensagem genérica: quem consome a API
 * precisa saber SE foi a entrada, o prazo ou a renda que reprovou a simulação — são
 * ações corretivas diferentes. Todos carregam o limite violado para que a resposta
 * HTTP possa dizer "máximo 80%", e não apenas "inválido".
 */

/** Financiado excede o percentual máximo do valor do imóvel (entrada insuficiente). */
export class LtvExceededError extends DomainError {
  readonly code = 'LTV_EXCEEDED';

  constructor(
    readonly actualPercent: number,
    readonly maxPercent: number,
  ) {
    super(
      `LTV de ${actualPercent.toFixed(2)}% excede o máximo de ${maxPercent}%. ` +
        'Aumente o valor da entrada.',
    );
  }
}

/** Entrada maior ou igual ao valor do imóvel — não há o que financiar. */
export class DownPaymentExceedsPropertyValueError extends DomainError {
  readonly code = 'DOWN_PAYMENT_EXCEEDS_PROPERTY_VALUE';

  constructor(downPaymentCents: number, propertyValueCents: number) {
    super(
      `Entrada de ${downPaymentCents} centavos é maior ou igual ao valor do imóvel ` +
        `(${propertyValueCents} centavos). Não há saldo a financiar.`,
    );
  }
}

/** Prazo solicitado acima do máximo permitido pela política. */
export class TermExceedsMaximumError extends DomainError {
  readonly code = 'TERM_EXCEEDS_MAXIMUM';

  constructor(
    readonly termMonths: number,
    readonly maxTermMonths: number,
  ) {
    super(`Prazo de ${termMonths} meses excede o máximo de ${maxTermMonths} meses.`);
  }
}

/** Desembolso mensal compromete parcela excessiva da renda declarada. */
export class IncomeCommitmentExceededError extends DomainError {
  readonly code = 'INCOME_COMMITMENT_EXCEEDED';

  constructor(
    readonly actualPercent: number,
    readonly maxPercent: number,
  ) {
    super(
      `A primeira parcela compromete ${actualPercent.toFixed(2)}% da renda, ` +
        `acima do máximo de ${maxPercent}%.`,
    );
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
