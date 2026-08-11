import { Money } from '../value-objects/money.vo';
import { ExtraPaymentRecord } from './extra-payment-record';

const props = {
  id: 'ep-1',
  simulationId: 'sim-1',
  monthNumber: 13,
  amount: Money.fromReais(50_000),
  strategy: 'REDUCE_TERM' as const,
  createdAt: new Date('2026-02-01T00:00:00Z'),
};

describe('ExtraPaymentRecord (entidade)', () => {
  it('expõe todos os campos do registro', () => {
    // O mapper da Etapa 3 depende de cada um destes acessos.
    const record = ExtraPaymentRecord.create(props);

    expect(record.id).toBe('ep-1');
    expect(record.simulationId).toBe('sim-1');
    expect(record.monthNumber).toBe(13);
    expect(record.amount.cents).toBe(5_000_000);
    expect(record.strategy).toBe('REDUCE_TERM');
    expect(record.createdAt).toEqual(props.createdAt);
  });

  it('restore reconstrói a partir da persistência', () => {
    const record = ExtraPaymentRecord.restore({
      ...props,
      strategy: 'REDUCE_INSTALLMENT',
    });

    expect(record.strategy).toBe('REDUCE_INSTALLMENT');
    expect(record.id).toBe('ep-1');
  });
});
