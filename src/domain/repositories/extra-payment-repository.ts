import type { ExtraPaymentRecord } from '../entities/extra-payment-record';

/**
 * Contrato de persistência de aportes extraordinários.
 *
 * A busca é sempre por simulação, nunca por id do aporte: um aporte não faz sentido
 * fora do contrato a que pertence, e o controle de acesso já foi feito ao carregar a
 * simulação do dono.
 */
export interface ExtraPaymentRepository {
  create(record: ExtraPaymentRecord): Promise<void>;

  /** Todos os aportes de uma simulação, ordenados por mês. */
  listBySimulationId(simulationId: string): Promise<readonly ExtraPaymentRecord[]>;
}
