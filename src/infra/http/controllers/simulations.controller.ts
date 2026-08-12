import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { AddExtraPaymentUseCase } from '../../../application/use-cases/add-extra-payment';
import {
  CompareSystemsUseCase,
  type CompareSystemsOutput,
} from '../../../application/use-cases/compare-systems';
import {
  CreateSimulationUseCase,
  type CreateSimulationOutput,
} from '../../../application/use-cases/create-simulation';
import { DeleteSimulationUseCase } from '../../../application/use-cases/delete-simulation';
import { GetScheduleUseCase } from '../../../application/use-cases/get-schedule';
import { GetSimulationUseCase } from '../../../application/use-cases/get-simulation';
import {
  ListSimulationsUseCase,
  type SimulationListItem,
} from '../../../application/use-cases/list-simulations';
import type { ScheduleEntry } from '../../../domain/finance/types';
import type { Page } from '../../../domain/repositories/simulation-repository';
import { Public } from '../../auth/jwt-auth.guard';
import { CurrentUserId } from '../decorators/current-user.decorator';
import { CreateSimulationDto } from '../dtos/create-simulation.dto';
import { AddExtraPaymentDto } from '../dtos/extra-payment.dto';
import { PaginationQueryDto } from '../dtos/pagination.dto';
import { PUBLIC_PREVIEW_THROTTLE } from '../throttler.config';

/**
 * Rotas de simulação.
 *
 * Todas protegidas pelo guard global, exceto `/preview`. O `userId` vem sempre do
 * token via `@CurrentUserId()` — nunca do corpo ou da query, o que elimina por
 * construção a falha de um cliente pedir dado de outro usuário.
 *
 * `ParseUUIDPipe` no `:id` rejeita formato inválido com 400 antes de tocar o banco.
 * Sem ele, um id malformado chegaria ao Postgres e viraria erro de tipo — 500 em vez
 * de 400, e com mensagem do driver na resposta.
 */
@ApiTags('simulations')
@ApiBearerAuth('access-token')
@Controller('simulations')
export class SimulationsController {
  constructor(
    private readonly createSimulation: CreateSimulationUseCase,
    private readonly getSimulation: GetSimulationUseCase,
    private readonly getSchedule: GetScheduleUseCase,
    private readonly listSimulations: ListSimulationsUseCase,
    private readonly deleteSimulation: DeleteSimulationUseCase,
    private readonly addExtraPayment: AddExtraPaymentUseCase,
    private readonly compareSystems: CompareSystemsUseCase,
  ) {}

