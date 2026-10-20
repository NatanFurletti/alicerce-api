import { ApiProperty } from '@nestjs/swagger';

import type { AddExtraPaymentOutput } from '../../../../application/use-cases/add-extra-payment';
import type {
  CompareSystemsOutput,
  SystemComparison,
} from '../../../../application/use-cases/compare-systems';
import type { CreateSimulationOutput } from '../../../../application/use-cases/create-simulation';
import type { SimulationListItem } from '../../../../application/use-cases/list-simulations';
import type { CetResult } from '../../../../domain/finance/cet';
import type {
  ExtraPaymentSummary,
  ScheduleEntry,
  ScheduleTotals,
} from '../../../../domain/finance/types';
import type { Page } from '../../../../domain/repositories/simulation-repository';
import { CreateSimulationDto } from '../create-simulation.dto';

/**
 * Respostas das rotas de simulação, documentadas no Swagger.
 *
 * Mesmo princípio de `error.response.ts`: só documentação, presa às interfaces de saída
 * por `implements`. Todo valor em dinheiro é inteiro de centavos.
 */

export class ScheduleTotalsDto implements ScheduleTotals {
  @ApiProperty({ description: 'Juros pagos no contrato, em centavos.' })
  totalInterest!: number;

  @ApiProperty({ description: 'Principal amortizado: igual ao valor financiado.' })
  totalAmortization!: number;

  @ApiProperty()
  totalMip!: number;

  @ApiProperty()
  totalDfi!: number;

  @ApiProperty()
  totalAdminFee!: number;

  @ApiProperty({ description: 'Desembolso total: amortização, juros e encargos.' })
  totalPaid!: number;

  @ApiProperty({ description: 'Número de parcelas da tabela.' })
  months!: number;
}

export class CetResultDto implements CetResult {
  @ApiProperty({ description: 'CET mensal, em decimal.', example: 0.0082 })
  monthlyRate!: number;

  @ApiProperty({
    description: 'CET anual, em decimal: (1 + mensal)^12 - 1.',
    example: 0.1031,
  })
  annualRate!: number;
}

export class SimulationResponseDto implements CreateSimulationOutput {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty({ example: 40_000_000 })
  financedAmountCents!: number;

  @ApiProperty({ example: 360 })
  termMonths!: number;

  @ApiProperty({ description: 'Taxa mensal já convertida, em decimal.' })
  monthlyRate!: number;

  @ApiProperty({ description: 'Fração financiada do imóvel, em decimal: 0.8 = 80%.' })
  ltv!: number;

  @ApiProperty({ description: 'Desembolso do 1º mês, com encargos, em centavos.' })
  firstInstallmentCents!: number;

  @ApiProperty({ description: 'Desembolso do último mês, com encargos, em centavos.' })
  lastInstallmentCents!: number;

  @ApiProperty({ type: ScheduleTotalsDto })
  summary!: ScheduleTotalsDto;

  @ApiProperty({ type: CetResultDto })
  cet!: CetResultDto;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({
    type: CreateSimulationDto,
    description:
      'Parâmetros informados na criação, no formato do corpo de POST /simulations.',
  })
  input!: CreateSimulationDto;
}

export class SystemComparisonDto implements SystemComparison {
  @ApiProperty({ enum: ['SAC', 'PRICE'] })
  system!: 'SAC' | 'PRICE';

  @ApiProperty()
  firstInstallmentCents!: number;

  @ApiProperty()
  lastInstallmentCents!: number;

  @ApiProperty({ type: ScheduleTotalsDto })
  summary!: ScheduleTotalsDto;

  @ApiProperty({ type: CetResultDto })
  cet!: CetResultDto;
}

export class CompareResponseDto implements CompareSystemsOutput {
  @ApiProperty({ example: 40_000_000 })
  financedAmountCents!: number;

  @ApiProperty({ example: 360 })
  termMonths!: number;

  @ApiProperty({ type: SystemComparisonDto })
  sac!: SystemComparisonDto;

  @ApiProperty({ type: SystemComparisonDto })
  price!: SystemComparisonDto;

  @ApiProperty({ description: 'Quanto o Price cobra a mais de juros, em centavos.' })
  interestDifferenceCents!: number;
}

export class SimulationListItemDto implements SimulationListItem {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  propertyValueCents!: number;

  @ApiProperty()
  financedAmountCents!: number;

  @ApiProperty()
  termMonths!: number;

  @ApiProperty({ description: 'Taxa anual em decimal.' })
  annualRate!: number;

  @ApiProperty({ enum: ['SAC', 'PRICE'] })
  amortizationSystem!: 'SAC' | 'PRICE';

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;
}

export class ScheduleEntryDto implements ScheduleEntry {
  @ApiProperty({ description: 'Número do mês, começando em 1.' })
  month!: number;

  @ApiProperty({ description: 'Saldo devedor no início do mês.' })
  openingBalance!: number;

  @ApiProperty()
  interest!: number;

  @ApiProperty()
  amortization!: number;

  @ApiProperty({ description: 'Aporte extraordinário aplicado no mês, ou zero.' })
  extraPayment!: number;

  @ApiProperty()
  mip!: number;

  @ApiProperty()
  dfi!: number;

  @ApiProperty()
  adminFee!: number;

  @ApiProperty({ description: 'Prestação sem encargos: juros + amortização.' })
  installment!: number;

  @ApiProperty({ description: 'Desembolso do mês: prestação, encargos e aporte.' })
  totalPayment!: number;

  @ApiProperty({ description: 'Saldo devedor ao final do mês.' })
  closingBalance!: number;
}

/**
 * Páginas concretas em vez de um `PageDto<T>` genérico: o Swagger não representa
 * genéricos, e a alternativa (`getSchemaPath` + `allOf`) custa mais código do que
 * duas classes de quatro campos.
 */
export class SimulationPageDto implements Page<SimulationListItem> {
  @ApiProperty({ type: [SimulationListItemDto] })
  items!: SimulationListItemDto[];

  @ApiProperty({ description: 'Total de itens em todas as páginas.' })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  pageSize!: number;
}

export class SchedulePageDto implements Page<ScheduleEntry> {
  @ApiProperty({ type: [ScheduleEntryDto] })
  items!: ScheduleEntryDto[];

  @ApiProperty({ description: 'Número de meses do contrato.' })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  pageSize!: number;
}

export class ExtraPaymentSummaryDto implements ExtraPaymentSummary {
  @ApiProperty()
  totalInterestWithoutExtra!: number;

  @ApiProperty()
  totalInterestWithExtra!: number;

  @ApiProperty({ description: 'Juros economizados pelos aportes, em centavos.' })
  interestSaved!: number;

  @ApiProperty({ description: 'Encargos economizados pelos meses eliminados.' })
  chargesSaved!: number;

  @ApiProperty({ description: 'Meses eliminados. Zero em REDUCE_INSTALLMENT.' })
  monthsSaved!: number;

  @ApiProperty()
  totalExtraPaid!: number;
}

export class ExtraPaymentResponseDto implements AddExtraPaymentOutput {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  simulationId!: string;

  @ApiProperty({ type: ExtraPaymentSummaryDto })
  summary!: ExtraPaymentSummaryDto;

  @ApiProperty({ description: 'Prazo do contrato depois dos aportes.' })
  newTermMonths!: number;
}
