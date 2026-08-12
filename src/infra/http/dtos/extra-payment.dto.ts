import { IsEnum, IsInt, IsPositive, Max } from 'class-validator';

const MAX_MONEY_CENTS = 100_000_000_000;
const MAX_TERM_MONTHS = 600;

export class AddExtraPaymentDto {
  @IsInt()
  @IsPositive()
  @Max(MAX_TERM_MONTHS)
  monthNumber!: number;

  @IsInt()
  @IsPositive()
  @Max(MAX_MONEY_CENTS)
  amountCents!: number;

  @IsEnum(['REDUCE_TERM', 'REDUCE_INSTALLMENT'])
  strategy!: 'REDUCE_TERM' | 'REDUCE_INSTALLMENT';
}
