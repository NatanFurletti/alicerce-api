import { Injectable } from '@nestjs/common';

import type { ExtraPaymentRecord } from '../../../domain/entities/extra-payment-record';
import type { ExtraPaymentRepository } from '../../../domain/repositories/extra-payment-repository';
import { ExtraPaymentMapper } from '../mappers/extra-payment.mapper';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PrismaExtraPaymentRepository implements ExtraPaymentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(record: ExtraPaymentRecord): Promise<void> {
    await this.prisma.extraPayment.create({
      data: ExtraPaymentMapper.toPersistence(record),
    });
  }

  /** Ordenado por mês: o recálculo da tabela aplica os aportes em ordem cronológica. */
  async listBySimulationId(simulationId: string): Promise<readonly ExtraPaymentRecord[]> {
    const rows = await this.prisma.extraPayment.findMany({
      where: { simulationId },
      orderBy: { monthNumber: 'asc' },
    });

    return rows.map((row) => ExtraPaymentMapper.toDomain(row));
  }
}