  @ApiOperation({
    summary: 'Cria e calcula uma simulação',
    description:
      'Valida elegibilidade (LTV, renda, prazo), persiste e devolve o resumo com ' +
      'CET. A tabela de amortização NÃO é persistida — é recalculada sob demanda ' +
      '(ADR-003) e tem endpoint próprio.',
  })
  @ApiResponse({ status: 201, description: 'Criada.' })
  @ApiResponse({ status: 400, description: 'VALIDATION_ERROR — entrada malformada.' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED.' })
  @ApiResponse({ status: 422, description: 'Regra de negócio violada — ver `code`.' })
  @Post()
  async create(
    @CurrentUserId() userId: string,
    @Body() dto: CreateSimulationDto,
  ): Promise<CreateSimulationOutput> {
    return this.createSimulation.execute({ ...dto, userId });
  }

  @ApiOperation({
    summary: 'Lista as simulações do usuário',
    description: 'Paginada, mais recentes primeiro. Item enxuto: sem CET nem totais.',
  })
  @ApiResponse({ status: 200, description: 'Página de simulações.' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED.' })
  @Get()
  async list(
    @CurrentUserId() userId: string,
    @Query() query: PaginationQueryDto,
  ): Promise<Page<SimulationListItem>> {
    return this.listSimulations.execute({ userId, ...query });
  }

  /**
   * `/compare` e `/preview` vêm ANTES de `/:id`.
   *
   * A ordem importa: o Nest casa rotas na ordem de declaração, e `/:id` capturaria
   * `/compare` como se `compare` fosse um id. Com `ParseUUIDPipe` isso viraria um 400
   * confuso em vez de executar a comparação.
   */
  @ApiOperation({
    summary: 'Compara SAC e Price',
    description:
      'Mesmos parâmetros, os dois sistemas lado a lado. Não persiste nada. O SAC ' +
      'começa com parcela maior e cobra menos juros no total.',
  })
  @ApiResponse({ status: 200, description: 'Comparação.' })
  @ApiResponse({ status: 422, description: 'Regra de negócio violada — ver `code`.' })
  @Post('compare')
  @HttpCode(HttpStatus.OK)
  compare(@Body() dto: CreateSimulationDto): CompareSystemsOutput {
    return this.compareSystems.execute(dto);
  }

  /**
   * Cálculo público, sem persistir e sem autenticação (SPEC seção 4).
   *
   * Rate limit próprio e mais restritivo: é a única rota que aceita trabalho de
   * qualquer um sem identificação, e cada chamada custa uma tabela de até 420 meses
   * mais uma busca de raiz para o CET.
   */
  @ApiOperation({
    summary: 'Cálculo público, sem autenticação',
    description: 'Não persiste e não exige token. Rate limit de 10/min por IP.',
  })
  @ApiResponse({ status: 200, description: 'Comparação calculada.' })
  @ApiResponse({ status: 429, description: 'RATE_LIMIT_EXCEEDED.' })
  @Public()
  @Throttle(PUBLIC_PREVIEW_THROTTLE)
  @Post('preview')
  @HttpCode(HttpStatus.OK)
  preview(@Body() dto: CreateSimulationDto): CompareSystemsOutput {
    return this.compareSystems.execute(dto);
  }

  @ApiOperation({ summary: 'Resumo da simulação' })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Id da simulação.' })
  @ApiResponse({ status: 200, description: 'Resumo com totais e CET.' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED.' })
  @ApiResponse({
    status: 404,
    description: 'SIMULATION_NOT_FOUND — inexistente OU de outro usuário (ADR-015).',
  })
  @Get(':id')
  async findOne(
    @CurrentUserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CreateSimulationOutput> {
    return this.getSimulation.execute({ simulationId: id, userId });
  }

  /** Alias explícito de `GET /:id`, previsto no SPEC. */
  @ApiOperation({ summary: 'Resumo (rota explícita do SPEC)' })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Id da simulação.' })
  @ApiResponse({
    status: 404,
    description: 'SIMULATION_NOT_FOUND — inexistente OU de outro usuário (ADR-015).',
  })
  @Get(':id/summary')
  async summary(
    @CurrentUserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CreateSimulationOutput> {
    return this.getSimulation.execute({ simulationId: id, userId });
  }

  @ApiOperation({
    summary: 'Tabela de amortização paginada',
    description:
      'Recalculada a cada leitura (ADR-003). `total` é o número de meses do contrato.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Id da simulação.' })
  @ApiResponse({ status: 200, description: 'Página da tabela.' })
  @ApiResponse({
    status: 404,
    description: 'SIMULATION_NOT_FOUND — inexistente OU de outro usuário (ADR-015).',
  })
  @Get(':id/schedule')
  async schedule(
    @CurrentUserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PaginationQueryDto,
  ): Promise<Page<ScheduleEntry>> {
    return this.getSchedule.execute({ simulationId: id, userId, ...query });
  }

  @ApiOperation({
    summary: 'Registra aporte extraordinário',
    description:
      'Devolve juros economizados, encargos economizados e meses eliminados. ' +
      'Validado ANTES de persistir: aporte inválido não deixa rastro no banco.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Id da simulação.' })
  @ApiResponse({ status: 201, description: 'Aporte registrado.' })
  @ApiResponse({
    status: 404,
    description: 'SIMULATION_NOT_FOUND — inexistente OU de outro usuário (ADR-015).',
  })
  @ApiResponse({
    status: 422,
    description: 'EXTRA_PAYMENT_OUT_OF_RANGE ou EXTRA_PAYMENT_EXCEEDS_BALANCE.',
  })
  @Post(':id/extra-payments')
  async createExtraPayment(
    @CurrentUserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddExtraPaymentDto,
  ): Promise<{ id: string; simulationId: string; newTermMonths: number }> {
    return this.addExtraPayment.execute({ ...dto, simulationId: id, userId });
  }

  // 204: a exclusão não tem corpo de resposta.
  @ApiOperation({ summary: 'Remove a simulação' })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Id da simulação.' })
  @ApiResponse({ status: 204, description: 'Removida.' })
  @ApiResponse({
    status: 404,
    description: 'SIMULATION_NOT_FOUND — inexistente OU de outro usuário (ADR-015).',
  })
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.deleteSimulation.execute({ simulationId: id, userId });
  }
}
