// domain/ports/resource-store.port.ts
import { Metric } from '../metric';
import { MetricValue } from '../metric-value';

/** Token de inyección -- la infraestructura decide qué clase concreta responde a esto. */
export const METRIC_STORE_PORT = Symbol('METRIC_STORE_PORT');

/**
 * Lo que el dominio necesita del mundo exterior, sin saber que existe
 * Prisma. La capa de infraestructura implementa esto con consultas
 * reales; el dominio (resolveMetric) solo conoce esta interfaz.
 */
export interface MetricStorePort {
  /**
   * Trae la métrica pedida por code junto con TODAS sus dependencias
   * transitivas (Base y Anidadas) -- todo lo que resolveMetric() va a
   * necesitar, en un solo viaje, para no tener que pedir datos otra vez
   * a medio camino de resolver el árbol.
   */
  getMetricWithDependencies(code: string): Promise<Metric[]>;

  /**
   * Valores históricos (solo métricas tipo 'base') para el año fiscal
   * dado. Se piden en lote por code, no uno por uno.
   *
   * businessUnitId/departmentId son el scope de resolución: para cada
   * metrica se elige la fila más específica que aplique (exacta > solo
   * casino > solo departamento > global), no un valor por fila cruda --
   * ver PrismaMetricStoreAdapter.getBaseValues para el criterio exacto.
   */
  getBaseValues(
    codes: string[],
    fiscalYearId: number,
    businessUnitId?: number,
    departmentId?: number,
  ): Promise<MetricValue[]>;
}
