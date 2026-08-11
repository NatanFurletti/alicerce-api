import { Module } from '@nestjs/common';

import { HealthController } from './infra/http/health/health.controller';

@Module({
  controllers: [HealthController],
})
export class AppModule {}
