import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { BudgetStatus, LineSource } from '../../generated/prisma/enums';
import { AuthorizationService } from '../auth/authorization.service';
import { PrismaService } from '../prisma/prisma.service';
import { BudgetsService } from './budgets.service';
import { MONTHS } from './calculation.service';

/**
 * Guardado por lote de la hoja de un departamento en un casino.
 *
 * La hoja pinta las cuentas de metricas (cierres de años anteriores y la
 * prediccion con sus bandas) y lo que se decide sobre ellas se guarda aqui, en
 * una sola peticion: el cliente junta los cambios de unos cientos de
 * milisegundos y los manda juntos. Antes era una peticion por mes (12 por
 * cuenta, ~350 para una precarga), cada una con su revision de sesion,
 * permisos, recalculo de totales y de avance.
 *
 * Para las bandas y los cierres el cliente manda la intencion ("este mes: la
 * banda alta"), no el numero: el servidor lo calcula con la misma consulta que
 * pinta la hoja, asi lo guardado es exactamente lo que se veia. La opcion
 * queda en `budget_line_month.variant`, y `is_override` se reserva para lo
 * que de verdad se capturo a mano.
 */

/** "predicted" | "lower" | "upper" (bandas), "y2025" (cierre de ese año), "manual". */
export type Variante = string;
const BANDAS = ['predicted', 'lower', 'upper'] as const;
type Banda = (typeof BANDAS)[number];

export interface CambioMes {
  /** 0 = enero. */
  month: number;
  variant: Variante;
  /** Solo en "manual". */
  amount?: number;
  /** Solo en "manual". */
  reason?: string;
}

export interface CambioRenglon {
  /** Renglon existente. */
  lineId?: number;
  /** Cuenta de metricas: se vincula a su renglon o se crea. */
  account?: string;
  subaccount?: string | null;
  /** Vacio = solo asegurar que el renglon exista (p. ej. para comentarlo). */
  months: CambioMes[];
}

/** Sin acentos, minusculas, espacios colapsados: igual que la hoja del frontend. */
export const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/** Mismo criterio que el alta de catalogo (budgets.controller). */
const slugify = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60) || 'SIN_NOMBRE';

/** Llave de una cuenta de metricas, con sus nombres crudos (pueden traer espacios al final). */
export const llaveCuenta = (account: string, subaccount: string | null | undefined) => `${account}||${subaccount ?? ''}`;

export interface Prediccion {
  /** Por cuenta: 12 meses con las tres bandas. */
  forecast: Map<string, Record<Banda, number>[]>;
  /** Por cuenta y año cerrado: 12 meses. */
  closed: Map<string, Map<number, number[]>>;
  /** Cuentas con su nombre crudo. */
  cuentas: Map<string, { account: string; subaccount: string | null }>;
}

type LineaHoja = {
  id: number;
  lineItemId: number;
  totalAnnual: Prisma.Decimal;
  lineItem: { name: string; forecastAccount: string | null; forecastSubaccount: string | null; category: { name: string } };
  budgetLineAssignment: { userId: number }[];
};

@Injectable()
export class SheetWriterService {
  constructor(
    private prisma: PrismaService,
    private budgets: BudgetsService,
    private authz: AuthorizationService,
  ) {}

  /**
   * PUT /sheets/:bu/:dept/lines · el guardado de la hoja.
   * Devuelve la hoja completa ya actualizada (el cliente la pone en su cache
   * en vez de volver a pedirla) y el renglon de cada cuenta que se mando.
   */
  async guardar(userId: number, businessUnitId: number, departmentId: number, fiscalYearId: number, cambios: CambioRenglon[]) {
    await this.budgets.assertReach(userId, departmentId, businessUnitId);
    const budget = await this.budgets.findOrCreateBudget(fiscalYearId, businessUnitId);
    if (await this.budgets.sheetStatus(budget.id, departmentId, budget.status) !== BudgetStatus.draft) {
      throw new ForbiddenException('La hoja ya no esta en captura');
    }

    const scope = await this.authz.getUserScope(userId);
    const lineIds = await this.aplicar(budget.id, departmentId, fiscalYearId, cambios, {
      userId,
      superadmin: scope.isSuperadmin,
      puedeCrear: await this.authz.hasPermission(userId, 'budget_line.create'),
    });

    const sheet = await this.budgets.getSheet(userId, businessUnitId, departmentId, fiscalYearId);
    return { sheet, lineIds };
  }

