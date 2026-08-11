/**
 * Núcleo financeiro — TypeScript puro (SPEC seção 2).
 *
 * Zero dependência de NestJS, Prisma ou HTTP: tudo aqui são funções puras sobre
 * inteiros de centavos, testáveis sem subir infraestrutura. Essa é a fronteira que a
 * ADR-001 protege e que o ESLint faz cumprir.
 */
export { calculateCet, calculateIrr, netPresentValue } from './cet';
export type { CetOptions, CetResult, IrrOptions } from './cet';
export { applyExtraPayments } from './extra-payment';
export { buildPriceSchedule, calculatePmt } from './price';
export { annualToMonthlyRate, monthlyToAnnualRate } from './rate';
export { buildSacSchedule } from './sac';
export { summarizeSchedule } from './schedule-common';
export type {
  AmortizationSystem,
  Charges,
  ExtraPayment,
  ExtraPaymentResult,
  ExtraPaymentStrategy,
  ExtraPaymentSummary,
  RateConvention,
  ScheduleEntry,
  ScheduleInput,
  ScheduleTotals,
} from './types';
