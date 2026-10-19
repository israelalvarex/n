// domain/resolve-metric.ts
import { create, all } from 'mathjs';
import { Metric } from './metric';
import { extractSymbols } from './extract-symbols';

// Instancia restringida: las fórmulas vienen de datos capturados por el
// equipo del cliente (no de código), así que se tratan como no confiables
// -- se deshabilitan las funciones que mathjs marca como riesgosas si se
// invocan DESDE DENTRO de una expresión (import/createUnit/reviver/
// evaluate/parse/simplify/derivative/resolve). La referencia a `evaluate`
// se guarda ANTES de deshabilitarla: es la misma función que usamos
// nosotros para correr la fórmula completa, así que hay que capturarla
// primero -- después de deshabilitarla, sigue bloqueada para cualquier
// fórmula que intente llamarla desde adentro, pero nuestra copia sigue
// funcionando.
const restrictedMath = create(all);
const safeEvaluate = restrictedMath.evaluate;
restrictedMath.import(
  {
    import: () => { throw new Error('Function import is disabled'); },
    createUnit: () => { throw new Error('Function createUnit is disabled'); },
    reviver: () => { throw new Error('Function reviver is disabled'); },
    evaluate: () => { throw new Error('Function evaluate is disabled'); },
    parse: () => { throw new Error('Function parse is disabled'); },
    simplify: () => { throw new Error('Function simplify is disabled'); },
    derivative: () => { throw new Error('Function derivative is disabled'); },
    resolve: () => { throw new Error('Function resolve is disabled'); },
  },
  { override: true },
);

export function resolveMetric(
  name: string,
  byName: Map<string, Metric>,
  values: Map<string, number>,
  memo: Map<string, number> = new Map(),
  resolving: Set<string> = new Set(),
): number {
  if (memo.has(name)) return memo.get(name)!;

  if (resolving.has(name)) {
    throw new Error(`Ciclo de dependencias detectado en "${name}"`);
  }

  const metric = byName.get(name);
  if (!metric) {
    throw new Error(`Métrica desconocida: "${name}"`);
  }

  if (metric.type === 'base') {
    const value = values.get(name);
    if (value === undefined) {
      throw new Error(`Falta el valor base de "${name}"`);
    }
    memo.set(name, value);
    return value;
  }

  resolving.add(name);
  const dependencyNames = extractSymbols(metric.expression);
  const scope: Record<string, number> = {};
  for (const dep of dependencyNames) {
    scope[dep] = resolveMetric(dep, byName, values, memo, resolving);
  }
  resolving.delete(name);

  const result = safeEvaluate(metric.expression, scope);
  if (typeof result !== 'number' || Number.isNaN(result)) {
    throw new Error(`La fórmula de "${name}" no evaluó a un número`);
  }

  memo.set(name, result);
  return result;
}
