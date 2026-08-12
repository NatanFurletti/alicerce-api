import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, IsPositive, Max } from 'class-validator';

const MAX_MONEY_CENTS = 100_000_000_000;
const MAX_TERM_MONTHS = 600;

export class AddExtraPaymentDto {
  @ApiProperty({
    description: 'Mês do aporte, começando em 1. Precisa estar dentro do prazo.',
    example: 13,
  })
  @IsInt()
  @IsPositive()
  @Max(MAX_TERM_MONTHS)
  monthNumber!: number;

  @ApiProperty({
    description: 'Valor do aporte em CENTAVOS. Não pode exceder o saldo devedor do mês.',
    example: 5_000_000,
  })
  @IsInt()
  @IsPositive()
  @Max(MAX_MONEY_CENTS)
  amountCents!: number;

  @ApiProperty({
    description:
      'REDUCE_TERM mantém a parcela e encurta o prazo — economiza MAIS juros. ' +
      'REDUCE_INSTALLMENT mantém o prazo e reduz a parcela.',
    enum: ['REDUCE_TERM', 'REDUCE_INSTALLMENT'],
    example: 'REDUCE_TERM',
  })
  @IsEnum(['REDUCE_TERM', 'REDUCE_INSTALLMENT'])
  strategy!: 'REDUCE_TERM' | 'REDUCE_INSTALLMENT';
}
