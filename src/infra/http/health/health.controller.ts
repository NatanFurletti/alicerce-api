import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiResponse, ApiTags } from '@nestjs/swagger';

import { Public } from '../../auth/jwt-auth.guard';

class HealthResponse {
  @ApiProperty({ enum: ['ok'] })
  status!: 'ok';

  @ApiProperty()
  uptimeSeconds!: number;

  @ApiProperty({ format: 'date-time' })
  timestamp!: string;
}

/**
 * Liveness probe. Responde se o processo está de pé.
 *
 * Deliberadamente NÃO verifica o banco: um healthcheck que falha quando o Postgres
 * cai faz o orquestrador reiniciar uma aplicação saudável. O readiness com status do
 * banco é item da Etapa 7 e vai num endpoint separado.
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  // Público: o guard é global (AuthModule), e um healthcheck que exige token é
  // inútil para orquestrador e load balancer.
  @ApiOperation({
    summary: 'Liveness probe',
    description:
      'Deliberadamente NÃO verifica o banco: um healthcheck que falha quando o ' +
      'Postgres cai faria o orquestrador reiniciar uma aplicação saudável.',
  })
  @ApiResponse({ status: 200, description: 'Processo de pé.', type: HealthResponse })
  @Public()
  @Get()
  check(): HealthResponse {
    return {
      status: 'ok',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}
