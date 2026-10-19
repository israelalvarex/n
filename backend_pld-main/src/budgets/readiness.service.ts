import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { BudgetStatus, SettingScope } from '../../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { BudgetsService } from './budgets.service';
import { SheetWriterService, type CambioRenglon } from './sheet-writer.service';

/**
 * Hojas "listas para revision".
 *
 * El flujo tiene dos manos: quien captura la hoja de un departamento en un
 * casino la marca como lista cuando ya eligio sus valores, y el encargado del
 * departamento envia a revision el departamento completo. Aqui vive lo primero
 * y el relleno que hace falta cuando se envia sin que todas esten listas.
 *
 * La marca se guarda en `setting` con la llave de la hoja (ejercicio x casino x
 * departamento): esa tabla ya tiene exactamente esa llave unica, asi que no
 * hace falta una tabla ni una migracion nuevas. Si algun dia la hoja tiene su
 * propia tabla, este servicio es el unico lugar que hay que cambiar.
 */
export const CODIGO_LISTA = 'budget_sheet.ready';
const CODIGO = CODIGO_LISTA;

export interface Relleno {
  /** Cuentas a las que se les creo el renglon con la prediccion base. */
  creadas: number;
  /** Renglones que existian en ceros y se llenaron con la prediccion base. */
  llenadas: number;
}

@Injectable()
export class ReadinessService {
  constructor(
    private prisma: PrismaService,
    private budgets: BudgetsService,
    private writer: SheetWriterService,
  ) {}

  private donde(fiscalYearId: number, businessUnitId: number, departmentId: number) {
    return { code: CODIGO, area: SettingScope.department, fiscalYearId, businessUnitId, departmentId };
  }

  /** Hojas listas del ejercicio, como `casino|departamento`. */
  async listas(fiscalYearId: number): Promise<Set<string>> {
    const rows = await this.prisma.setting.findMany({
      where: { code: CODIGO, fiscalYearId },
      select: { businessUnitId: true, departmentId: true },
    });
    return new Set(rows.map((r) => `${r.businessUnitId}|${r.departmentId}`));
  }

  async estaLista(fiscalYearId: number, businessUnitId: number, departmentId: number) {
    const row = await this.prisma.setting.findFirst({ where: this.donde(fiscalYearId, businessUnitId, departmentId) });
    return !!row;
  }

  /**
   * Marca la hoja como lista. Solo en captura y si ya tiene algo guardado.
   */
  async marcar(fiscalYearId: number, businessUnitId: number, departmentId: number, userId: number) {
    const budget = await this.prisma.budget.findFirst({ where: { fiscalYearId, businessUnitId, isCurrent: true } });
    if (!budget) throw new NotFoundException('Esta hoja todavia no tiene presupuesto');
    if (await this.budgets.sheetStatus(budget.id, departmentId, budget.status) !== BudgetStatus.draft) throw new BadRequestException('La hoja ya no esta en captura');
    const guardados = await this.prisma.budgetLine.count({
      where: { budgetId: budget.id, departmentId, totalAnnual: { gt: 0 } },
    });
    if (!guardados) throw new BadRequestException('La hoja no tiene nada guardado todavia: elige y guarda sus valores primero');
    await this.poner(fiscalYearId, businessUnitId, departmentId, userId);
  }

  private async poner(fiscalYearId: number, businessUnitId: number, departmentId: number, userId: number) {
    const valor = JSON.stringify({ at: new Date().toISOString(), by: userId });
    const existente = await this.prisma.setting.findFirst({ where: this.donde(fiscalYearId, businessUnitId, departmentId) });
    if (existente) {
      await this.prisma.setting.update({ where: { id: existente.id }, data: { value: valor, userId, updatedAt: new Date() } });
      return;
    }
    await this.prisma.setting.create({
      data: {
        ...this.donde(fiscalYearId, businessUnitId, departmentId),
        name: 'Hoja lista para revision',
        dataType: 'json',
        value: valor,
        userId,
      },
    });
  }

