// domain/metric-value.ts

/**
 * Un valor histórico de un recurso Base para un año fiscal específico.
 * Equivalente de dominio de una fila de MetricResourceValue -- solo
 * aplica a métricas tipo 'base'; un Anidado nunca se materializa, se
 * recalcula al vuelo con resolveMetric().
 */
export interface MetricValue {
  metricId: string;
  fiscalYearId: number;
  value: number;
  isProjection: boolean;
  businessUnitId: number | null;
  departmentId: number | null;
}
