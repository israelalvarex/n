// infrastructure/prisma-metric-store.adapter.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MetricStorePort } from '../domain/ports/resource-store.port';
import { Metric, MetricScope } from '../domain/metric';
import { MetricValue } from '../domain/metric-value';

interface MetricResourceRow {
  id: string;
  code: string;
  type: string;
  scope: unknown;
  expression: string | null;
}

function toDomainMetric(row: MetricResourceRow): Metric {
  const scope = row.scope as MetricScope;
  if (row.type === 'base') {
    return { id: row.id, code: row.code, type: 'base', scope };
  }
  return { id: row.id, code: row.code, type: 'nested', scope, expression: row.expression ?? '' };
}

@Injectable()
export class PrismaMetricStoreAdapter implements MetricStorePort {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Trae la métrica por code y recorre MetricDependency nivel por nivel
   * (BFS) hasta juntar toda la cadena transitiva. Son pocos niveles en la
   * práctica, así que varias consultas chicas es más simple que un
   * WITH RECURSIVE -- si el árbol creciera mucho, ahí se justificaría.
   */
  async getMetricWithDependencies(code: string): Promise<Metric[]> {
    const root = await this.prisma.metricResource.findUnique({ where: { code } });
    if (!root) return [];

    const collected = new Map<string, MetricResourceRow>();
    collected.set(root.id, root);
    let frontier = [root.id];

    while (frontier.length > 0) {
      const edges = await this.prisma.metricDependency.findMany({
        where: { metricId: { in: frontier } },
        include: { dependsOnMetric: true },
      });

      const nextFrontier: string[] = [];
      for (const edge of edges) {
        const dep = edge.dependsOnMetric;
        if (!collected.has(dep.id)) {
          collected.set(dep.id, dep);
          nextFrontier.push(dep.id);
        }
      }
      frontier = nextFrontier;
    }

    return [...collected.values()].map(toDomainMetric);
  }

  /**
   * Valores históricos (solo aplica a métricas tipo 'base') para el año
   * fiscal dado, filtrados al scope pedido.
   *
   * Una métrica puede tener varias filas para el mismo año (una global y
   * una o más por casino/departamento) -- de esas, por cada métrica se
   * elige la más específica que aplique al scope pedido:
   *   1. exacta (mismo businessUnitId Y mismo departmentId)
   *   2. mismo businessUnitId, fila global de departamento (NULL)
   *   3. mismo departmentId, fila global de casino (NULL)
   *   4. global (NULL/NULL)
   * Una fila de OTRO casino/departamento nunca aplica, aunque exista.
   */
  async getBaseValues(
    codes: string[],
    fiscalYearId: number,
    businessUnitId?: number,
    departmentId?: number,
  ): Promise<MetricValue[]> {
    const rows = await this.prisma.metricResourceValue.findMany({
      where: {
        fiscalYearId,
        metric: { code: { in: codes }, type: 'base' },
      },
    });

    const specificity = (row: (typeof rows)[number]): number => {
      const buMatch = businessUnitId != null && row.businessUnitId === businessUnitId;
      const deptMatch = departmentId != null && row.departmentId === departmentId;
      if (buMatch && deptMatch) return 3;
      if (buMatch && row.departmentId == null) return 2;
      if (deptMatch && row.businessUnitId == null) return 2;
      if (row.businessUnitId == null && row.departmentId == null) return 1;
      return -1; // de otro casino/departamento -- no aplica a este scope
    };

    const best = new Map<string, { row: (typeof rows)[number]; score: number }>();
    for (const row of rows) {
      const score = specificity(row);
      if (score < 0) continue;
      const current = best.get(row.metricId);
      if (!current || score > current.score) best.set(row.metricId, { row, score });
    }

    return [...best.values()].map(({ row }) => ({
      metricId: row.metricId,
      fiscalYearId: row.fiscalYearId,
      value: Number(row.value),
      isProjection: row.isProjection,
      businessUnitId: row.businessUnitId,
      departmentId: row.departmentId,
    }));
  }
}
