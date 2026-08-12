import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../../auth/jwt-auth.guard';

interface HealthResponse {
  status: 'ok';
  uptimeSeconds: number;
  timestamp: string;
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
