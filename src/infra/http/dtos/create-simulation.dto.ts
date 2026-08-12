import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * Teto de valor monetário aceito na entrada: R$ 1 bilhão em centavos.
 *
 * Não é uma regra de negócio — é uma guarda de sanidade contra números absurdos que
 * gerariam tabelas inúteis ou estourariam o intervalo seguro de inteiros. Os limites
 * de negócio de verdade (LTV, renda, prazo) vivem na `EligibilityPolicy`.
 */
const MAX_MONEY_CENTS = 100_000_000_000;

/** Prazo máximo aceito na borda. O limite contratual real vem da política. */
const MAX_TERM_MONTHS = 600;

export class ChargesDto {
  @ApiProperty({
    description:
      'Alíquota MENSAL do MIP (morte e invalidez), incidente sobre o saldo devedor ' +
      'de abertura do mês. Valor de referência, não regulação vigente.',
    example: 0.00025,
    minimum: 0,
    maximum: 1,
  })
  @IsNumber({ maxDecimalPlaces: 10 })
  @Min(0)
  @Max(1)
  mipMonthlyRate!: number;

  @ApiProperty({
    description:
      'Alíquota MENSAL do DFI (danos físicos ao imóvel), incidente sobre o valor do ' +
      'imóvel — portanto constante ao longo do contrato.',
    example: 0.00005,
    minimum: 0,
    maximum: 1,
  })
  @IsNumber({ maxDecimalPlaces: 10 })
  @Min(0)
  @Max(1)
  dfiMonthlyRate!: number;

  @ApiProperty({
    description: 'Taxa de administração mensal fixa, em centavos. 2500 = R$ 25,00.',
    example: 2500,
  })
  @IsInt()
  @Min(0)
  @Max(MAX_MONEY_CENTS)
  adminFeeCents!: number;
}

/**
 * Entrada de `POST /simulations`.
 *
 * **Valores monetários chegam em centavos inteiros**, coerente com a ADR-002 de ponta
 * a ponta. Aceitar reais fracionários aqui reintroduziria o problema de arredondamento
 * exatamente na fronteira onde ele é mais difícil de rastrear.
 *
 * A validação é sintática e de faixa. Regras de negócio — LTV, comprometimento de
 * renda — ficam no domínio, e não são duplicadas aqui: duplicar significaria dois
 * lugares para manter em sincronia, e o DTO não conhece a política vigente.
 */
export class CreateSimulationDto {
  @ApiProperty({
    description: 'Valor do imóvel em CENTAVOS. 50000000 = R$ 500.000,00.',
    example: 50_000_000,
  })
  @IsInt()
  @IsPositive()
  @Max(MAX_MONEY_CENTS)
  propertyValueCents!: number;

  @ApiProperty({
    description:
      'Entrada em CENTAVOS. O financiado é a diferença; o LTV resultante precisa ' +
      'respeitar o limite da política (default 80%), sob pena de 422 LTV_EXCEEDED.',
    example: 10_000_000,
  })
  @IsInt()
  @Min(0)
  @Max(MAX_MONEY_CENTS)
  downPaymentCents!: number;

  @ApiProperty({ description: 'Prazo em meses.', example: 360, maximum: MAX_TERM_MONTHS })
  @IsInt()
  @IsPositive()
  @Max(MAX_TERM_MONTHS)
  termMonths!: number;

  /** Taxa anual em decimal: 0.0975 são 9,75% a.a. */
  @ApiProperty({
    description: 'Taxa contratada ao ano, em decimal. 0.0975 = 9,75% a.a.',
    example: 0.0975,
    minimum: 0,
    maximum: 1,
  })
  @IsNumber({ maxDecimalPlaces: 10 })
  @Min(0)
  @Max(1)
  annualRate!: number;

  @ApiProperty({
    description:
      'EFFECTIVE usa (1+i)^(1/12)-1; NOMINAL usa i/12. A nominal resulta em taxa ' +
      'mensal MAIOR: 12% a.a. nominal capitalizam em 12,68% a.a. efetivos.',
    enum: ['EFFECTIVE', 'NOMINAL'],
    example: 'EFFECTIVE',
  })
  @IsEnum(['EFFECTIVE', 'NOMINAL'])
  rateConvention!: 'EFFECTIVE' | 'NOMINAL';

  @ApiProperty({
    description:
      'SAC: amortização constante, parcela decrescente. PRICE: parcela fixa, ' +
      'amortização crescente — cobra mais juros no total.',
    enum: ['SAC', 'PRICE'],
    example: 'SAC',
  })
  @IsEnum(['SAC', 'PRICE'])
  amortizationSystem!: 'SAC' | 'PRICE';

  @ApiPropertyOptional({
    description:
      'Renda bruta familiar mensal em CENTAVOS. Se informada, a primeira parcela ' +
      '(com encargos) não pode exceder o percentual da política — default 30%.',
    example: 2_000_000,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_MONEY_CENTS)
  monthlyIncomeCents?: number;

  // `@Type` é obrigatório para que o class-transformer instancie a classe aninhada;
  // sem ele o objeto chega como literal e os decorators de `ChargesDto` não rodam.
  @ApiProperty({ type: ChargesDto, description: 'Encargos mensais da parcela.' })
  @ValidateNested()
  @Type(() => ChargesDto)
  charges!: ChargesDto;
}
