import { Global, Module } from '@nestjs/common';

import {
  EXTRA_PAYMENT_REPOSITORY,
  SIMULATION_REPOSITORY,
  USER_REPOSITORY,
} from '../../domain/repositories/tokens';
import { PrismaService } from './prisma/prisma.service';
import { PrismaExtraPaymentRepository } from './repositories/prisma-extra-payment.repository';
import { PrismaSimulationRepository } from './repositories/prisma-simulation.repository';
import { PrismaUserRepository } from './repositories/prisma-user.repository';

/**
 * Liga as interfaces de repositório às implementações Prisma.
 *
 * **Este é o único lugar do projeto onde essa amarração existe.** Casos de uso
 * recebem a interface por token de injeção e nunca souberam que Prisma existe — trocar
 * Postgres por outro armazenamento seria mudar só este arquivo.
 *
 * Interfaces do TypeScript somem na compilação, então não podem ser usadas como token
 * de DI. Daí os símbolos em `domain/repositories/tokens.ts`: são constantes de string
 * que sobrevivem ao runtime, e que continuam morando no domínio junto do contrato que
 * nomeiam.
 */
@Global()
@Module({
  providers: [
    PrismaService,
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    { provide: SIMULATION_REPOSITORY, useClass: PrismaSimulationRepository },
    { provide: EXTRA_PAYMENT_REPOSITORY, useClass: PrismaExtraPaymentRepository },
  ],
  exports: [
    PrismaService,
    USER_REPOSITORY,
    SIMULATION_REPOSITORY,
    EXTRA_PAYMENT_REPOSITORY,
  ],
})
export class DatabaseModule {}
