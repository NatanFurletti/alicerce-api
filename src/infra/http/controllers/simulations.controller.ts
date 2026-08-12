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

  @Post()
  async create(
    @CurrentUserId() userId: string,
    @Body() dto: CreateSimulationDto,
  ): Promise<CreateSimulationOutput> {
    return this.createSimulation.execute({ ...dto, userId });
  }

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
  @Public()
  @Throttle(PUBLIC_PREVIEW_THROTTLE)
  @Post('preview')
  @HttpCode(HttpStatus.OK)
  preview(@Body() dto: CreateSimulationDto): CompareSystemsOutput {
    return this.compareSystems.execute(dto);
  }

  @Get(':id')
  async findOne(
    @CurrentUserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CreateSimulationOutput> {
    return this.getSimulation.execute({ simulationId: id, userId });
  }

  /** Alias explícito de `GET /:id`, previsto no SPEC. */
  @Get(':id/summary')
  async summary(
    @CurrentUserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CreateSimulationOutput> {
    return this.getSimulation.execute({ simulationId: id, userId });
  }

  @Get(':id/schedule')
  async schedule(
    @CurrentUserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PaginationQueryDto,
  ): Promise<Page<ScheduleEntry>> {
    return this.getSchedule.execute({ simulationId: id, userId, ...query });
  }

  @Post(':id/extra-payments')
  async createExtraPayment(
    @CurrentUserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddExtraPaymentDto,
  ): Promise<{ id: string; simulationId: string; newTermMonths: number }> {
    return this.addExtraPayment.execute({ ...dto, simulationId: id, userId });
  }

  // 204: a exclusão não tem corpo de resposta.
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.deleteSimulation.execute({ simulationId: id, userId });
  }
}
