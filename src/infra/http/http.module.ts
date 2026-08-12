import { Module } from '@nestjs/common';

import { AddExtraPaymentUseCase } from '../../application/use-cases/add-extra-payment';
import { AuthenticateUserUseCase } from '../../application/use-cases/authenticate-user';
import { CompareSystemsUseCase } from '../../application/use-cases/compare-systems';
import { CreateSimulationUseCase } from '../../application/use-cases/create-simulation';
import { DeleteSimulationUseCase } from '../../application/use-cases/delete-simulation';
import { GetProfileUseCase } from '../../application/use-cases/get-profile';
import { GetScheduleUseCase } from '../../application/use-cases/get-schedule';
import { GetSimulationUseCase } from '../../application/use-cases/get-simulation';
import { ListSimulationsUseCase } from '../../application/use-cases/list-simulations';
import { RefreshTokenUseCase } from '../../application/use-cases/refresh-token';
import { RegisterUserUseCase } from '../../application/use-cases/register-user';
import type { Clock } from '../../application/ports/clock';
import { SystemClock } from '../../application/ports/clock';
import type { IdGenerator } from '../../application/ports/id-generator';
import { UuidGenerator } from '../../application/ports/id-generator';
import type { PasswordHasher } from '../../application/ports/password-hasher';
import type { TokenService } from '../../application/ports/token-service';
import type { EligibilityPolicy } from '../../domain/policies/eligibility-policy';
import type { ExtraPaymentRepository } from '../../domain/repositories/extra-payment-repository';
import type { SimulationRepository } from '../../domain/repositories/simulation-repository';
import {
  EXTRA_PAYMENT_REPOSITORY,
  SIMULATION_REPOSITORY,
  USER_REPOSITORY,
} from '../../domain/repositories/tokens';
import type { UserRepository } from '../../domain/repositories/user-repository';
import { PASSWORD_HASHER, TOKEN_SERVICE } from '../auth/tokens';
import { AuthController } from './controllers/auth.controller';
import { SimulationsController } from './controllers/simulations.controller';
import { HealthController } from './health/health.controller';
import { CLOCK, ELIGIBILITY_POLICY, ID_GENERATOR } from './tokens';
import { loadEligibilityPolicy } from './eligibility-policy.factory';

/**
 * Camada HTTP: controllers e a fiação dos casos de uso.
 *
 * **Casos de uso são classes puras, sem `@Injectable()`** — a ADR-001 não permitiria
 * decorator do Nest em `application/`. Por isso cada um é registrado com `useFactory`
 * explícita, listando suas dependências. É mais verboso que injeção automática, e essa
 * verbosidade é o preço de manter a camada de aplicação livre do framework.
 */
@Module({
  controllers: [AuthController, SimulationsController, HealthController],
  providers: [
    { provide: CLOCK, useClass: SystemClock },
    { provide: ID_GENERATOR, useClass: UuidGenerator },
    { provide: ELIGIBILITY_POLICY, useFactory: loadEligibilityPolicy },

    {
      provide: RegisterUserUseCase,
      useFactory: (
        users: UserRepository,
        hasher: PasswordHasher,
        ids: IdGenerator,
        clock: Clock,
      ) => new RegisterUserUseCase(users, hasher, ids, clock),
      inject: [USER_REPOSITORY, PASSWORD_HASHER, ID_GENERATOR, CLOCK],
    },
    {
      provide: AuthenticateUserUseCase,
      useFactory: (users: UserRepository, hasher: PasswordHasher, tokens: TokenService) =>
        new AuthenticateUserUseCase(users, hasher, tokens),
      inject: [USER_REPOSITORY, PASSWORD_HASHER, TOKEN_SERVICE],
    },
    {
      provide: RefreshTokenUseCase,
      useFactory: (users: UserRepository, tokens: TokenService) =>
        new RefreshTokenUseCase(users, tokens),
      inject: [USER_REPOSITORY, TOKEN_SERVICE],
    },
    {
      provide: GetProfileUseCase,
      useFactory: (users: UserRepository) => new GetProfileUseCase(users),
      inject: [USER_REPOSITORY],
    },

    {
      provide: CreateSimulationUseCase,
      useFactory: (
        simulations: SimulationRepository,
        ids: IdGenerator,
        clock: Clock,
        policy: EligibilityPolicy,
      ) => new CreateSimulationUseCase(simulations, ids, clock, policy),
      inject: [SIMULATION_REPOSITORY, ID_GENERATOR, CLOCK, ELIGIBILITY_POLICY],
    },
    {
      provide: GetSimulationUseCase,
      useFactory: (simulations: SimulationRepository) =>
        new GetSimulationUseCase(simulations),
      inject: [SIMULATION_REPOSITORY],
    },
    {
      provide: GetScheduleUseCase,
      useFactory: (simulations: SimulationRepository) =>
        new GetScheduleUseCase(simulations),
      inject: [SIMULATION_REPOSITORY],
    },
    {
      provide: ListSimulationsUseCase,
      useFactory: (simulations: SimulationRepository) =>
        new ListSimulationsUseCase(simulations),
      inject: [SIMULATION_REPOSITORY],
    },
    {
      provide: DeleteSimulationUseCase,
      useFactory: (simulations: SimulationRepository) =>
        new DeleteSimulationUseCase(simulations),
      inject: [SIMULATION_REPOSITORY],
    },
    {
      provide: AddExtraPaymentUseCase,
      useFactory: (
        simulations: SimulationRepository,
        extras: ExtraPaymentRepository,
        ids: IdGenerator,
        clock: Clock,
      ) => new AddExtraPaymentUseCase(simulations, extras, ids, clock),
      inject: [SIMULATION_REPOSITORY, EXTRA_PAYMENT_REPOSITORY, ID_GENERATOR, CLOCK],
    },
    {
      provide: CompareSystemsUseCase,
      useFactory: (policy: EligibilityPolicy) => new CompareSystemsUseCase(policy),
      inject: [ELIGIBILITY_POLICY],
    },
  ],
})
export class HttpModule {}
