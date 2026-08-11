import { Module } from '@nestjs/common';

import { AuthModule } from './infra/auth/auth.module';
import { DatabaseModule } from './infra/database/database.module';
import { HealthController } from './infra/http/health/health.controller';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [HealthController],
})
export class AppModule {}
