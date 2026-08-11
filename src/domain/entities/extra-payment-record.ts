import type { ExtraPaymentStrategy } from '../finance/types';
import type { Money } from '../value-objects/money.vo';

export interface ExtraPaymentRecordProps {
  readonly id: string;
  readonly simulationId: string;
  readonly monthNumber: number;
  readonly amount: Money;
  readonly strategy: ExtraPaymentStrategy;
  readonly createdAt: Date;
}

/**
 * Aporte extraordinário persistido (tabela `ExtraPayment` do SPEC seção 3).
 *
 * Diferente do tipo `ExtraPayment` do núcleo financeiro, que é uma estrutura de
 * cálculo sem identidade. Este tem id, dono e data — é o registro de que o usuário
 * declarou um aporte, e é o que permite recompor a tabela recalculada a cada leitura.
 *
 * A validação de faixa (mês dentro do prazo, valor não excede o saldo) mora no núcleo
 * financeiro, que é quem conhece o contrato; aqui só existe o dado.
 */
export class ExtraPaymentRecord {
  private constructor(private readonly props: ExtraPaymentRecordProps) {}

  static create(props: ExtraPaymentRecordProps): ExtraPaymentRecord {
    return new ExtraPaymentRecord(props);
  }

  static restore(props: ExtraPaymentRecordProps): ExtraPaymentRecord {
    return new ExtraPaymentRecord(props);
  }

  get id(): string {
    return this.props.id;
  }

  get simulationId(): string {
    return this.props.simulationId;
  }

  get monthNumber(): number {
    return this.props.monthNumber;
  }

  get amount(): Money {
    return this.props.amount;
  }

  get strategy(): ExtraPaymentStrategy {
    return this.props.strategy;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }
}