  /**
   * Aplica los cambios a un presupuesto ya validado. Lo usa tambien el envio
   * a revision para llenar con la prediccion base (sin usuario de por medio).
   */
  async aplicar(
    budgetId: number,
    departmentId: number,
    fiscalYearId: number,
    cambios: CambioRenglon[],
    opciones: { userId?: number; superadmin: boolean; puedeCrear: boolean },
  ): Promise<Record<string, number>> {
    const fiscalYear = await this.prisma.fiscalYear.findUniqueOrThrow({ where: { id: fiscalYearId }, select: { year: true } });
    const budget = await this.prisma.budget.findUniqueOrThrow({ where: { id: budgetId }, select: { businessUnitId: true } });

    const lineas: LineaHoja[] = await this.prisma.budgetLine.findMany({
      where: { budgetId, departmentId },
      select: {
        id: true,
        lineItemId: true,
        totalAnnual: true,
        lineItem: { select: { name: true, forecastAccount: true, forecastSubaccount: true, category: { select: { name: true } } } },
        budgetLineAssignment: { select: { userId: true } },
      },
    });
    const porId = new Map(lineas.map((l) => [l.id, l]));

    // Años cerrados que se piden, para traer solo esos.
    const anios = new Set<number>();
    let pideBandas = false;
    for (const c of cambios)
      for (const m of c.months) {
        if (m.month < 0 || m.month > 11 || !Number.isInteger(m.month)) throw new BadRequestException('Mes fuera de rango');
        if (BANDAS.includes(m.variant as Banda)) pideBandas = true;
        else if (/^y\d{4}$/.test(m.variant)) anios.add(Number(m.variant.slice(1)));
        else if (m.variant !== 'manual') throw new BadRequestException(`Opcion desconocida: ${m.variant}`);
      }
    const pred =
      pideBandas || anios.size
        ? await this.prediccion(budget.businessUnitId, departmentId, fiscalYear.year, [...anios], pideBandas)
        : null;

    // Renglon de cada cambio: el que traen, el vinculado por nombre, o uno nuevo.
    const vinculadas = this.vincular(
      lineas,
      cambios.filter((c) => !c.lineId && c.account).map((c) => ({ account: c.account!, subaccount: c.subaccount ?? null })),
    );
    // Las cuentas que todavia no tienen renglon se dan de alta todas juntas.
    const nuevas = new Map<string, { account: string; subaccount: string | null }>();
    for (const c of cambios) {
      if (c.lineId || !c.account) continue;
      const llave = llaveCuenta(c.account, c.subaccount);
      if (!vinculadas.has(llave)) nuevas.set(llave, { account: c.account, subaccount: c.subaccount ?? null });
    }
    if (nuevas.size && !opciones.puedeCrear) {
      throw new ForbiddenException('No tienes permiso para agregar cuentas al presupuesto');
    }
    const creadas = nuevas.size ? await this.asegurarRenglones(budgetId, departmentId, [...nuevas.values()]) : new Map<string, number>();

    const lineIds: Record<string, number> = {};
    const destino: { cambio: CambioRenglon; lineId: number; llave: string | null }[] = [];

    for (const c of cambios) {
      let lineId = c.lineId;
      if (lineId && !porId.has(lineId)) throw new BadRequestException('Ese renglon no es de esta hoja');
      if (!lineId && c.account) {
        const llave = llaveCuenta(c.account, c.subaccount);
        lineId = vinculadas.get(llave)?.id ?? creadas.get(llave);
        if (lineId) lineIds[llave] = lineId;
      }
      if (!lineId) throw new BadRequestException('Cada cambio necesita un renglon o una cuenta');

      const linea = porId.get(lineId);
      const asignado = linea?.budgetLineAssignment[0]?.userId;
      if (asignado && asignado !== opciones.userId && !opciones.superadmin) {
        throw new ForbiddenException(`El renglon «${linea!.lineItem.name}» esta asignado a otra persona`);
      }

      // La cuenta de prediccion: la que mandan o la que el concepto tiene ligada.
      const llave = c.account
        ? llaveCuenta(c.account, c.subaccount)
        : linea?.lineItem.forecastAccount
          ? llaveCuenta(linea.lineItem.forecastAccount, linea.lineItem.forecastSubaccount)
          : null;
      destino.push({ cambio: c, lineId, llave });
    }

    // Los meses, en una sola escritura. Si un mismo mes llega dos veces, gana
    // el ultimo (el upsert no acepta la misma fila dos veces).
    const porMes = new Map<string, Prisma.Sql>();
    const fuente = new Map<number, LineSource>();
    for (const { cambio, lineId, llave } of destino) {
      for (const m of cambio.months) {
        let amount: number;
        let override = false;
        let reason: string | null = null;
        if (m.variant === 'manual') {
          if (typeof m.amount !== 'number' || !Number.isFinite(m.amount)) throw new BadRequestException('Falta el importe de la captura');
          amount = m.amount;
          override = true;
          reason = (m.reason ?? '').trim().length >= 5 ? m.reason!.trim().slice(0, 255) : 'Captura directa en la hoja';
          fuente.set(lineId, LineSource.manual);
        } else {
          if (!llave || !pred) throw new BadRequestException('Esta cuenta no tiene prediccion para elegir');
          amount = BANDAS.includes(m.variant as Banda)
            ? (pred.forecast.get(llave)?.[m.month]?.[m.variant as Banda] ?? 0)
            : (pred.closed.get(llave)?.get(Number(m.variant.slice(1)))?.[m.month] ?? 0);
          if (!fuente.has(lineId)) fuente.set(lineId, LineSource.forecast);
        }
        const redondeado = Math.round(amount * 10000) / 10000;
        porMes.set(
          `${lineId}|${m.month}`,
          Prisma.sql`(${lineId}::int, CAST(${MONTHS[m.month]} AS "month"), ${redondeado}::numeric, ${override ? null : redondeado}::numeric, ${override}::boolean, ${reason}::varchar, ${m.variant}::varchar, now())`,
        );
      }
    }
    const filas = [...porMes.values()];

    const tocadas = [...new Set(destino.filter((d) => d.cambio.months.length).map((d) => d.lineId))];
    if (filas.length) {
      await this.prisma.$transaction([
        this.prisma.$executeRaw`
          INSERT INTO budget_line_month (line_id, month, amount, calculated_amount, is_override, override_reason, variant, calculated_at)
          VALUES ${Prisma.join(filas)}
          ON CONFLICT (line_id, month) DO UPDATE SET
            amount = EXCLUDED.amount,
            calculated_amount = CASE WHEN EXCLUDED.is_override THEN budget_line_month.calculated_amount ELSE EXCLUDED.calculated_amount END,
            is_override = EXCLUDED.is_override,
            override_reason = EXCLUDED.override_reason,
            variant = EXCLUDED.variant,
            calculated_at = CASE WHEN EXCLUDED.is_override THEN budget_line_month.calculated_at ELSE EXCLUDED.calculated_at END
        `,
        this.prisma.$executeRaw`
          UPDATE budget_line bl
             SET total_annual = s.total, updated_at = now()
            FROM (
              SELECT line_id, COALESCE(SUM(amount), 0) AS total
                FROM budget_line_month
               WHERE line_id IN (${Prisma.join(tocadas)})
               GROUP BY line_id
            ) s
           WHERE bl.id = s.line_id
        `,
      ]);
      for (const source of [LineSource.manual, LineSource.forecast]) {
        const ids = tocadas.filter((id) => fuente.get(id) === source);
        if (ids.length) await this.prisma.budgetLine.updateMany({ where: { id: { in: ids } }, data: { source } });
      }
      await this.budgets.refreshProgress(budgetId);
    }

    return lineIds;
  }