  async quitar(fiscalYearId: number, businessUnitId: number, departmentId: number) {
    const budget = await this.prisma.budget.findFirst({ where: { fiscalYearId, businessUnitId, isCurrent: true } });
    if (budget && await this.budgets.sheetStatus(budget.id, departmentId, budget.status) !== BudgetStatus.draft) throw new BadRequestException('La hoja ya no esta en captura');
    await this.prisma.setting.deleteMany({ where: this.donde(fiscalYearId, businessUnitId, departmentId) });
  }

  /** Marca sin validar: la usa el envio despues de rellenar. */
  async marcarSinValidar(fiscalYearId: number, businessUnitId: number, departmentId: number, userId: number) {
    await this.poner(fiscalYearId, businessUnitId, departmentId, userId);
  }

  /** Casinos con prediccion para este departamento y año (para saber que hojas tienen que hacer). */
  async casinosConPrediccion(departmentId: number, year: number): Promise<Set<number>> {
    const ids = await this.expenseMetricIds();
    if (!ids.length) return new Set();
    const rows = await this.prisma.$queryRaw<{ businessUnitId: number }[]>`
      SELECT DISTINCT t.business_unit_id AS "businessUnitId"
      FROM metric_forecast t
      WHERE t.metric_code IN (${Prisma.join(ids)})
        AND t.department = ${departmentId}
        AND t.account IS NOT NULL
        AND t.predicted_value <> 0
        AND EXTRACT(YEAR FROM t.date)::int = ${year}
    `;
    return new Set(rows.map((r) => Number(r.businessUnitId)));
  }

  /**
   * Llena con la prediccion base las cuentas de la hoja que nadie eligio.
   *
   * "Base" es el valor medio del modelo, mes por mes, calculado igual que lo
   * pinta la hoja (ver SheetWriterService.prediccion). Una cuenta ya guardada
   * (con importe) no se toca; una sin renglon recibe categoria, concepto y
   * renglon, igual que cuando se guarda desde la hoja.
   */
  async rellenarConBase(fiscalYearId: number, businessUnitId: number, departmentId: number): Promise<Relleno> {
    const fiscalYear = await this.prisma.fiscalYear.findUnique({ where: { id: fiscalYearId }, select: { year: true } });
    if (!fiscalYear) throw new NotFoundException('El ejercicio no existe');
    const budget = await this.budgets.findOrCreateBudget(fiscalYearId, businessUnitId);
    if (await this.budgets.sheetStatus(budget.id, departmentId, budget.status) !== BudgetStatus.draft) return { creadas: 0, llenadas: 0 };

    const pred = await this.writer.prediccion(businessUnitId, departmentId, fiscalYear.year, []);
    const lineas = await this.prisma.budgetLine.findMany({
      where: { budgetId: budget.id, departmentId },
      select: { id: true, totalAnnual: true, lineItem: { select: { name: true, category: { select: { name: true } } } } },
    });
    const cuentas = [...pred.cuentas.entries()].filter(([llave]) =>
      (pred.forecast.get(llave) ?? []).some((m) => Math.abs(m.predicted) >= 0.005),
    );
    const vinculo = this.writer.vincular(
      lineas,
      cuentas.map(([, c]) => c),
    );

    const cambios: CambioRenglon[] = [];
    let creadas = 0;
    let llenadas = 0;
    for (const [llave, c] of cuentas) {
      const linea = vinculo.get(llave);
      if (linea && !new Prisma.Decimal(linea.totalAnnual).isZero()) continue;
      if (linea) llenadas += 1;
      else creadas += 1;
      cambios.push({
        // La cuenta va siempre: de ahi salen las bandas aunque el concepto no la tenga ligada.
        ...(linea ? { lineId: linea.id } : {}),
        account: c.account,
        subaccount: c.subaccount,
        months: Array.from({ length: 12 }, (_, month) => ({ month, variant: 'predicted' })),
      });
    }

    if (cambios.length) {
      await this.writer.aplicar(budget.id, departmentId, fiscalYearId, cambios, { superadmin: true, puedeCrear: true });
    }
    return { creadas, llenadas };
  }

  /** Las metricas de gasto: las mismas que usa `/metrics/expenses/*`. */
  private async expenseMetricIds(): Promise<string[]> {
    const defs = await this.prisma.metricDefinition.findMany({ where: { name: 'Gastos Sucursales' }, select: { id: true } });
    return defs.map((d) => d.id);
  }
}
