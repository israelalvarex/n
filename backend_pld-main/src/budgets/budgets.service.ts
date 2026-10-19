import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { BudgetStatus, CaptureStatus, Month, ReviewOutcome, ThreadStatus } from '../../generated/prisma/enums';
import { AuthorizationService } from '../auth/authorization.service';
import { PrismaService } from '../prisma/prisma.service';
import { CalculationService, MONTHS } from './calculation.service';

/** Llave de la marca "hoja lista" en `setting` (ver ReadinessService). */
const CODIGO_LISTA = 'budget_sheet.ready';

/**
 * Una "hoja" es departamento x casino dentro de un ejercicio.
 *
 * Ojo: el esquema no tiene tabla `sheet`. Budget llega hasta el casino y los
 * renglones cargan el departamento, asi que la hoja se resuelve por la tripleta.
 * Cuando exista la tabla, esta clase es el unico lugar que hay que tocar.
 */
@Injectable()
export class BudgetsService {
  constructor(
    private prisma: PrismaService,
    private authz: AuthorizationService,
    private calc: CalculationService,
  ) {}

  /** Hojas del alcance del usuario, con su avance. Es la vista "Por casino". */
  async listSheets(userId: number, fiscalYearId: number) {
    const scope = await this.authz.getUserScope(userId);

    const [units, departments] = await Promise.all([
      this.prisma.businessUnit.findMany({
        where: { active: true, ...(scope.allBusinessUnits ? {} : { id: { in: scope.businessUnitIds } }) },
        select: { id: true, code: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.department.findMany({
        where: { active: true, ...(scope.allDepartments ? {} : { id: { in: scope.departmentIds } }) },
        select: { id: true, code: true, name: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    const budgets = await this.prisma.budget.findMany({
      where: { fiscalYearId, isCurrent: true, businessUnitId: { in: units.map((u) => u.id) } },
      select: { id: true, businessUnitId: true, status: true, version: true },
    });
    const budgetByUnit = new Map(budgets.map((b) => [b.businessUnitId, b]));

    const reviews = await this.prisma.budgetSheetReview.findMany({
      where: { budgetId: { in: budgets.map((b) => b.id) }, departmentId: { in: departments.map((d) => d.id) } },
      select: { budgetId: true, departmentId: true, status: true },
    });
    const reviewBySheet = new Map(reviews.map((r) => [`${r.budgetId}|${r.departmentId}`, r.status]));

    const listas = new Set(
      (
        await this.prisma.setting.findMany({
          where: { code: CODIGO_LISTA, fiscalYearId },
          select: { businessUnitId: true, departmentId: true },
        })
      ).map((r) => `${r.businessUnitId}|${r.departmentId}`),
    );

    const counts = await this.prisma.budgetLine.groupBy({
      by: ['departmentId', 'budgetId'],
      where: { budgetId: { in: budgets.map((b) => b.id) } },
      _count: { _all: true },
      _sum: { totalAnnual: true },
    });

    return units.flatMap((unit) =>
      departments.map((department) => {
        const budget = budgetByUnit.get(unit.id);
        const row = counts.find((c) => c.budgetId === budget?.id && c.departmentId === department.id);
        return {
          businessUnit: unit,
          department,
          budgetId: budget?.id ?? null,
          version: budget?.version ?? null,
          status: budget
            ? this.effectiveSheetStatus(budget.status, reviewBySheet.get(`${budget.id}|${department.id}`))
            : null,
          lines: row?._count._all ?? 0,
          total: row?._sum.totalAnnual ?? 0,
          ready: listas.has(`${unit.id}|${department.id}`),
        };
      }),
    );
  }

  /**
   * La hoja completa en una sola respuesta: categorias, renglones, los 12 meses,
   * subtotales y los dias de cada mes. La pantalla no puede pedir esto por partes.
   */
  async getSheet(userId: number, businessUnitId: number, departmentId: number, fiscalYearId: number, compareYear?: number) {
    await this.assertReach(userId, departmentId, businessUnitId);

    const budget = await this.findOrCreateBudget(fiscalYearId, businessUnitId);

    const [department, businessUnit, calendar, lines] = await Promise.all([
      this.prisma.department.findUniqueOrThrow({ where: { id: departmentId }, select: { id: true, code: true, name: true } }),
      this.prisma.businessUnit.findUniqueOrThrow({ where: { id: businessUnitId }, select: { id: true, code: true, name: true } }),
      this.prisma.monthCalendar.findMany({
        where: { fiscalYearId },
        select: { month: true, monthNumber: true, days: true, holidays: true },
        orderBy: { monthNumber: 'asc' },
      }),
      this.prisma.budgetLine.findMany({
        where: { budgetId: budget.id, departmentId },
        include: {
          lineItem: { select: { id: true, code: true, name: true, nature: true, frequency: true, sortOrder: true, categoryId: true } },
          resource: { select: { id: true, code: true, name: true, unit: true } },
          glAccount: { select: { code: true } },
          budgetLineMonth: { select: { month: true, amount: true, calculatedAmount: true, isOverride: true, variant: true } },
          budgetLineAssignment: { select: { userId: true, finished: true } },
        },
      }),
    ]);

    const categories = await this.prisma.category.findMany({
      where: { id: { in: [...new Set(lines.map((l) => l.lineItem.categoryId))] } },
      select: { id: true, code: true, name: true, sortOrder: true, parentCategoryId: true },
      orderBy: { sortOrder: 'asc' },
    });

    const threads = await this.threadCountsByLine(lines.map((l) => l.id));
    const comparison = compareYear ? await this.comparisonByLineItem(businessUnitId, departmentId, compareYear) : null;

    const shaped = categories.map((category) => {
      const categoryLines = lines
        .filter((l) => l.lineItem.categoryId === category.id)
        .sort((a, b) => a.lineItem.sortOrder - b.lineItem.sortOrder)
        .map((line) => {
          const byMonth = new Map(line.budgetLineMonth.map((m) => [m.month, m]));
          return {
            id: line.id,
            name: line.lineItem.name,
            frequency: line.frequency ?? line.lineItem.frequency,
            source: line.source,
            resource: line.resource,
            referenceAmount: line.referenceAmount,
            factor: line.factor,
            component: line.component,
            quantity: line.quantity,
            quantityUnit: line.quantityUnit,
            calculationNote: line.calculationNote,
            glAccount: line.glAccount?.code ?? null,
            assignedTo: line.budgetLineAssignment[0]?.userId ?? null,
            finished: line.budgetLineAssignment[0]?.finished ?? false,
            threads: threads.get(line.id) ?? { open: 0, blocking: 0 },
            total: line.totalAnnual,
            previous: comparison?.get(line.lineItemId) ?? null,
            months: MONTHS.map((month) => {
              const cell = byMonth.get(month);
              return {
                month,
                amount: cell?.amount ?? 0,
                calculatedAmount: cell?.calculatedAmount ?? null,
                isOverride: cell?.isOverride ?? false,
                variant: cell?.variant ?? null,
              };
            }),
          };
        });

      return {
        category: { id: category.id, code: category.code, name: category.name },
        lines: categoryLines,
        subtotal: MONTHS.map((month) => ({
          month,
          amount: categoryLines.reduce(
            (sum, l) => sum + Number(l.months.find((m) => m.month === month)?.amount ?? 0),
            0,
          ),
        })),
      };
    });

    const lista = await this.prisma.setting.findFirst({
      where: { code: CODIGO_LISTA, fiscalYearId, businessUnitId, departmentId },
      select: { id: true },
    });

    return {
      budgetId: budget.id,
      version: budget.version,
      status: await this.sheetStatus(budget.id, departmentId, budget.status),
      ready: !!lista,
      /** Si el dictamen la devolvio: quien, cuando y con que comentario. */
      returned: await this.devolucion(budget.id, departmentId),
      businessUnit,
      department,
      calendar,
      categories: shaped,
      total: lines.reduce((sum, l) => sum + Number(l.totalAnnual), 0),
    };
  }

  /**
   * Crea el presupuesto del casino si no existe.
   * Usa el centro de costo generico: el producto no razona por centro de costo,
   * pero la columna es obligatoria.
   */
  async findOrCreateBudget(fiscalYearId: number, businessUnitId: number) {
    const existing = await this.prisma.budget.findFirst({
      where: { fiscalYearId, businessUnitId, isCurrent: true },
    });
    if (existing) return existing;

    const costCenter = await this.prisma.costCenter.findFirst({ where: { businessUnitId } });
    if (!costCenter) throw new NotFoundException('El casino no tiene centro de costo; corre la seed');

    return this.prisma.budget.create({
      data: { fiscalYearId, businessUnitId, costCenterId: costCenter.id },
    });
  }

  /** El flujo de revisión pertenece a la hoja, no al Budget compartido por todo el casino. */
  private effectiveSheetStatus(budgetStatus: BudgetStatus, reviewStatus?: BudgetStatus): BudgetStatus {
    return budgetStatus === BudgetStatus.closed || budgetStatus === BudgetStatus.reforecast
      ? budgetStatus
      : (reviewStatus ?? BudgetStatus.draft);
  }

  /**
   * La devolucion vigente de una hoja: el dictamen de su ultimo envio cuando
   * no fue aprobarla y la hoja sigue en captura. Es lo que el responsable
   * tiene que ver al abrirla (el comentario del dictamen) y lo que permite
   * reenviarla sola, sin esperar al resto del departamento.
   */
  async devolucion(budgetId: number, departmentId: number) {
    const review = await this.prisma.budgetSheetReview.findUnique({
      where: { budgetId_departmentId: { budgetId, departmentId } },
      select: { status: true, reviewSubmissionId: true },
    });
    if (!review || review.status !== BudgetStatus.draft) return null;
    const decision = await this.prisma.reviewDecision.findUnique({
      where: { reviewSubmissionId_budgetId: { reviewSubmissionId: review.reviewSubmissionId, budgetId } },
      select: { result: true, comment: true, decidedAt: true, decidedBy2: { select: { name: true } } },
    });
    if (!decision || decision.result === ReviewOutcome.approvedAndFrozen) return null;
    return { result: decision.result, comment: decision.comment, decidedAt: decision.decidedAt, decidedBy: decision.decidedBy2.name };
  }

  async sheetStatus(budgetId: number, departmentId: number, budgetStatus: BudgetStatus): Promise<BudgetStatus> {
    const review = await this.prisma.budgetSheetReview.findUnique({
      where: { budgetId_departmentId: { budgetId, departmentId } },
      select: { status: true },
    });
    return this.effectiveSheetStatus(budgetStatus, review?.status);
  }

  /** Avance por hoja: "34 de 42 renglones", la barra y el estado. */
  async refreshProgress(budgetId: number) {
    const budget = await this.prisma.budget.findUnique({
      where: { id: budgetId },
      select: { businessUnitId: true, fiscalYearId: true },
    });
    const [total, captured, threads] = await Promise.all([
      this.prisma.budgetLine.count({ where: { budgetId } }),
      this.prisma.budgetLine.count({ where: { budgetId, totalAnnual: { gt: 0 } } }),
      this.prisma.commentThread.groupBy({
        by: ['blocking'],
        // Solo los hilos de este presupuesto (su casino y su año), no los de todo el sistema.
        where: { status: ThreadStatus.open, businessUnitId: budget?.businessUnitId, fiscalYearId: budget?.fiscalYearId },
        _count: { _all: true },
      }),
    ]);

    const open = threads.reduce((s, t) => s + t._count._all, 0);
    const blocking = threads.find((t) => t.blocking)?._count._all ?? 0;
    const status =
      total === 0 ? CaptureStatus.notStarted : captured >= total ? CaptureStatus.complete : CaptureStatus.inProgress;

    return this.prisma.captureProgress.upsert({
      where: { budgetId },
      update: { totalLines: total, capturedLines: captured, openThreads: open, blockingThreads: blocking, status, updatedAt: new Date() },
      create: { budgetId, totalLines: total, capturedLines: captured, openThreads: open, blockingThreads: blocking, status },
    });
  }

  /** 404 en vez de 403: un 403 confirmaria que la hoja existe. */
  async assertReach(userId: number, departmentId: number, businessUnitId: number) {
    if (!(await this.authz.canReach(userId, departmentId, businessUnitId))) {
      throw new NotFoundException('La hoja no existe o esta fuera de tu alcance');
    }
  }

  async assertCanEditLine(userId: number, lineId: number) {
    const line = await this.prisma.budgetLine.findUnique({
      where: { id: lineId },
      include: { budget: { select: { businessUnitId: true, status: true } }, budgetLineAssignment: true },
    });
    if (!line) throw new NotFoundException('El renglon no existe');
    await this.assertReach(userId, line.departmentId, line.budget.businessUnitId);

    if (await this.sheetStatus(line.budgetId, line.departmentId, line.budget.status) !== BudgetStatus.draft) {
      throw new ForbiddenException('La hoja no esta en captura; hay que dictaminarla o reabrirla');
    }

    // Si el renglon esta asignado a alguien mas, solo ese alguien lo edita.
    // Esta regla no cabe en un permiso: depende de la fila.
    const assignment = line.budgetLineAssignment[0];
    if (assignment && assignment.userId !== userId) {
      const scope = await this.authz.getUserScope(userId);
      if (!scope.isSuperadmin) {
        throw new ForbiddenException('Ese renglon esta asignado a otra persona');
      }
    }
    return line;
  }

  private async threadCountsByLine(lineIds: number[]) {
    if (!lineIds.length) return new Map<number, { open: number; blocking: number }>();
    const object = await this.prisma.systemObject.findUnique({ where: { code: 'budget_line' }, select: { id: true } });
    if (!object) return new Map<number, { open: number; blocking: number }>();

    const rows = await this.prisma.commentThread.findMany({
      where: { systemObjectId: object.id, recordId: { in: lineIds.map(String) }, status: ThreadStatus.open },
      select: { recordId: true, blocking: true },
    });

    const map = new Map<number, { open: number; blocking: number }>();
    for (const row of rows) {
      const key = Number(row.recordId);
      const current = map.get(key) ?? { open: 0, blocking: 0 };
      current.open += 1;
      if (row.blocking) current.blocking += 1;
      map.set(key, current);
    }
    return map;
  }

  /** Ejercido del anio anterior por concepto, para el renglon gris del comparativo. */
  private async comparisonByLineItem(businessUnitId: number, departmentId: number, year: number) {
    const fiscalYear = await this.prisma.fiscalYear.findUnique({ where: { year }, select: { id: true } });
    if (!fiscalYear) return null;

    const lines = await this.prisma.budgetLine.findMany({
      where: { departmentId, budget: { fiscalYearId: fiscalYear.id, businessUnitId } },
      select: { lineItemId: true, totalAnnual: true, monthlyActual: { select: { month: true, committedAmount: true } } },
    });

    return new Map(
      lines.map((l) => [
        l.lineItemId,
        { budgeted: l.totalAnnual, actual: l.monthlyActual.reduce((s, a) => s + Number(a.committedAmount), 0) },
      ]),
    );
  }
}
