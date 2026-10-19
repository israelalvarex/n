// application/resolve-resource-value.use-case.ts
import { Inject, Injectable } from '@nestjs/common';
import { METRIC_STORE_PORT } from '../domain/ports/resource-store.port';
import type { MetricStorePort } from '../domain/ports/resource-store.port';
import { resolveMetric } from '../domain/resolve-metric';

/**
 * Junta el puerto (trae datos) con el dominio (calcula) -- el controller
 * no debe saber cómo se arma esto, solo pedir "resuélveme X para tal año".
 */
@Injectable()
export class ResolveResourceValueUseCase {
  constructor(@Inject(METRIC_STORE_PORT) private readonly store: MetricStorePort) {}

  async execute(
    code: string,
    fiscalYearId: number,
    businessUnitId?: number,
    departmentId?: number,
  ): Promise<number> {
    const metrics = await this.store.getMetricWithDependencies(code);
    if (metrics.length === 0) {
      throw new Error(`Métrica desconocida: "${code}"`);
    }

    const byCode = new Map(metrics.map((m) => [m.code, m]));
    const idToCode = new Map(metrics.map((m) => [m.id, m.code]));
    const baseCodes = metrics.filter((m) => m.type === 'base').map((m) => m.code);

    const rawValues = await this.store.getBaseValues(baseCodes, fiscalYearId, businessUnitId, departmentId);
    const values = new Map(rawValues.map((v) => [idToCode.get(v.metricId)!, v.value]));

    return resolveMetric(code, byCode, values);
  }
}
