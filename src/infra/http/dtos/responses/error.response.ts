import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type { ErrorResponse } from '../../filters/domain-exception.filter';

/**
 * Envelope de erro, documentado no Swagger.
 *
 * As classes de `responses/` existem só para a documentação: os controllers continuam
 * devolvendo as interfaces dos casos de uso. O `implements` é o que mantém as duas
 * coisas presas: se a interface ganhar um campo e esta classe não, o `tsc` falha.
 */
export class ErrorResponseDto implements ErrorResponse {
  @ApiProperty({ example: 422 })
  statusCode!: number;

  @ApiProperty({
    description: 'Código estável, para o cliente tratar. A mensagem pode mudar; ele não.',
    example: 'LTV_EXCEEDED',
  })
  code!: string;

  @ApiProperty({
    example: 'LTV de 98.00% excede o máximo de 80%. Aumente o valor da entrada.',
  })
  message!: string;

  @ApiProperty({ example: '/simulations' })
  path!: string;

  @ApiProperty({ format: 'date-time' })
  timestamp!: string;

  @ApiPropertyOptional({
    description: 'Em erros de validação (400), a lista completa de campos inválidos.',
    type: [String],
  })
  details?: unknown;
}