  /**
   * La prediccion de la hoja: las tres bandas del año que se presupuesta y los
   * cierres de los años pedidos, por cuenta y mes. Misma deduplicacion que
   * `/metrics/expenses/detail` (lo que pinta la hoja).
   */
  async prediccion(businessUnitId: number, departmentId: number, year: number, cierres: number[], bandas = true): Promise<Prediccion> {
    const ids = (
      await this.prisma.metricDefinition.findMany({ where: { name: 'Gastos Sucursales' }, select: { id: true } })
    ).map((d) => d.id);
    const out: Prediccion = { forecast: new Map(), closed: new Map(), cuentas: new Map() };
    if (!ids.length) return out;

    if (bandas) {
      const rows = await this.prisma.$queryRaw<
        { account: string; subaccount: string | null; month: number; predicted: Prisma.Decimal; lower: Prisma.Decimal | null; upper: Prisma.Decimal | null }[]
      >`
        SELECT dedup.account AS "account", dedup.subaccount AS "subaccount",
               EXTRACT(MONTH FROM dedup.date)::int AS "month",
               SUM(dedup.value) AS "predicted", SUM(dedup.lower_bound) AS "lower", SUM(dedup.upper_bound) AS "upper"
        FROM (
          SELECT DISTINCT t.department, t.account, t.subaccount, t.business_unit_id, t.date,
                 t.predicted_value AS value, t.lower_bound, t.upper_bound
          FROM metric_forecast t
          WHERE t.metric_code IN (${Prisma.join(ids)})
            AND t.department = ${departmentId}
            AND t.account IS NOT NULL
            AND t.business_unit_id = ${businessUnitId}
            AND EXTRACT(YEAR FROM t.date)::int = ${year}
        ) dedup
        GROUP BY dedup.account, dedup.subaccount, EXTRACT(MONTH FROM dedup.date)
      `;
      for (const r of rows) {
        const llave = llaveCuenta(r.account, r.subaccount);
        out.cuentas.set(llave, { account: r.account, subaccount: r.subaccount });
        const meses =
          out.forecast.get(llave) ?? MONTHS.map(() => ({ predicted: 0, lower: 0, upper: 0 }) as Record<Banda, number>);
        const i = Number(r.month) - 1;
        if (i >= 0 && i < 12)
          meses[i] = { predicted: Number(r.predicted ?? 0), lower: Number(r.lower ?? 0), upper: Number(r.upper ?? 0) };
        out.forecast.set(llave, meses);
      }
    }

    if (cierres.length) {
      const rows = await this.prisma.$queryRaw<
        { account: string; subaccount: string | null; year: number; month: number; value: Prisma.Decimal }[]
      >`
        SELECT dedup.account AS "account", dedup.subaccount AS "subaccount",
               EXTRACT(YEAR FROM dedup.date)::int AS "year", EXTRACT(MONTH FROM dedup.date)::int AS "month",
               SUM(dedup.value) AS "value"
        FROM (
          SELECT DISTINCT t.department, t.account, t.subaccount, t.business_unit_id, t.date, t.value
          FROM metric_training t
          WHERE t.metric_code IN (${Prisma.join(ids)})
            AND t.department = ${departmentId}
            AND t.account IS NOT NULL
            AND t.business_unit_id = ${businessUnitId}
            AND EXTRACT(YEAR FROM t.date)::int IN (${Prisma.join(cierres)})
        ) dedup
        GROUP BY dedup.account, dedup.subaccount, EXTRACT(YEAR FROM dedup.date), EXTRACT(MONTH FROM dedup.date)
      `;
      for (const r of rows) {
        const llave = llaveCuenta(r.account, r.subaccount);
        out.cuentas.set(llave, { account: r.account, subaccount: r.subaccount });
        const porAnio = out.closed.get(llave) ?? new Map<number, number[]>();
        const meses = porAnio.get(Number(r.year)) ?? MONTHS.map(() => 0);
        const i = Number(r.month) - 1;
        if (i >= 0 && i < 12) meses[i] = Number(r.value ?? 0);
        porAnio.set(Number(r.year), meses);
        out.closed.set(llave, porAnio);
      }
    }
    return out;
  }

