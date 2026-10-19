import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { MetricType } from '../../../generated/prisma/enums';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { extractSymbols } from '../domain/extract-symbols';
import { ResolveResourceValueUseCase } from '../application/resolve-resource-value.use-case';
import { CreateResourceDto, SetResourceValueDto, UpdateResourceDto } from './dto';

interface ForecastMonthlyRow {
  businessUnitId: number;
  businessUnitName: string;
  businessUnitType: string;
  metricDefinitionId: string;
  name: string;
  year: number;
  month: number;
  predictedValue: Prisma.Decimal;
  lowerBound: Prisma.Decimal | null;
  upperBound: Prisma.Decimal | null;
}

interface TrainingMonthlyRow {
  businessUnitId: number;
  businessUnitName: string;
  businessUnitType: string;
  metricDefinitionId: string;
  name: string;
  year: number;
  month: number;
  value: Prisma.Decimal;
}

interface DailyForecastRow {
  businessUnitId: number;
  businessUnitName: string;
  metricDefinitionId: string;
  name: string;
  date: Date;
  predictedValue: Prisma.Decimal;
  lowerBound: Prisma.Decimal | null;
  upperBound: Prisma.Decimal | null;
}

interface ExpenseTotalRow {
  departmentId: number;
  departmentName: string;
  account: string;
  businessUnitId: number;
  businessUnitName: string;
  year: number;
  value: Prisma.Decimal;
}

interface ExpenseMonthlyRow {
  departmentId: number;
  departmentName: string;
  account: string;
  businessUnitId: number;
  businessUnitName: string;
  year: number;
  month: number;
  value: Prisma.Decimal;
}

interface ExpenseDetailRow {
  departmentId: number;
  departmentName: string;
  businessUnitId: number;
  businessUnitName: string;
  account: string;
  subaccount: string | null;
  year: number;
  month: number;
  lowerBound: Prisma.Decimal | null;
  upperBound: Prisma.Decimal | null;
  value: Prisma.Decimal;
}

type Source = 'forecast' | 'training';

