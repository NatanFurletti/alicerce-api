import type { ExtraPaymentRecord } from '../../src/domain/entities/extra-payment-record';
import type { ExtraPaymentRepository } from '../../src/domain/repositories/extra-payment-repository';

export class InMemoryExtraPaymentRepository implements ExtraPaymentRepository {
  readonly items: ExtraPaymentRecord[] = [];

  create(record: ExtraPaymentRecord): Promise<void> {
    this.items.push(record);
    return Promise.resolve();
  }

  listBySimulationId(simulationId: string): Promise<readonly ExtraPaymentRecord[]> {
    return Promise.resolve(
      this.items
        .filter((record) => record.simulationId === simulationId)
        .sort((a, b) => a.monthNumber - b.monthNumber),
    );
  }
}
