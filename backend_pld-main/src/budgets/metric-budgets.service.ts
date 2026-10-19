import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { AuthorizationService } from '../auth/authorization.service';
import { PrismaService } from '../prisma/prisma.service';
import { MONTHS } from './calculation.service';

/**
 * La hoja de Ingresos y metas: una metrica (Ingresos Maquinas, DAU...) casino
 * por casino y mes, en el ejercicio que se presupuesta.
 *
 * Funciona como la hoja de presupuesto: el modelo publica tres bandas por mes
 * y los cierres de los años anteriores; lo que se decide por casino y mes se
 * guarda aqui (metric_budget_month) con la opcion elegida, o el importe
 * capturado a mano. Para las bandas y los cierres el cliente manda la opcion
 * y el servidor calcula el importe con la misma consulta que pinta la hoja
 * (/metrics/casino-metrics), asi lo guardado es exactamente lo que se veia.
 */

/**
 * Las metricas que NO son de esta hoja: el gasto se presupuesta cuenta por
 * cuenta en la hoja del departamento. Cualquier otra metrica publicada
 * (metric_definition) se puede presupuestar aqui.
 */
const NO_SON_INGRESOS = ['Gastos Sucursales'];

const BANDAS = ['predicted', 'lower', 'upper'] as const;
type Banda = (typeof BANDAS)[number];

export interface CambioMesMetrica {
  /** 0 = enero. */
  month: number;
  /** "predicted" | "lower" | "upper", "y2025" o "manual". */
  variant: string;
  amount?: number;
  reason?: string;
}

export interface CambioCasino {
  businessUnitId: number;
  months: CambioMesMetrica[];
}

@Injectable()
export class MetricBudgetsService {
  constructor(
    private prisma: PrismaService,
    private authz: AuthorizationService,
  ) {}

  /** Lo guardado de una metrica en el ejercicio, por casino, dentro del alcance de quien lee. */
  async leer(userId: number, metric: string, fiscalYearId: number) {
    await this.validarMetrica(metric);
    const fiscalYear = await this.prisma.fiscalYear.findUnique({ where: { id: fiscalYearId }, select: { id: true, year: true } });
    if (!fiscalYear) throw new NotFoundException('El ejercicio no existe');
    const scope = await this.authz.getUserScope(userId);

    const rows = await this.prisma.metricBudgetMonth.findMany({
      where: {
        fiscalYearId,
        metric,
        ...(scope.isSuperadmin || scope.allBusinessUnits ? {} : { businessUnitId: { in: scope.businessUnitIds } }),
      },
      select: { businessUnitId: true, month: true, amount: true, variant: true, isOverride: true, overrideReason: true },
    });

    const porCasino = new Map<number, typeof rows>();
    for (const r of rows) porCasino.set(r.businessUnitId, [...(porCasino.get(r.businessUnitId) ?? []), r]);

    return {
      metric,
      fiscalYear,
      units: [...porCasino.entries()].map(([businessUnitId, meses]) => ({
        businessUnitId,
        months: MONTHS.flatMap((m) => {
          const x = meses.find((r) => r.month === m);
          return x
            ? [{ month: m, amount: x.amount, variant: x.variant, isOverride: x.isOverride, overrideReason: x.overrideReason }]
            : [];
        }),
      })),
    };
  }