@Controller('metrics')
export class ResourcesController {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly resolveResourceValue: ResolveResourceValueUseCase,
  ) {}

  @Get('/all')
  async getAllMetrics() {
    const metrics = await this.prismaService.metricDefinition.findMany();

    return metrics;
  }

  /** Lista de departamentos, sin guards -- ya existe una versión protegida en /departments (catalogs). */
  @Get('/departments')
  async getDepartments() {
    return this.prismaService.department.findMany({
      where: { active: true },
      select: { id: true, code: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  private readonly ALLOWED_METRIC_NAMES = [
    'Retiros',
    'Registros',
    'Ingresos AyB',
    'DAU',
    'Ingresos Maquinas',
    'Ingresos Sportsbook',
  ];

  /**
   * KPIs/Ingresos por casino, agrupados por mes, sumando los valores
   * diarios de metric_forecast y metric_training. SQL crudo a propósito:
   * la tabla ronda 5.7M de filas, sumar en la app traería todo eso por red.
   *
   * Filtros, todos opcionales y en listas separadas por coma:
   *  - businessUnitId: default = todos
   *  - month: 1-12, default = los 12
   *  - year: default = año actual y 3 atrás
   *  - metric: nombres de MetricDefinition (ej. "Ingresos Maquinas"); resuelve
   *    TODOS los ids que compartan ese nombre (el de forecast y el de
   *    training a la vez, sin que tengas que conocerlos por separado).
   *    Siempre se cruza con ALLOWED_METRIC_NAMES, nunca lo reemplaza
   *    (nunca deja pasar "Gastos").
   *  - source: "forecast" | "training", default = ambos
   */
  @Get('/casino-metrics')
  async getCasinoMetricsByMonth(
    @Query('businessUnitId') businessUnitIdParam?: string,
    @Query('month') monthParam?: string,
    @Query('year') yearParam?: string,
    @Query('metric') metricParam?: string,
    @Query('source') sourceParam?: string,
  ) {
    const businessUnitIds = this.parseIntList(businessUnitIdParam);
    const months = this.parseIntList(monthParam) ?? Array.from({ length: 12 }, (_, i) => i + 1);
    const currentYear = new Date().getFullYear();
    const years =
      this.parseIntList(yearParam) ??
      [currentYear, currentYear - 1, currentYear - 2, currentYear - 3];
    const requestedMetricNames = metricParam ? metricParam.split(',').map((s) => s.trim()) : null;
    const sources = this.parseSources(sourceParam);

    this.validateMonths(months);

    const metricIds = await this.resolveMetricIds(requestedMetricNames);

    const filters = {
      businessUnitId: businessUnitIds ?? 'all',
      month: months,
      year: years,
      metric: requestedMetricNames ?? 'all',
      source: sources,
    };

    if (metricIds.length === 0) {
      return { filters, results: [] };
    }

    const forecastRows = sources.includes('forecast')
      ? await this.queryForecast(businessUnitIds, months, years, metricIds)
      : [];
    const trainingRows = sources.includes('training')
      ? await this.queryTraining(businessUnitIds, months, years, metricIds)
      : [];

    return { filters, results: this.groupByBusinessUnitAndMonth(forecastRows, trainingRows) };
  }

  private queryForecast(
    businessUnitIds: number[] | null,
    months: number[],
    years: number[],
    metricIds: string[],
  ) {
    const businessUnitFilter = businessUnitIds
      ? Prisma.sql`AND mf.business_unit_id IN (${Prisma.join(businessUnitIds)})`
      : Prisma.empty;

    return this.prismaService.$queryRaw<ForecastMonthlyRow[]>`
      SELECT
        mf.business_unit_id AS "businessUnitId",
        bu.name AS "businessUnitName",
        bu.type AS "businessUnitType",
        md.id AS "metricDefinitionId",
        md.name AS "name",
        EXTRACT(YEAR FROM mf.date)::int AS "year",
        EXTRACT(MONTH FROM mf.date)::int AS "month",
        SUM(mf.predicted_value) AS "predictedValue",
        SUM(mf.lower_bound) AS "lowerBound",
        SUM(mf.upper_bound) AS "upperBound"
      FROM metric_forecast mf
      JOIN metric_definition md ON md.id = mf.metric_code
      JOIN business_unit bu ON bu.id = mf.business_unit_id
      WHERE mf.metric_code IN (${Prisma.join(metricIds)})
        AND EXTRACT(YEAR FROM mf.date)::int IN (${Prisma.join(years)})
        AND EXTRACT(MONTH FROM mf.date)::int IN (${Prisma.join(months)})
        ${businessUnitFilter}
      GROUP BY mf.business_unit_id, bu.name, bu.type, md.id, md.name, EXTRACT(YEAR FROM mf.date), EXTRACT(MONTH FROM mf.date)
      ORDER BY "businessUnitId", "year", "month", md.name
    `;
  }

  private queryTraining(
    businessUnitIds: number[] | null,
    months: number[],
    years: number[],
    metricIds: string[],
  ) {
    const businessUnitFilter = businessUnitIds
      ? Prisma.sql`AND mt.business_unit_id IN (${Prisma.join(businessUnitIds)})`
      : Prisma.empty;

    return this.prismaService.$queryRaw<TrainingMonthlyRow[]>`
      SELECT
        mt.business_unit_id AS "businessUnitId",
        bu.name AS "businessUnitName",
        bu.type AS "businessUnitType",
        md.id AS "metricDefinitionId",
        md.name AS "name",
        EXTRACT(YEAR FROM mt.date)::int AS "year",
        EXTRACT(MONTH FROM mt.date)::int AS "month",
        SUM(mt.value) AS "value"
      FROM metric_training mt
      JOIN metric_definition md ON md.id = mt.metric_code
      JOIN business_unit bu ON bu.id = mt.business_unit_id
      WHERE mt.metric_code IN (${Prisma.join(metricIds)})
        AND EXTRACT(YEAR FROM mt.date)::int IN (${Prisma.join(years)})
        AND EXTRACT(MONTH FROM mt.date)::int IN (${Prisma.join(months)})
        ${businessUnitFilter}
      GROUP BY mt.business_unit_id, bu.name, bu.type, md.id, md.name, EXTRACT(YEAR FROM mt.date), EXTRACT(MONTH FROM mt.date)
      ORDER BY "businessUnitId", "year", "month", md.name
    `;
  }

  private groupByBusinessUnitAndMonth(
    forecastRows: ForecastMonthlyRow[],
    trainingRows: TrainingMonthlyRow[],
  ) {
    const businessUnits = new Map<number, Map<string, { month: string; metrics: unknown[] }>>();
    const businessUnitNames = new Map<number, string>();
    const businessUnitTypes = new Map<number, string>();

    const getBucket = (businessUnitId: number, businessUnitName: string, businessUnitType: string, year: number, month: number) => {
      businessUnitNames.set(businessUnitId, businessUnitName);
      businessUnitTypes.set(businessUnitId, businessUnitType);
      if (!businessUnits.has(businessUnitId)) businessUnits.set(businessUnitId, new Map());
      const months = businessUnits.get(businessUnitId)!;
      const key = `${year}-${String(month).padStart(2, '0')}`;
      if (!months.has(key)) months.set(key, { month: key, metrics: [] });
      return months.get(key)!;
    };

    for (const row of forecastRows) {
      getBucket(row.businessUnitId, row.businessUnitName, row.businessUnitType, row.year, row.month).metrics.push({
        metricDefinitionId: row.metricDefinitionId,
        name: row.name,
        source: 'forecast' as const,
        predictedValue: row.predictedValue,
        lowerBound: row.lowerBound,
        upperBound: row.upperBound,
      });
    }

    for (const row of trainingRows) {
      getBucket(row.businessUnitId, row.businessUnitName, row.businessUnitType, row.year, row.month).metrics.push({
        metricDefinitionId: row.metricDefinitionId,
        name: row.name,
        source: 'training' as const,
        value: row.value,
      });
    }

    return [...businessUnits.entries()]
      .map(([businessUnitId, months]) => ({
        businessUnitId,
        businessUnitName: businessUnitNames.get(businessUnitId)!,
        // casino | fnb | sportsbook | online (business_unit.type): para agrupar sin adivinar por el nombre.
        businessUnitType: businessUnitTypes.get(businessUnitId)!,
        months: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)),
      }))
      .sort((a, b) => a.businessUnitId - b.businessUnitId);
  }

  /** Resuelve nombres -> ids de MetricDefinition, siempre acotado a ALLOWED_METRIC_NAMES. */
  private async resolveMetricIds(requestedNames: string[] | null): Promise<string[]> {
    const defs = await this.prismaService.metricDefinition.findMany({
      where: {
        name: { in: this.ALLOWED_METRIC_NAMES },
        ...(requestedNames ? { name: { in: requestedNames } } : {}),
      },
      select: { id: true },
    });
    return defs.map((d) => d.id);
  }

  /**
   * Igual que /casino-metrics pero SOLO forecast, SIN sumar (valores diarios
   * tal cual), y con la ventana fija de 1 año a partir de hoy (ej. si hoy es
   * 2027-01-01, trae hasta 2028-01-01).
   */
  @Get('/casino-metrics/daily-forecast')
  async getDailyForecast(
    @Query('businessUnitId') businessUnitIdParam?: string,
    @Query('metric') metricParam?: string,
  ) {
    const businessUnitIds = this.parseIntList(businessUnitIdParam);
    const requestedMetricNames = metricParam ? metricParam.split(',').map((s) => s.trim()) : null;
    const metricIds = await this.resolveMetricIds(requestedMetricNames);

    const from = new Date();
    from.setUTCHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setUTCFullYear(to.getUTCFullYear() + 1);

    const filters = {
      businessUnitId: businessUnitIds ?? 'all',
      metric: requestedMetricNames ?? 'all',
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
    };

    if (metricIds.length === 0) {
      return { filters, results: [] };
    }

    const businessUnitFilter = businessUnitIds
      ? Prisma.sql`AND mf.business_unit_id IN (${Prisma.join(businessUnitIds)})`
      : Prisma.empty;

    const rows = await this.prismaService.$queryRaw<DailyForecastRow[]>`
      SELECT
        mf.business_unit_id AS "businessUnitId",
        bu.name AS "businessUnitName",
        md.id AS "metricDefinitionId",
        md.name AS "name",
        mf.date AS "date",
        mf.predicted_value AS "predictedValue",
        mf.lower_bound AS "lowerBound",
        mf.upper_bound AS "upperBound"
      FROM metric_forecast mf
      JOIN metric_definition md ON md.id = mf.metric_code
      JOIN business_unit bu ON bu.id = mf.business_unit_id
      WHERE mf.metric_code IN (${Prisma.join(metricIds)})
        AND mf.date >= ${from}
        AND mf.date < ${to}
        ${businessUnitFilter}
      ORDER BY "businessUnitId", md.name, mf.date
    `;

    return { filters, results: this.groupDailyByBusinessUnitAndMetric(rows) };
  }

  private groupDailyByBusinessUnitAndMetric(rows: DailyForecastRow[]) {
    const businessUnits = new Map<
      number,
      Map<string, { metricDefinitionId: string; name: string; values: unknown[] }>
    >();
    const businessUnitNames = new Map<number, string>();

    for (const row of rows) {
      businessUnitNames.set(row.businessUnitId, row.businessUnitName);
      if (!businessUnits.has(row.businessUnitId)) businessUnits.set(row.businessUnitId, new Map());
      const metrics = businessUnits.get(row.businessUnitId)!;
      if (!metrics.has(row.metricDefinitionId)) {
        metrics.set(row.metricDefinitionId, {
          metricDefinitionId: row.metricDefinitionId,
          name: row.name,
          values: [],
        });
      }
      metrics.get(row.metricDefinitionId)!.values.push({
        date: row.date,
        predictedValue: row.predictedValue,
        lowerBound: row.lowerBound,
        upperBound: row.upperBound,
      });
    }

    return [...businessUnits.entries()]
      .map(([businessUnitId, metrics]) => ({
        businessUnitId,
        businessUnitName: businessUnitNames.get(businessUnitId)!,
        metrics: [...metrics.values()],
      }))
      .sort((a, b) => a.businessUnitId - b.businessUnitId);
  }

  private parseIntList(param?: string): number[] | null {
    if (!param) return null;
    const values = param.split(',').map((s) => parseInt(s.trim(), 10));
    if (values.some((v) => Number.isNaN(v))) {
      throw new BadRequestException(`Valor inválido en lista numérica: "${param}"`);
    }
    return values;
  }

  private validateMonths(months: number[]) {
    if (months.some((m) => m < 1 || m > 12)) {
      throw new BadRequestException('El parámetro "month" debe estar entre 1 y 12.');
    }
  }

  private parseSources(param?: string): Source[] {
    if (!param) return ['forecast', 'training'];
    const values = param.split(',').map((s) => s.trim());
    for (const v of values) {
      if (v !== 'forecast' && v !== 'training') {
        throw new BadRequestException('El parámetro "source" debe ser "forecast" y/o "training".');
      }
    }
    return values as Source[];
  }

  /** Ids de MetricDefinition "Gastos Sucursales" (forecast + budgeted/manual). */
  private async resolveExpenseMetricIds(): Promise<string[]> {
    const defs = await this.prismaService.metricDefinition.findMany({
      where: { name: 'Gastos Sucursales' },
      select: { id: true },
    });
    return defs.map((d) => d.id);
  }

  /**
   * Pantalla "Por casino": total del ciclo por cuenta (account) y casino,
   * para un o varios departamentos de "Gastos Sucursales". Sin desglose de
   * mes -- se suma directo. Por default solo training (lo capturado/real);
   * si pides ambas fuentes, se combinan en un solo total por celda.
   */
  @Get('/expenses/by-account')
  async getExpensesByAccount(
    @Query('businessUnitId') businessUnitIdParam?: string,
    @Query('department') departmentParam?: string,
    @Query('year') yearParam?: string,
    @Query('source') sourceParam?: string,
  ) {
    const businessUnitIds = this.parseIntList(businessUnitIdParam);
    const departments = this.parseIntList(departmentParam);
    const currentYear = new Date().getFullYear();
    const years =
      this.parseIntList(yearParam) ??
      [currentYear - 2, currentYear - 1, currentYear, currentYear + 1];
    const sources = this.parseSources(sourceParam ?? 'training');

    const filters = {
      businessUnitId: businessUnitIds ?? 'all',
      department: departments ?? 'all',
      year: years,
      source: sources,
    };

    const expenseIds = await this.resolveExpenseMetricIds();
    if (expenseIds.length === 0) return { filters, departments: [] };

    const rows: ExpenseTotalRow[] = [];
    if (sources.includes('training')) {
      rows.push(...(await this.queryExpenseTotals('metric_training', 'value', expenseIds, businessUnitIds, departments, years)));
    }
    if (sources.includes('forecast')) {
      rows.push(...(await this.queryExpenseTotals('metric_forecast', 'predicted_value', expenseIds, businessUnitIds, departments, years)));
    }

    return { filters, departments: this.groupExpenseTotals(rows) };
  }

  private queryExpenseTotals(
    table: 'metric_training' | 'metric_forecast',
    valueColumn: 'value' | 'predicted_value',
    metricIds: string[],
    businessUnitIds: number[] | null,
    departments: number[] | null,
    years: number[],
  ) {
    const tableSql = Prisma.raw(table);
    const valueSql = Prisma.raw(valueColumn);
    const businessUnitFilter = businessUnitIds
      ? Prisma.sql`AND t.business_unit_id IN (${Prisma.join(businessUnitIds)})`
      : Prisma.empty;
    const departmentFilter = departments
      ? Prisma.sql`AND t.department IN (${Prisma.join(departments)})`
      : Prisma.empty;

    return this.prismaService.$queryRaw<ExpenseTotalRow[]>`
      SELECT
        dedup.department AS "departmentId",
        d.name AS "departmentName",
        dedup.account AS "account",
        dedup.business_unit_id AS "businessUnitId",
        bu.name AS "businessUnitName",
        EXTRACT(YEAR FROM dedup.date)::int AS "year",
        SUM(dedup.value) AS "value"
      FROM (
        SELECT DISTINCT t.department, t.account, t.subaccount, t.business_unit_id, t.date, t.${valueSql} AS value
        FROM ${tableSql} t
        WHERE t.metric_code IN (${Prisma.join(metricIds)})
          AND t.department IS NOT NULL
          AND t.account IS NOT NULL
          AND EXTRACT(YEAR FROM t.date)::int IN (${Prisma.join(years)})
          ${businessUnitFilter}
          ${departmentFilter}
      ) dedup
      JOIN department d ON d.id = dedup.department
      JOIN business_unit bu ON bu.id = dedup.business_unit_id
      GROUP BY dedup.department, d.name, dedup.account, dedup.business_unit_id, bu.name, EXTRACT(YEAR FROM dedup.date)
      ORDER BY d.name, dedup.account, bu.name, "year"
    `;
  }

  /** NOTA: los años nunca se combinan entre sí -- cada año trae su propio total. */
  private groupExpenseTotals(rows: ExpenseTotalRow[]) {
    type Cell = { businessUnitName: string; value: Prisma.Decimal };
    const departments = new Map<
      number,
      {
        departmentName: string;
        accounts: Map<string, Map<number, Map<number, Cell>>>; // account -> year -> businessUnitId -> cell
      }
    >();

    for (const row of rows) {
      if (!departments.has(row.departmentId)) {
        departments.set(row.departmentId, { departmentName: row.departmentName, accounts: new Map() });
      }
      const dept = departments.get(row.departmentId)!;
      if (!dept.accounts.has(row.account)) dept.accounts.set(row.account, new Map());
      const byYear = dept.accounts.get(row.account)!;
      if (!byYear.has(row.year)) byYear.set(row.year, new Map());
      const byBu = byYear.get(row.year)!;
      const existing = byBu.get(row.businessUnitId);
      byBu.set(row.businessUnitId, {
        businessUnitName: row.businessUnitName,
        value: existing ? existing.value.add(row.value) : row.value,
      });
    }

    const currentYear = new Date().getFullYear();

    return [...departments.entries()].map(([departmentId, dept]) => {
      const accounts = [...dept.accounts.entries()].map(([account, byYear]) => {
        const years = [...byYear.entries()]
          .map(([year, byBu]) => {
            const byBusinessUnit = [...byBu.entries()].map(([businessUnitId, v]) => ({
              businessUnitId,
              businessUnitName: v.businessUnitName,
              value: v.value,
            }));
            const total = byBusinessUnit.reduce((acc, v) => acc.add(v.value), new Prisma.Decimal(0));
            return { year, source: (year > currentYear ? 'forecast' : 'training') as Source, byBusinessUnit, total };
          })
          .sort((a, b) => a.year - b.year);
        return { account, years };
      });

      // "Total del ciclo": suma cruzando cuentas, PERO cada año por separado.
      const totalsByYear = new Map<number, Map<number, Cell>>();
      for (const acc of accounts) {
        for (const yr of acc.years) {
          if (!totalsByYear.has(yr.year)) totalsByYear.set(yr.year, new Map());
          const byBu = totalsByYear.get(yr.year)!;
          for (const bu of yr.byBusinessUnit) {
            const existing = byBu.get(bu.businessUnitId);
            byBu.set(bu.businessUnitId, {
              businessUnitName: bu.businessUnitName,
              value: existing ? existing.value.add(bu.value) : bu.value,
            });
          }
        }
      }
      const totals = [...totalsByYear.entries()]
        .map(([year, byBu]) => {
          const byBusinessUnit = [...byBu.entries()].map(([businessUnitId, v]) => ({
            businessUnitId,
            businessUnitName: v.businessUnitName,
            value: v.value,
          }));
          const grandTotal = byBusinessUnit.reduce((acc, v) => acc.add(v.value), new Prisma.Decimal(0));
          return { year, source: (year > currentYear ? 'forecast' : 'training') as Source, byBusinessUnit, grandTotal };
        })
        .sort((a, b) => a.year - b.year);

      return { departmentId, departmentName: dept.departmentName, accounts, totals };
    });
  }

  /**
   * Pantalla "Por mes": igual que /expenses/by-account pero con desglose
   * mensual, más el total anual por cuenta/casino.
   */
  @Get('/expenses/by-account/monthly')
  async getExpensesByAccountMonthly(
    @Query('businessUnitId') businessUnitIdParam?: string,
    @Query('department') departmentParam?: string,
    @Query('month') monthParam?: string,
    @Query('year') yearParam?: string,
    @Query('source') sourceParam?: string,
  ) {
    const businessUnitIds = this.parseIntList(businessUnitIdParam);
    const departments = this.parseIntList(departmentParam);
    const months = this.parseIntList(monthParam) ?? Array.from({ length: 12 }, (_, i) => i + 1);
    const currentYear = new Date().getFullYear();
    const years =
      this.parseIntList(yearParam) ??
      [currentYear - 2, currentYear - 1, currentYear, currentYear + 1];
    const sources = this.parseSources(sourceParam ?? 'training');

    this.validateMonths(months);

    const filters = {
      businessUnitId: businessUnitIds ?? 'all',
      department: departments ?? 'all',
      month: months,
      year: years,
      source: sources,
    };

    const expenseIds = await this.resolveExpenseMetricIds();
    if (expenseIds.length === 0) return { filters, departments: [] };

    const rows: ExpenseMonthlyRow[] = [];
    if (sources.includes('training')) {
      rows.push(...(await this.queryExpenseMonthly('metric_training', 'value', expenseIds, businessUnitIds, departments, months, years)));
    }
    if (sources.includes('forecast')) {
      rows.push(...(await this.queryExpenseMonthly('metric_forecast', 'predicted_value', expenseIds, businessUnitIds, departments, months, years)));
    }

    return { filters, departments: this.groupExpenseMonthly(rows) };
  }

  private queryExpenseMonthly(
    table: 'metric_training' | 'metric_forecast',
    valueColumn: 'value' | 'predicted_value',
    metricIds: string[],
    businessUnitIds: number[] | null,
    departments: number[] | null,
    months: number[],
    years: number[],
  ) {
    const tableSql = Prisma.raw(table);
    const valueSql = Prisma.raw(valueColumn);
    const businessUnitFilter = businessUnitIds
      ? Prisma.sql`AND t.business_unit_id IN (${Prisma.join(businessUnitIds)})`
      : Prisma.empty;
    const departmentFilter = departments
      ? Prisma.sql`AND t.department IN (${Prisma.join(departments)})`
      : Prisma.empty;

    return this.prismaService.$queryRaw<ExpenseMonthlyRow[]>`
      SELECT
        dedup.department AS "departmentId",
        d.name AS "departmentName",
        dedup.account AS "account",
        dedup.business_unit_id AS "businessUnitId",
        bu.name AS "businessUnitName",
        EXTRACT(YEAR FROM dedup.date)::int AS "year",
        EXTRACT(MONTH FROM dedup.date)::int AS "month",
        SUM(dedup.value) AS "value"
      FROM (
        SELECT DISTINCT t.department, t.account, t.subaccount, t.business_unit_id, t.date, t.${valueSql} AS value
        FROM ${tableSql} t
        WHERE t.metric_code IN (${Prisma.join(metricIds)})
          AND t.department IS NOT NULL
          AND t.account IS NOT NULL
          AND EXTRACT(YEAR FROM t.date)::int IN (${Prisma.join(years)})
          AND EXTRACT(MONTH FROM t.date)::int IN (${Prisma.join(months)})
          ${businessUnitFilter}
          ${departmentFilter}
      ) dedup
      JOIN department d ON d.id = dedup.department
      JOIN business_unit bu ON bu.id = dedup.business_unit_id
      GROUP BY dedup.department, d.name, dedup.account, dedup.business_unit_id, bu.name, EXTRACT(YEAR FROM dedup.date), EXTRACT(MONTH FROM dedup.date)
      ORDER BY d.name, dedup.account, bu.name, "year", "month"
    `;
  }

  /** NOTA: los años nunca se combinan entre sí -- cada año trae su propio yearTotal. */
  private groupExpenseMonthly(rows: ExpenseMonthlyRow[]) {
    type Cell = { businessUnitName: string; value: Prisma.Decimal };
    const departments = new Map<
      number,
      {
        departmentName: string;
        accounts: Map<string, Map<number, Map<number, Map<number, Cell>>>>; // account -> year -> month -> businessUnitId -> cell
      }
    >();

    for (const row of rows) {
      if (!departments.has(row.departmentId)) {
        departments.set(row.departmentId, { departmentName: row.departmentName, accounts: new Map() });
      }
      const dept = departments.get(row.departmentId)!;
      if (!dept.accounts.has(row.account)) dept.accounts.set(row.account, new Map());
      const byYear = dept.accounts.get(row.account)!;
      if (!byYear.has(row.year)) byYear.set(row.year, new Map());
      const byMonth = byYear.get(row.year)!;
      if (!byMonth.has(row.month)) byMonth.set(row.month, new Map());
      const byBu = byMonth.get(row.month)!;
      const existing = byBu.get(row.businessUnitId);
      byBu.set(row.businessUnitId, {
        businessUnitName: row.businessUnitName,
        value: existing ? existing.value.add(row.value) : row.value,
      });
    }

    const currentYear = new Date().getFullYear();

    return [...departments.entries()].map(([departmentId, dept]) => {
      const accounts = [...dept.accounts.entries()].map(([account, byYear]) => {
        const years = [...byYear.entries()]
          .map(([year, byMonth]) => {
            const months = [...byMonth.entries()]
              .map(([month, byBu]) => {
                const byBusinessUnit = [...byBu.entries()].map(([businessUnitId, v]) => ({
                  businessUnitId,
                  businessUnitName: v.businessUnitName,
                  value: v.value,
                }));
                const total = byBusinessUnit.reduce((acc, v) => acc.add(v.value), new Prisma.Decimal(0));
                return { month, byBusinessUnit, total };
              })
              .sort((a, b) => a.month - b.month);
            const yearTotal = months.reduce((acc, m) => acc.add(m.total), new Prisma.Decimal(0));
            return { year, source: (year > currentYear ? 'forecast' : 'training') as Source, months, yearTotal };
          })
          .sort((a, b) => a.year - b.year);
        return { account, years };
      });
      return { departmentId, departmentName: dept.departmentName, accounts };
    });
  }

  /**
   * Pantalla de detalle (departamento + casino): desglose mensual por
   * cuenta y subcuenta. Años: actual y 2 atrás salen de metric_training
   * (ya ejercido/capturado); el año siguiente completo sale de
   * metric_forecast -- la fuente se deriva del año, no se elige a mano.
   */
  @Get('/expenses/detail')
  async getExpensesDetail(
    @Query('businessUnitId') businessUnitIdParam?: string,
    @Query('department') departmentParam?: string,
  ) {
    const businessUnitIds = this.parseIntList(businessUnitIdParam);
    const departments = this.parseIntList(departmentParam);
    const currentYear = new Date().getFullYear();
    const trainingYears = [currentYear - 2, currentYear - 1, currentYear];
    const forecastYears = [currentYear + 1];

    const filters = {
      businessUnitId: businessUnitIds ?? 'all',
      department: departments ?? 'all',
      years: { training: trainingYears, forecast: forecastYears },
    };

    const expenseIds = await this.resolveExpenseMetricIds();
    if (expenseIds.length === 0) return { filters, results: [] };

    const [trainingRows, forecastRows] = await Promise.all([
      this.queryExpenseDetail('metric_training', 'value', expenseIds, businessUnitIds, departments, trainingYears),
      this.queryExpenseDetail('metric_forecast', 'predicted_value', expenseIds, businessUnitIds, departments, forecastYears),
    ]);

    return { filters, results: this.groupExpenseDetail([...trainingRows, ...forecastRows]) };
  }

  private queryExpenseDetail(
    table: 'metric_training' | 'metric_forecast',
    valueColumn: 'value' | 'predicted_value',
    metricIds: string[],
    businessUnitIds: number[] | null,
    departments: number[] | null,
    years: number[],
  ) {
    const tableSql = Prisma.raw(table);
    const valueSql = Prisma.raw(valueColumn);
    const isForecast = table === 'metric_forecast';
    const businessUnitFilter = businessUnitIds
      ? Prisma.sql`AND t.business_unit_id IN (${Prisma.join(businessUnitIds)})`
      : Prisma.empty;
    const departmentFilter = departments
      ? Prisma.sql`AND t.department IN (${Prisma.join(departments)})`
      : Prisma.empty;
    // Solo forecast tiene lower_bound/upper_bound; training solo tiene value.
    const boundsDedupSelect = isForecast ? Prisma.sql`, t.lower_bound, t.upper_bound` : Prisma.empty;
    const boundsAggSelect = isForecast
      ? Prisma.sql`, SUM(dedup.lower_bound) AS "lowerBound", SUM(dedup.upper_bound) AS "upperBound"`
      : Prisma.sql`, NULL::numeric AS "lowerBound", NULL::numeric AS "upperBound"`;

    return this.prismaService.$queryRaw<ExpenseDetailRow[]>`
      SELECT
        dedup.department AS "departmentId",
        d.name AS "departmentName",
        dedup.business_unit_id AS "businessUnitId",
        bu.name AS "businessUnitName",
        dedup.account AS "account",
        dedup.subaccount AS "subaccount",
        EXTRACT(YEAR FROM dedup.date)::int AS "year",
        EXTRACT(MONTH FROM dedup.date)::int AS "month",
        SUM(dedup.value) AS "value"
        ${boundsAggSelect}
      FROM (
        SELECT DISTINCT t.department, t.account, t.subaccount, t.business_unit_id, t.date, t.${valueSql} AS value${boundsDedupSelect}
        FROM ${tableSql} t
        WHERE t.metric_code IN (${Prisma.join(metricIds)})
          AND t.department IS NOT NULL
          AND t.account IS NOT NULL
          AND EXTRACT(YEAR FROM t.date)::int IN (${Prisma.join(years)})
          ${businessUnitFilter}
          ${departmentFilter}
      ) dedup
      JOIN department d ON d.id = dedup.department
      JOIN business_unit bu ON bu.id = dedup.business_unit_id
      GROUP BY dedup.department, d.name, dedup.business_unit_id, bu.name, dedup.account, dedup.subaccount, EXTRACT(YEAR FROM dedup.date), EXTRACT(MONTH FROM dedup.date)
      ORDER BY d.name, bu.name, dedup.account, dedup.subaccount, "year", "month"
    `;
  }

  private groupExpenseDetail(rows: ExpenseDetailRow[]) {
    type MonthCell = { value: Prisma.Decimal; lowerBound: Prisma.Decimal | null; upperBound: Prisma.Decimal | null };
    type YearBucket = { source: Source; months: Map<number, MonthCell> };
    const businessUnits = new Map<
      number,
      {
        businessUnitName: string;
        departments: Map<
          number,
          {
            departmentName: string;
            accounts: Map<string, Map<string, YearBucket>>; // "account||subaccount" -> "year" -> bucket
          }
        >;
      }
    >();

    const currentYear = new Date().getFullYear();

    for (const row of rows) {
      if (!businessUnits.has(row.businessUnitId)) {
        businessUnits.set(row.businessUnitId, { businessUnitName: row.businessUnitName, departments: new Map() });
      }
      const bu = businessUnits.get(row.businessUnitId)!;
      if (!bu.departments.has(row.departmentId)) {
        bu.departments.set(row.departmentId, { departmentName: row.departmentName, accounts: new Map() });
      }
      const dept = bu.departments.get(row.departmentId)!;
      const accKey = `${row.account}||${row.subaccount ?? ''}`;
      if (!dept.accounts.has(accKey)) dept.accounts.set(accKey, new Map());
      const byYear = dept.accounts.get(accKey)!;
      const yearKey = String(row.year);
      if (!byYear.has(yearKey)) {
        byYear.set(yearKey, { source: row.year > currentYear ? 'forecast' : 'training', months: new Map() });
      }
      byYear.get(yearKey)!.months.set(row.month, {
        value: row.value,
        lowerBound: row.lowerBound,
        upperBound: row.upperBound,
      });
    }

    return [...businessUnits.entries()].map(([businessUnitId, bu]) => ({
      businessUnitId,
      businessUnitName: bu.businessUnitName,
      departments: [...bu.departments.entries()].map(([departmentId, dept]) => ({
        departmentId,
        departmentName: dept.departmentName,
        accounts: [...dept.accounts.entries()].map(([accKey, byYear]) => {
          const [account, subaccountRaw] = accKey.split('||');
          const years = [...byYear.entries()]
            .map(([year, bucket]) => {
              const isForecast = bucket.source === 'forecast';
              const months = Array.from({ length: 12 }, (_, i) => i + 1).map((month) => {
                const cell = bucket.months.get(month);
                return isForecast
                  ? {
                      month,
                      predictedValue: cell?.value ?? new Prisma.Decimal(0),
                      lowerBound: cell?.lowerBound ?? new Prisma.Decimal(0),
                      upperBound: cell?.upperBound ?? new Prisma.Decimal(0),
                    }
                  : { month, value: cell?.value ?? new Prisma.Decimal(0) };
              });
              const total = [...bucket.months.values()].reduce(
                (acc, c) => acc.add(c.value),
                new Prisma.Decimal(0),
              );
              return { year: Number(year), source: bucket.source, months, total };
            })
            .sort((a, b) => a.year - b.year);
          return { account, subaccount: subaccountRaw || null, years };
        }),
      })),
    }));
  }

  // ---------------------------------------------------------------------
  // CRUD de recursos (MetricResource)
  // ---------------------------------------------------------------------

  @Get('/resources')
  async listResources(
    @Query('type') typeParam?: string,
    @Query('businessUnitId') businessUnitIdParam?: string,
  ) {
    const businessUnitIds = this.parseIntList(businessUnitIdParam);
    const type = this.parseMetricType(typeParam);

    return this.prismaService.metricResource.findMany({
      where: {
        ...(type ? { type } : {}),
        ...(businessUnitIds ? { businessUnitId: { in: businessUnitIds } } : {}),
      },
      orderBy: { code: 'asc' },
    });
  }

  @Get('/resources/:id')
  async getResource(@Param('id') id: string) {
    const resource = await this.prismaService.metricResource.findUnique({
      where: { id },
      include: {
        dependsOn: { include: { dependsOnMetric: { select: { id: true, code: true, name: true, type: true } } } },
        dependents: { include: { metric: { select: { id: true, code: true, name: true, type: true } } } },
      },
    });
    if (!resource) throw new NotFoundException(`No existe el recurso "${id}"`);

    const { dependsOn, dependents, ...fields } = resource;
    return {
      ...fields,
      dependsOn: dependsOn.map((d) => d.dependsOnMetric),
      dependents: dependents.map((d) => d.metric),
    };
  }

  /** Todo lo que eventualmente se ve afectado si este recurso cambia -- no solo un nivel. */
  @Get('/resources/:id/impact')
  async getResourceImpact(@Param('id') id: string) {
    const root = await this.prismaService.metricResource.findUnique({
      where: { id },
      select: { id: true, code: true, name: true },
    });
    if (!root) throw new NotFoundException(`No existe el recurso "${id}"`);

    const collected = new Map<string, { id: string; code: string; name: string; type: string }>();
    let frontier = [id];

    while (frontier.length > 0) {
      const edges = await this.prismaService.metricDependency.findMany({
        where: { dependsOnMetricId: { in: frontier } },
        include: { metric: { select: { id: true, code: true, name: true, type: true } } },
      });
      const nextFrontier: string[] = [];
      for (const edge of edges) {
        if (edge.metric.id !== id && !collected.has(edge.metric.id)) {
          collected.set(edge.metric.id, edge.metric);
          nextFrontier.push(edge.metric.id);
        }
      }
      frontier = nextFrontier;
    }

    return { id: root.id, code: root.code, name: root.name, impacts: [...collected.values()] };
  }

  @Post('/resources')
  async createResource(@Body() body: CreateResourceDto) {
    if (body.type !== 'base' && body.type !== 'nested') {
      throw new BadRequestException('"type" debe ser "base" o "nested".');
    }
    if (body.type === 'nested' && !body.expression) {
      throw new BadRequestException('Un recurso "nested" requiere "expression".');
    }
    if (body.type === 'base' && body.expression) {
      throw new BadRequestException('Un recurso "base" no debe tener "expression".');
    }

    const dependencyIds =
      body.type === 'nested'
        ? await this.resolveDependencyIds(this.parseExpressionSymbols(body.expression!))
        : [];

    const created = await this.prismaService.metricResource.create({
      data: {
        code: body.code,
        name: body.name,
        type: body.type,
        expression: body.type === 'nested' ? body.expression : null,
        scope: body.scope as unknown as Prisma.InputJsonValue,
        businessUnitId: body.businessUnitId,
        createdBy: body.createdBy,
        howApplied: body.howApplied,
      },
    });

    if (dependencyIds.length > 0) {
      await this.prismaService.metricDependency.createMany({
        data: dependencyIds.map((dependsOnMetricId) => ({ metricId: created.id, dependsOnMetricId })),
      });
    }

    return created;
  }

  @Patch('/resources/:id')
  async updateResource(@Param('id') id: string, @Body() body: UpdateResourceDto) {
    const existing = await this.prismaService.metricResource.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`No existe el recurso "${id}"`);

    const data: Prisma.MetricResourceUpdateInput = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.scope !== undefined) data.scope = body.scope as unknown as Prisma.InputJsonValue;
    if (body.howApplied !== undefined) data.howApplied = body.howApplied;

    let newDependencyIds: string[] | null = null;

    if (body.expression !== undefined) {
      if (existing.type === 'base') {
        throw new BadRequestException('Un recurso "base" no puede tener "expression".');
      }
      newDependencyIds = await this.resolveDependencyIds(this.parseExpressionSymbols(body.expression));

      if (await this.dependsOnTransitively(newDependencyIds, id)) {
        throw new BadRequestException('Esa expresión crearía un ciclo de dependencias.');
      }

      data.expression = body.expression;
    }

    const updated = await this.prismaService.metricResource.update({ where: { id }, data });

    if (newDependencyIds !== null) {
      await this.prismaService.metricDependency.deleteMany({ where: { metricId: id } });
      if (newDependencyIds.length > 0) {
        await this.prismaService.metricDependency.createMany({
          data: newDependencyIds.map((dependsOnMetricId) => ({ metricId: id, dependsOnMetricId })),
        });
      }
    }

    return updated;
  }

  @Delete('/resources/:id')
  async deleteResource(@Param('id') id: string) {
    const existing = await this.prismaService.metricResource.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`No existe el recurso "${id}"`);

    const dependentsCount = await this.prismaService.metricDependency.count({
      where: { dependsOnMetricId: id },
    });
    if (dependentsCount > 0) {
      throw new ConflictException(
        `No se puede borrar: ${dependentsCount} recurso(s) dependen de este. Revisa /resources/${id}/impact.`,
      );
    }

    await this.prismaService.metricResource.delete({ where: { id } });
    return { deleted: true };
  }

  // ---------------------------------------------------------------------
  // Valores de un recurso Base (MetricResourceValue) -- histórico por año
  // ---------------------------------------------------------------------

  /**
   * Asigna (crea o actualiza) el valor de un recurso "base" para un año --
   * se manda el año real (2026), no el id interno.
   *
   * Sin businessUnitId/departmentId: valor GLOBAL (aplica a todo el scope
   * del recurso). Con uno o ambos: valor especifico de ese casino/depto --
   * asi es como "DAU" puede valer distinto en Ajijic que en Mty sin crear
   * un MetricResource por casino.
   */
  @Put('/resources/:id/values/:year')
  async setResourceValue(
    @Param('id') id: string,
    @Param('year', ParseIntPipe) year: number,
    @Body() body: SetResourceValueDto,
  ) {
    const resource = await this.prismaService.metricResource.findUnique({ where: { id } });
    if (!resource) throw new NotFoundException(`No existe el recurso "${id}"`);
    if (resource.type !== 'base') {
      throw new BadRequestException(
        'Solo los recursos "base" pueden tener un valor asignado -- un "nested" se calcula, no se captura.',
      );
    }

    const fiscalYear = await this.prismaService.fiscalYear.findUnique({ where: { year } });
    if (!fiscalYear) throw new NotFoundException(`No existe el año fiscal "${year}"`);

    if (body.businessUnitId !== undefined) {
      const exists = await this.prismaService.businessUnit.findUnique({ where: { id: body.businessUnitId } });
      if (!exists) throw new NotFoundException(`No existe la unidad de negocio "${body.businessUnitId}"`);
    }
    if (body.departmentId !== undefined) {
      const exists = await this.prismaService.department.findUnique({ where: { id: body.departmentId } });
      if (!exists) throw new NotFoundException(`No existe el departamento "${body.departmentId}"`);
    }

    const businessUnitId = body.businessUnitId ?? null;
    const departmentId = body.departmentId ?? null;

    // upsert no acepta null en una clave compuesta (limitacion del cliente
    // generado, no del motor) -- find + create/update manual en su lugar.
    const existingValue = await this.prismaService.metricResourceValue.findFirst({
      where: { metricId: id, fiscalYearId: fiscalYear.id, businessUnitId, departmentId },
    });

    if (existingValue) {
      return this.prismaService.metricResourceValue.update({
        where: { id: existingValue.id },
        data: { value: body.value, isProjection: body.isProjection ?? false },
      });
    }

    return this.prismaService.metricResourceValue.create({
      data: {
        metricId: id,
        fiscalYearId: fiscalYear.id,
        businessUnitId,
        departmentId,
        value: body.value,
        isProjection: body.isProjection ?? false,
        createdBy: body.createdBy,
      },
    });
  }

  /** Histórico de valores de un recurso Base a través de los años, con su scope (global o casino/depto específico). */
  @Get('/resources/:id/values')
  async listResourceValues(@Param('id') id: string) {
    const resource = await this.prismaService.metricResource.findUnique({ where: { id } });
    if (!resource) throw new NotFoundException(`No existe el recurso "${id}"`);

    return this.prismaService.metricResourceValue.findMany({
      where: { metricId: id },
      include: {
        fiscalYear: { select: { id: true, year: true } },
        businessUnit: { select: { code: true, name: true } },
        department: { select: { code: true, name: true } },
      },
      orderBy: [{ fiscalYear: { year: 'asc' } }, { businessUnit: { name: 'asc' } }],
    });
  }

  /**
   * Resuelve el valor real de un recurso (Base o Anidado) para un año --
   * este es el endpoint que de verdad calcula, todo lo demás es CRUD.
   *
   * businessUnitId/departmentId son opcionales: sin ellos resuelve con los
   * valores globales; con ellos, usa el valor más específico que exista
   * para ese casino/departamento (cae al global si no hay uno propio).
   */
  @Get('/resources/:id/resolve')
  async resolveResource(
    @Param('id') id: string,
    @Query('year', ParseIntPipe) year: number,
    @Query('businessUnitId') businessUnitIdRaw?: string,
    @Query('departmentId') departmentIdRaw?: string,
  ) {
    const resource = await this.prismaService.metricResource.findUnique({ where: { id } });
    if (!resource) throw new NotFoundException(`No existe el recurso "${id}"`);

    const fiscalYear = await this.prismaService.fiscalYear.findUnique({ where: { year } });
    if (!fiscalYear) throw new NotFoundException(`No existe el año fiscal "${year}"`);

    const businessUnitId = businessUnitIdRaw !== undefined ? Number(businessUnitIdRaw) : undefined;
    const departmentId = departmentIdRaw !== undefined ? Number(departmentIdRaw) : undefined;

    try {
      const value = await this.resolveResourceValue.execute(resource.code, fiscalYear.id, businessUnitId, departmentId);
      return { id, code: resource.code, name: resource.name, year, businessUnitId: businessUnitId ?? null, departmentId: departmentId ?? null, value };
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  private parseMetricType(type?: string): MetricType | undefined {
    if (!type) return undefined;
    if (type !== 'base' && type !== 'nested') {
      throw new BadRequestException('"type" debe ser "base" o "nested".');
    }
    return type;
  }

  /** Valida que la expresión compile (mathjs) y saca sus dependencias. */
  private parseExpressionSymbols(expression: string): string[] {
    try {
      return extractSymbols(expression);
    } catch (e) {
      throw new BadRequestException(`La expresión no es válida: ${(e as Error).message}`);
    }
  }

  /** Codes (símbolos de la expresión) -> ids de MetricResource. Truena si algún code no existe. */
  private async resolveDependencyIds(codes: string[]): Promise<string[]> {
    if (codes.length === 0) return [];
    const found = await this.prismaService.metricResource.findMany({
      where: { code: { in: codes } },
      select: { id: true, code: true },
    });
    const foundCodes = new Set(found.map((f) => f.code));
    const missing = codes.filter((c) => !foundCodes.has(c));
    if (missing.length > 0) {
      throw new BadRequestException(`Métrica(s) desconocida(s): ${missing.join(', ')}`);
    }
    return found.map((f) => f.id);
  }

  /** ¿Alguno de startIds depende (transitivamente) de targetId? Para detectar ciclos antes de guardar. */
  private async dependsOnTransitively(startIds: string[], targetId: string): Promise<boolean> {
    let frontier = startIds;
    const visited = new Set<string>(startIds);

    while (frontier.length > 0) {
      if (frontier.includes(targetId)) return true;

      const edges = await this.prismaService.metricDependency.findMany({
        where: { metricId: { in: frontier } },
        select: { dependsOnMetricId: true },
      });
      const nextFrontier: string[] = [];
      for (const edge of edges) {
        if (!visited.has(edge.dependsOnMetricId)) {
          visited.add(edge.dependsOnMetricId);
          nextFrontier.push(edge.dependsOnMetricId);
        }
      }
      frontier = nextFrontier;
    }
    return false;
  }
}