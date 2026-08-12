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
  @IsNumber({ maxDecimalPlaces: 10 })
  @Min(0)
  @Max(1)
  mipMonthlyRate!: number;

  @IsNumber({ maxDecimalPlaces: 10 })
  @Min(0)
  @Max(1)
  dfiMonthlyRate!: number;

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
  @IsInt()
  @IsPositive()
  @Max(MAX_MONEY_CENTS)
  propertyValueCents!: number;

  @IsInt()
  @Min(0)
  @Max(MAX_MONEY_CENTS)
  downPaymentCents!: number;

  @IsInt()
  @IsPositive()
  @Max(MAX_TERM_MONTHS)
  termMonths!: number;

  /** Taxa anual em decimal: 0.0975 são 9,75% a.a. */
  @IsNumber({ maxDecimalPlaces: 10 })
  @Min(0)
  @Max(1)
  annualRate!: number;

  @IsEnum(['EFFECTIVE', 'NOMINAL'])
  rateConvention!: 'EFFECTIVE' | 'NOMINAL';

  @IsEnum(['SAC', 'PRICE'])
  amortizationSystem!: 'SAC' | 'PRICE';

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_MONEY_CENTS)
  monthlyIncomeCents?: number;

  // `@Type` é obrigatório para que o class-transformer instancie a classe aninhada;
  // sem ele o objeto chega como literal e os decorators de `ChargesDto` não rodam.
  @ValidateNested()
  @Type(() => ChargesDto)
  charges!: ChargesDto;
}