  /**
   * Cada cuenta con su renglon, como la hoja: primero por cuenta y subcuenta
   * (categoria y concepto); luego por concepto solo, si es unico y nadie lo
   * tomo. Un renglon nunca queda con dos cuentas.
   */
  vincular<L extends { id: number; lineItem: { name: string; category: { name: string } } }>(
    lineas: L[],
    cuentas: { account: string; subaccount: string | null }[],
  ): Map<string, L> {
    const porNombre = new Map(lineas.map((l) => [`${norm(l.lineItem.category.name)}|${norm(l.lineItem.name)}`, l]));
    const porConcepto = new Map<string, L | null>();
    for (const l of lineas) {
      const k = norm(l.lineItem.name);
      porConcepto.set(k, porConcepto.has(k) ? null : l);
    }
    const out = new Map<string, L>();
    const usadas = new Set<number>();
    for (const c of cuentas) {
      const l = porNombre.get(`${norm(c.account)}|${norm(c.subaccount?.trim() || c.account)}`);
      if (l && !usadas.has(l.id)) {
        out.set(llaveCuenta(c.account, c.subaccount), l);
        usadas.add(l.id);
      }
    }
    for (const c of cuentas) {
      const llave = llaveCuenta(c.account, c.subaccount);
      if (out.has(llave) || !c.subaccount) continue;
      const l = porConcepto.get(norm(c.subaccount));
      if (l && !usadas.has(l.id)) {
        out.set(llave, l);
        usadas.add(l.id);
      }
    }
    return out;
  }

