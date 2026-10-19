import { Module } from '@nestjs/common';
import { ResourcesController } from './resources.controller';
import { PrismaMetricStoreAdapter } from './prisma-metric-store.adapter';
import { METRIC_STORE_PORT } from '../domain/ports/resource-store.port';
import { ResolveResourceValueUseCase } from '../application/resolve-resource-value.use-case';

@Module({
  imports: [],
  controllers: [ResourcesController],
  providers: [
    { provide: METRIC_STORE_PORT, useClass: PrismaMetricStoreAdapter },
    ResolveResourceValueUseCase,
  ],
  exports: [],
})
export class ResourcesModule {}
