import type { ExtraPayment as PrismaExtraPayment } from '@prisma/client';

import { ExtraPaymentRecord } from '../../../domain/entities/extra-payment-record';
import { Money } from '../../../domain/value-objects/money.vo';

export const ExtraPaymentMapper = {
  toDomain(row: PrismaExtraPayment): ExtraPaymentRecord {
    return ExtraPaymentRecord.restore({
      id: row.id,
      simulationId: row.simulationId,
      monthNumber: row.monthNumber,
      amount: Money.fromCents(Number(row.amount)),
      strategy: row.strategy,
      createdAt: row.createdAt,
    });
  },

  toPersistence(record: ExtraPaymentRecord): PrismaExtraPayment {
    return {
      id: record.id,
      simulationId: record.simulationId,
      monthNumber: record.monthNumber,
      amount: BigInt(record.amount.cents),
      strategy: record.strategy,
      createdAt: record.createdAt,
    };
  },
};