  /**
   * Categoria, concepto y renglon para cada cuenta de prediccion, creando lo
   * que falte. Todo por lotes: unas cuantas consultas sin importar cuantas
   * cuentas lleguen (una precarga trae decenas). Las altas toleran que otra
   * peticion haya creado lo mismo al mismo tiempo (`skipDuplicates` y relectura).
   */
  async asegurarRenglones(
    budgetId: number,
    departmentId: number,
    cuentas: { account: string; subaccount: string | null }[],
  ): Promise<Map<string, number>> {
    const hoja = await this.prisma.budgetSheet.findFirst({ where: { departmentId }, orderBy: { id: 'asc' }, select: { id: true } });
    if (!hoja) throw new BadRequestException('El departamento no tiene hoja en el catalogo');

    const plan = cuentas.map((c) => {
      const categoria = c.account.trim();
      const concepto = c.subaccount?.trim() || c.account.trim();
      return { ...c, categoria, codigoCategoria: slugify(categoria), concepto, codigoConcepto: slugify(concepto) };
    });

    // Categorias.
    const leerCategorias = () =>
      this.prisma.category.findMany({ where: { budgetSheetId: hoja.id }, select: { id: true, code: true, sortOrder: true } });
    let categorias = await leerCategorias();
    const faltanCat = new Map<string, string>();
    for (const p of plan) {
      if (!categorias.some((c) => c.code === p.codigoCategoria)) faltanCat.set(p.codigoCategoria, p.categoria);
    }
    if (faltanCat.size) {
      let orden = Math.max(0, ...categorias.map((c) => c.sortOrder));
      await this.prisma.category.createMany({
        data: [...faltanCat].map(([code, name]) => ({ budgetSheetId: hoja.id, departmentId, code, name, sortOrder: ++orden })),
        skipDuplicates: true,
      });
      categorias = await leerCategorias();
    }
    const categoriaId = new Map(categorias.map((c) => [c.code, c.id]));

    // Conceptos.
    const idsCategoria = [...new Set(plan.map((p) => categoriaId.get(p.codigoCategoria)!))];
    const leerConceptos = () =>
      this.prisma.lineItem.findMany({
        where: { categoryId: { in: idsCategoria } },
        select: { id: true, categoryId: true, code: true, sortOrder: true, forecastAccount: true },
      });
    let conceptos = await leerConceptos();
    const llaveConcepto = (categoryId: number, code: string) => `${categoryId}|${code}`;
    const faltanItem = new Map<string, (typeof plan)[number] & { categoryId: number }>();
    for (const p of plan) {
      const categoryId = categoriaId.get(p.codigoCategoria)!;
      if (!conceptos.some((c) => c.categoryId === categoryId && c.code === p.codigoConcepto)) {
        faltanItem.set(llaveConcepto(categoryId, p.codigoConcepto), { ...p, categoryId });
      }
    }
    if (faltanItem.size) {
      const orden = new Map<number, number>();
      for (const c of conceptos) orden.set(c.categoryId, Math.max(orden.get(c.categoryId) ?? 0, c.sortOrder));
      await this.prisma.lineItem.createMany({
        data: [...faltanItem.values()].map((p) => {
          const siguiente = (orden.get(p.categoryId) ?? 0) + 1;
          orden.set(p.categoryId, siguiente);
          return {
            categoryId: p.categoryId,
            code: p.codigoConcepto,
            name: p.concepto,
            nature: 'expense' as const,
            frequency: 'monthly' as const,
            applicableMonths: [],
            sortOrder: siguiente,
            forecastAccount: p.account,
            forecastSubaccount: p.subaccount,
          };
        }),
        skipDuplicates: true,
      });
      conceptos = await leerConceptos();
    }
    const concepto = new Map(conceptos.map((c) => [llaveConcepto(c.categoryId, c.code), c]));

    // Un concepto que ya existia sin su cuenta de prediccion la recibe (pocos, uno por uno).
    for (const p of plan) {
      const c = concepto.get(llaveConcepto(categoriaId.get(p.codigoCategoria)!, p.codigoConcepto))!;
      if (!c.forecastAccount) {
        await this.prisma.lineItem.update({ where: { id: c.id }, data: { forecastAccount: p.account, forecastSubaccount: p.subaccount } });
        c.forecastAccount = p.account;
      }
    }

    // Renglones.
    const idsConcepto = [
      ...new Set(plan.map((p) => concepto.get(llaveConcepto(categoriaId.get(p.codigoCategoria)!, p.codigoConcepto))!.id)),
    ];
    await this.prisma.budgetLine.createMany({
      data: idsConcepto.map((lineItemId) => ({ budgetId, lineItemId, departmentId, source: LineSource.manual })),
      skipDuplicates: true,
    });
    const renglones = await this.prisma.budgetLine.findMany({
      where: { budgetId, lineItemId: { in: idsConcepto } },
      select: { id: true, lineItemId: true },
    });
    const renglonDe = new Map(renglones.map((r) => [r.lineItemId, r.id]));

    const out = new Map<string, number>();
    for (const p of plan) {
      const c = concepto.get(llaveConcepto(categoriaId.get(p.codigoCategoria)!, p.codigoConcepto))!;
      const id = renglonDe.get(c.id);
      if (id) out.set(llaveCuenta(p.account, p.subaccount), id);
    }
    return out;
  }
}