  /** Todo lo que cambio en la hoja de la metrica, en una escritura. Devuelve la hoja guardada. */
  async guardar(userId: number, metric: string, fiscalYearId: number, cambios: CambioCasino[]) {
    await this.validarMetrica(metric);
    const fiscalYear = await this.prisma.fiscalYear.findUnique({ where: { id: fiscalYearId }, select: { year: true, isOpen: true } });
    if (!fiscalYear) throw new NotFoundException('El ejercicio no existe');
    if (!fiscalYear.isOpen) throw new ForbiddenException('El ejercicio ya esta cerrado');

    const scope = await this.authz.getUserScope(userId);
    const alcance = (bu: number) => scope.isSuperadmin || scope.allBusinessUnits || scope.businessUnitIds.includes(bu);
    for (const c of cambios) {
      if (!alcance(c.businessUnitId)) throw new ForbiddenException('Ese casino esta fuera de tu alcance');
    }

    // Que hace falta del modelo: bandas, y cierres de que años.
    const anios = new Set<number>();
    let pideBandas = false;
    for (const c of cambios)
      for (const m of c.months) {
        if (!Number.isInteger(m.month) || m.month < 0 || m.month > 11) throw new BadRequestException('Mes fuera de rango');
        if (BANDAS.includes(m.variant as Banda)) pideBandas = true;
        else if (/^y\d{4}$/.test(m.variant)) anios.add(Number(m.variant.slice(1)));
        else if (m.variant !== 'manual') throw new BadRequestException(`Opcion desconocida: ${m.variant}`);
      }

    const casinos = [...new Set(cambios.map((c) => c.businessUnitId))];
    const ids = await this.idsDeMetrica(metric);
    const bandas = pideBandas && casinos.length ? await this.bandas(ids, casinos, fiscalYear.year) : new Map<string, Record<Banda, number>>();
    const cierres = anios.size && casinos.length ? await this.cierres(ids, casinos, [...anios]) : new Map<string, number>();

    const porMes = new Map<string, Prisma.Sql>();
    for (const c of cambios)
      for (const m of c.months) {
        let amount: number;
        let override = false;
        let reason: string | null = null;
        if (m.variant === 'manual') {
          if (typeof m.amount !== 'number' || !Number.isFinite(m.amount)) throw new BadRequestException('Falta el importe de la captura');
          amount = m.amount;
          override = true;
          reason = (m.reason ?? '').trim().length >= 5 ? m.reason!.trim().slice(0, 255) : 'Captura directa en la hoja';
        } else if (BANDAS.includes(m.variant as Banda)) {
          amount = bandas.get(`${c.businessUnitId}|${m.month}`)?.[m.variant as Banda] ?? 0;
        } else {
          amount = cierres.get(`${c.businessUnitId}|${m.variant.slice(1)}|${m.month}`) ?? 0;
        }
        const redondeado = Math.round(amount * 10000) / 10000;
        porMes.set(
          `${c.businessUnitId}|${m.month}`,
          Prisma.sql`(${fiscalYearId}::int, ${c.businessUnitId}::int, ${metric}::varchar, CAST(${MONTHS[m.month]} AS "month"), ${redondeado}::numeric, ${m.variant}::varchar, ${override}::boolean, ${reason}::varchar, ${userId}::int, now())`,
        );
      }

    if (porMes.size) {
      await this.prisma.$executeRaw`
        INSERT INTO metric_budget_month (fiscal_year_id, business_unit_id, metric, month, amount, variant, is_override, override_reason, updated_by, updated_at)
        VALUES ${Prisma.join([...porMes.values()])}
        ON CONFLICT (fiscal_year_id, business_unit_id, metric, month) DO UPDATE SET
          amount = EXCLUDED.amount,
          variant = EXCLUDED.variant,
          is_override = EXCLUDED.is_override,
          override_reason = EXCLUDED.override_reason,
          updated_by = EXCLUDED.updated_by,
          updated_at = EXCLUDED.updated_at
      `;
    }
    return this.leer(userId, metric, fiscalYearId);
  }

  private async validarMetrica(metric: string) {
    const existe = await this.prisma.metricDefinition.count({ where: { name: metric } });
    if (!existe || NO_SON_INGRESOS.includes(metric)) {
      throw new BadRequestException(`La metrica «${metric}» no se presupuesta aqui`);
    }
  }

  /** Los ids de metric_definition con ese nombre (el de pronostico y el de entrenamiento). */
  private async idsDeMetrica(metric: string) {
    const defs = await this.prisma.metricDefinition.findMany({ where: { name: metric }, select: { id: true } });
    return defs.map((d) => d.id);
  }

  /** Las tres bandas por casino y mes, sumadas como /metrics/casino-metrics. */
  private async bandas(ids: string[], casinos: number[], year: number) {
    const out = new Map<string, Record<Banda, number>>();
    if (!ids.length) return out;
    const rows = await this.prisma.$queryRaw<
      { bu: number; month: number; predicted: Prisma.Decimal; lower: Prisma.Decimal | null; upper: Prisma.Decimal | null }[]
    >`
      SELECT mf.business_unit_id AS "bu", EXTRACT(MONTH FROM mf.date)::int AS "month",
             SUM(mf.predicted_value) AS "predicted", SUM(mf.lower_bound) AS "lower", SUM(mf.upper_bound) AS "upper"
      FROM metric_forecast mf
      WHERE mf.metric_code IN (${Prisma.join(ids)})
        AND mf.business_unit_id IN (${Prisma.join(casinos)})
        AND EXTRACT(YEAR FROM mf.date)::int = ${year}
      GROUP BY mf.business_unit_id, EXTRACT(MONTH FROM mf.date)
    `;
    for (const r of rows)
      out.set(`${r.bu}|${Number(r.month) - 1}`, {
        predicted: Number(r.predicted ?? 0),
        lower: Number(r.lower ?? 0),
        upper: Number(r.upper ?? 0),
      });
    return out;
  }

  /** Los cierres de los años pedidos por casino y mes, sumados como /metrics/casino-metrics. */
  private async cierres(ids: string[], casinos: number[], anios: number[]) {
    const out = new Map<string, number>();
    if (!ids.length) return out;
    const rows = await this.prisma.$queryRaw<{ bu: number; year: number; month: number; value: Prisma.Decimal }[]>`
      SELECT mt.business_unit_id AS "bu", EXTRACT(YEAR FROM mt.date)::int AS "year",
             EXTRACT(MONTH FROM mt.date)::int AS "month", SUM(mt.value) AS "value"
      FROM metric_training mt
      WHERE mt.metric_code IN (${Prisma.join(ids)})
        AND mt.business_unit_id IN (${Prisma.join(casinos)})
        AND EXTRACT(YEAR FROM mt.date)::int IN (${Prisma.join(anios)})
      GROUP BY mt.business_unit_id, EXTRACT(YEAR FROM mt.date), EXTRACT(MONTH FROM mt.date)
    `;
    for (const r of rows) out.set(`${r.bu}|${r.year}|${Number(r.month) - 1}`, Number(r.value ?? 0));
    return out;
  }
}
