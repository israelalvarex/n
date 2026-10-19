import {
  BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, ParseIntPipe, Patch, Post, Put, Query, UseGuards,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { BudgetStatus, Frequency, LineSource, Month, ThreadStatus } from '../../generated/prisma/enums';
import { AuthorizationService } from '../auth/authorization.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { SessionGuard } from '../auth/session.guard';
import type { RequestUser } from '../auth/session.guard';
import { PrismaService } from '../prisma/prisma.service';
import { BudgetsService } from './budgets.service';
import { CalculationService, MONTHS } from './calculation.service';
import {
  ApplySourceDto, AssignDto, CreateCategoryDto, CreateLineDto, CreateLineItemDto,
  FinishDto, GuardarHojaDto, OverrideDto, SetForecastMappingDto, UpdateLineDto,
} from './dto';
import { SheetWriterService } from './sheet-writer.service';

@Controller()
@UseGuards(SessionGuard, PermissionsGuard)
export class BudgetsController {
  constructor(
    private prisma: PrismaService,
    private budgets: BudgetsService,
    private calc: CalculationService,
    private authz: AuthorizationService,
    private writer: SheetWriterService,
  ) {}

  // ---------------------------------------------------------------- hojas

  /** Vista "Por casino": todas las hojas del alcance con su avance. */
  @Get('sheets')
  @RequirePermission('budget.read')
  listSheets(@CurrentUser() user: RequestUser, @Query('fiscalYearId', ParseIntPipe) fiscalYearId: number) {
    return this.budgets.listSheets(user.id, fiscalYearId);
  }

  /** La hoja completa. `compare` agrega el renglon gris del ejercido anterior. */
  @Get('sheets/:businessUnitId/:departmentId')
  @RequirePermission('budget.read')
  getSheet(
    @CurrentUser() user: RequestUser,
    @Param('businessUnitId', ParseIntPipe) businessUnitId: number,
    @Param('departmentId', ParseIntPipe) departmentId: number,
    @Query('fiscalYearId', ParseIntPipe) fiscalYearId: number,
    @Query('compare') compare?: string,
  ) {
    return this.budgets.getSheet(user.id, businessUnitId, departmentId, fiscalYearId, compare ? Number(compare) : undefined);
  }

  /** La guia de la cedula: consideraciones y criterios de calculo. */
  @Get('sheets/:businessUnitId/:departmentId/guide')
  @RequirePermission('budget_sheet.read')
  async guide(@Param('departmentId', ParseIntPipe) departmentId: number) {
    const sheets = await this.prisma.budgetSheet.findMany({
      where: { departmentId },
      select: { id: true, code: true, name: true, budgetSheetNote: { select: { type: true, sortOrder: true, text: true }, orderBy: { sortOrder: 'asc' } } },
    });
    return sheets;
  }

  /**
   * Guardado por lote de la hoja: todos los meses que cambiaron, de todas las
   * cuentas, en una peticion. Para bandas y cierres llega la opcion y el
   * servidor calcula el importe; para "manual", el importe y su motivo. Las
   * cuentas sin renglon se dan de alta. Devuelve la hoja ya actualizada.
   */
  @Put('sheets/:businessUnitId/:departmentId/lines')
  @RequirePermission('budget_line_month.capture')
  guardarHoja(
    @CurrentUser() user: RequestUser,
    @Param('businessUnitId', ParseIntPipe) businessUnitId: number,
    @Param('departmentId', ParseIntPipe) departmentId: number,
    @Query('fiscalYearId', ParseIntPipe) fiscalYearId: number,
    @Body() body: GuardarHojaDto,
  ) {
    return this.writer.guardar(user.id, businessUnitId, departmentId, fiscalYearId, body.changes);
  }

  // -------------------------------------------------------------- renglones

  @Post('sheets/:businessUnitId/:departmentId/lines')
  @RequirePermission('budget_line.create')
  async createLine(
    @CurrentUser() user: RequestUser,
    @Param('businessUnitId', ParseIntPipe) businessUnitId: number,
    @Param('departmentId', ParseIntPipe) departmentId: number,
    @Query('fiscalYearId', ParseIntPipe) fiscalYearId: number,
    @Body() body: CreateLineDto,
  ) {
    await this.budgets.assertReach(user.id, departmentId, businessUnitId);
    const budget = await this.budgets.findOrCreateBudget(fiscalYearId, businessUnitId);
    if (await this.budgets.sheetStatus(budget.id, departmentId, budget.status) !== BudgetStatus.draft) {
      throw new ForbiddenException('La hoja ya no esta en captura');
    }

    const line = await this.prisma.budgetLine.create({
      data: {
        budgetId: budget.id,
        lineItemId: body.lineItemId,
        departmentId,
        resourceId: body.resourceId,
        component: body.component,
        quantity: body.quantity,
        quantityUnit: body.quantityUnit,
        frequency: body.frequency,
        source: body.source,
        glAccountId: body.glAccountId,
      },
    });

    await this.calc.recalculateLine(line.id);
    await this.budgets.refreshProgress(budget.id);
    return this.prisma.budgetLine.findUnique({ where: { id: line.id }, include: { budgetLineMonth: true } });
  }

  /** Cambiar cantidad o recurso dispara el recalculo de los 12 meses. */
  @Patch('lines/:id')
  @RequirePermission('budget_line.update')
  async updateLine(@CurrentUser() user: RequestUser, @Param('id', ParseIntPipe) id: number, @Body() body: UpdateLineDto) {
    const line = await this.budgets.assertCanEditLine(user.id, id);

    await this.prisma.budgetLine.update({ where: { id }, data: { ...body, updatedAt: new Date() } });
    const total = await this.calc.recalculateLine(id);
    await this.budgets.refreshProgress(line.budgetId);

    return { id, totalAnnual: total };
  }

  @Delete('lines/:id')
  @RequirePermission('budget_line.delete')
  async deleteLine(@CurrentUser() user: RequestUser, @Param('id', ParseIntPipe) id: number) {
    const line = await this.budgets.assertCanEditLine(user.id, id);
    await this.prisma.budgetLineMonth.deleteMany({ where: { lineId: id } });
    await this.prisma.budgetLineAssignment.deleteMany({ where: { lineId: id } });
    await this.prisma.budgetLine.delete({ where: { id } });
    await this.budgets.refreshProgress(line.budgetId);
    return { deleted: true };
  }

  /**
   * Panel "Origen del renglon": de donde sale el numero, y que puede cambiar
   * quien lo esta viendo. Los permisos por campo salen de permission.field.
   */
  @Get('lines/:id/origin')
  @RequirePermission('budget_line.read')
  async origin(@CurrentUser() user: RequestUser, @Param('id', ParseIntPipe) id: number) {
    const line = await this.prisma.budgetLine.findUnique({
      where: { id },
      include: {
        budget: { select: { businessUnitId: true, fiscalYearId: true, fiscalYear: { select: { year: true } } } },
        resource: { select: { id: true, code: true, name: true, unit: true, departmentId: true } },
        lineItem: { select: { name: true, frequency: true } },
      },
    });
    if (!line) throw new NotFoundException('El renglon no existe');
    await this.budgets.assertReach(user.id, line.departmentId, line.budget.businessUnitId);

    const [value, otherUnits, permissions] = await Promise.all([
      line.resourceId
        ? this.prisma.resourceValue.findFirst({
            where: { resourceId: line.resourceId, year: line.budget.fiscalYear.year },
            select: { value: true, isProjection: true },
          })
        : null,
      line.resourceId
        ? this.prisma.resourceQuantity.findMany({
            where: { resourceId: line.resourceId, fiscalYearId: line.budget.fiscalYearId },
            select: { quantity: true, base: true, businessUnit: { select: { code: true, name: true } } },
          })
        : [],
      this.authz.getUserPermissions(user.id),
    ]);

    return {
      line: { id: line.id, name: line.lineItem.name, calculationNote: line.calculationNote },
      resource: line.resource,
      price: value,
      quantity: { value: line.quantity, unit: line.quantityUnit },
      usedIn: otherUnits,
      // "Que puedes cambiar aqui"
      canEdit: {
        quantity: permissions.includes('budget_line.update'),
        price: permissions.includes('resource_value.update'),
        glAccount: permissions.includes('gl_account.manage'),
      },
    };
  }

  /** Override manual de una celda. Exige motivo y conserva el calculado. */
  @Put('lines/:id/months/:month')
  @RequirePermission('budget_line_month.capture')
  async override(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('month') month: Month,
    @Body() body: OverrideDto,
  ) {
    if (!Object.values(Month).includes(month)) throw new BadRequestException('Mes invalido');
    const line = await this.budgets.assertCanEditLine(user.id, id);

    const cell = await this.prisma.budgetLineMonth.upsert({
      where: { lineId_month: { lineId: id, month } },
      update: { amount: body.amount, isOverride: true, overrideReason: body.reason, variant: 'manual' },
      create: { lineId: id, month, amount: body.amount, isOverride: true, overrideReason: body.reason, variant: 'manual' },
    });

    const months = await this.prisma.budgetLineMonth.findMany({ where: { lineId: id }, select: { amount: true } });
    await this.prisma.budgetLine.update({
      where: { id },
      data: { totalAnnual: months.reduce((s, m) => s + Number(m.amount), 0) },
    });
    await this.budgets.refreshProgress(line.budgetId);
    return cell;
  }

  /** Quitar el override: la celda vuelve al valor calculado. */
  @Delete('lines/:id/months/:month/override')
  @RequirePermission('budget_line_month.capture')
  async clearOverride(@CurrentUser() user: RequestUser, @Param('id', ParseIntPipe) id: number, @Param('month') month: Month) {
    await this.budgets.assertCanEditLine(user.id, id);
    await this.prisma.budgetLineMonth.update({
      where: { lineId_month: { lineId: id, month } },
      data: { isOverride: false, overrideReason: null, variant: null },
    });
    const total = await this.calc.recalculateLine(id);
    return { id, totalAnnual: total };
  }

  @Post('lines/:id/recalculate')
  @RequirePermission('budget_line.update')
  async recalculate(@CurrentUser() user: RequestUser, @Param('id', ParseIntPipe) id: number) {
    await this.budgets.assertCanEditLine(user.id, id);
    return { totalAnnual: await this.calc.recalculateLine(id) };
  }

  // ------------------------------------------------------------ asignaciones

  @Post('assignments')
  @RequirePermission('budget_line_assignment.create')
  async assign(@CurrentUser() user: RequestUser, @Body() body: AssignDto) {
    const line = await this.prisma.budgetLine.findUnique({
      where: { id: body.lineId },
      include: { budget: { select: { businessUnitId: true } } },
    });
    if (!line) throw new NotFoundException('El renglon no existe');
    await this.budgets.assertReach(user.id, line.departmentId, line.budget.businessUnitId);

    return this.prisma.budgetLineAssignment.upsert({
      where: { lineId: body.lineId },
      update: { userId: body.userId, assignedBy: user.id, finished: false, finishedAt: null },
      create: { lineId: body.lineId, userId: body.userId, assignedBy: user.id },
    });
  }

  @Delete('assignments/:id')
  @RequirePermission('budget_line_assignment.delete')
  async unassign(@Param('id', ParseIntPipe) id: number) {
    await this.prisma.budgetLineAssignment.delete({ where: { id } });
    return { deleted: true };
  }

  /**
   * "Mis renglones". Devuelve TAMBIEN los ajenos de la misma hoja, marcados como
   * no editables: el miembro los ve en gris y puede comentarlos.
   */
  @Get('me/lines')
  async myLines(@CurrentUser() user: RequestUser, @Query('fiscalYearId', ParseIntPipe) fiscalYearId: number) {
    const mine = await this.prisma.budgetLineAssignment.findMany({
      where: { userId: user.id, line: { budget: { fiscalYearId } } },
      select: { lineId: true, finished: true, line: { select: { budgetId: true, departmentId: true } } },
    });
    if (!mine.length) return [];

    const budgetIds = [...new Set(mine.map((m) => m.line.budgetId))];
    const departmentIds = [...new Set(mine.map((m) => m.line.departmentId))];
    const mineIds = new Set(mine.map((m) => m.lineId));

    const lines = await this.prisma.budgetLine.findMany({
      where: { budgetId: { in: budgetIds }, departmentId: { in: departmentIds } },
      include: {
        lineItem: { select: { name: true } },
        glAccount: { select: { code: true } },
        budgetLineMonth: { select: { month: true, amount: true } },
      },
    });

    return lines.map((line) => ({
      id: line.id,
      name: line.lineItem.name,
      glAccount: line.glAccount?.code ?? null,
      total: line.totalAnnual,
      months: line.budgetLineMonth,
      mine: mineIds.has(line.id),
      finished: mine.find((m) => m.lineId === line.id)?.finished ?? false,
    }));
  }

  @Post('assignments/:id/finish')
  @RequirePermission('budget_line_assignment.update')
  async finish(@CurrentUser() user: RequestUser, @Param('id', ParseIntPipe) id: number, @Body() body: FinishDto) {
    const assignment = await this.prisma.budgetLineAssignment.findUnique({ where: { id } });
    if (!assignment) throw new NotFoundException('La asignacion no existe');
    if (assignment.userId !== user.id) throw new BadRequestException('Solo quien tiene el renglon lo marca terminado');

    return this.prisma.budgetLineAssignment.update({
      where: { id },
      data: { finished: body.finished, finishedAt: body.finished ? new Date() : null },
    });
  }

  // --------------------------------------------------------- alta de catalogo
  //
  // Categoria y LineItem NO estan ligados a ningun anio fiscal -- se crean UNA
  // vez y quedan disponibles para siempre, incluidos los anios que todavia no
  // existen. Antes esto solo lo poblaba import-excel.ts; a partir de este anio
  // ya no hay mas Excel, asi que estas son la unica puerta de entrada.

  @Post('categories')
  @RequirePermission('category.create')
  async createCategory(@Body() body: CreateCategoryDto) {
    const sheet = await this.prisma.budgetSheet.findUnique({ where: { id: body.budgetSheetId } });
    if (!sheet) throw new NotFoundException('La hoja no existe');

    const code = this.slugify(body.name);
    const clash = await this.prisma.category.findUnique({
      where: { budgetSheetId_code: { budgetSheetId: body.budgetSheetId, code } },
    });
    if (clash) throw new ConflictException(`Ya existe la categoria "${clash.name}" en esta hoja.`);

    const { _max } = await this.prisma.category.aggregate({
      where: { budgetSheetId: body.budgetSheetId },
      _max: { sortOrder: true },
    });

    return this.prisma.category.create({
      data: {
        budgetSheetId: body.budgetSheetId,
        parentCategoryId: body.parentCategoryId,
        departmentId: body.departmentId ?? sheet.departmentId,
        code,
        name: body.name,
        sortOrder: (_max.sortOrder ?? 0) + 1,
        isSubtotal: body.isSubtotal ?? false,
      },
    });
  }

  @Post('line-items')
  @RequirePermission('line_item.create')
  async createLineItem(@Body() body: CreateLineItemDto) {
    const category = await this.prisma.category.findUnique({ where: { id: body.categoryId } });
    if (!category) throw new NotFoundException('La categoria no existe');

    const code = this.slugify(body.name);
    const clash = await this.prisma.lineItem.findUnique({
      where: { categoryId_code: { categoryId: body.categoryId, code } },
    });
    if (clash) throw new ConflictException(`Ya existe el concepto "${clash.name}" en esta categoria.`);

    const { _max } = await this.prisma.lineItem.aggregate({
      where: { categoryId: body.categoryId },
      _max: { sortOrder: true },
    });

    return this.prisma.lineItem.create({
      data: {
        categoryId: body.categoryId,
        code,
        name: body.name,
        nature: body.nature,
        frequency: body.frequency ?? Frequency.monthly,
        applicableMonths: body.applicableMonths ?? [],
        glAccount: body.glAccount,
        fnbOnly: body.fnbOnly ?? false,
        costCenterOnly: body.costCenterOnly,
        sortOrder: (_max.sortOrder ?? 0) + 1,
      },
    });
  }

  /** Mismo criterio que catalog-normalize.ts (scripts/) para no divergir del catalogo importado. */
  private slugify(name: string): string {
    return (
      name
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 60) || 'SIN_NOMBRE'
    );
  }

  // ----------------------------------------------------- fuente del renglon
  //
  // Un renglon puede tomar su numero de: captura manual, el mismo concepto en
  // un anio anterior (via BudgetLineLink, con un factor de ajuste), o la
  // prediccion de metric_forecast -- SIEMPRE datos ya en la plataforma, nunca
  // se depende de un Excel para esto (los Excel solo fueron la carga inicial
  // de historial; a partir de este anio todo se captura aqui).

  /**
   * A que cuenta/subcuenta de metric_forecast corresponde este concepto del
   * catalogo. Se cura a mano una sola vez por concepto (no por renglon/anio).
   * Manda ambos campos o ninguno: se sobreescriben juntos.
   */
  @Patch('line-items/:id/forecast-mapping')
  @RequirePermission('line_item.update')
  async setForecastMapping(@Param('id', ParseIntPipe) id: number, @Body() body: SetForecastMappingDto) {
    const item = await this.prisma.lineItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('El concepto no existe');

    return this.prisma.lineItem.update({
      where: { id },
      data: {
        forecastAccount: body.forecastAccount ?? null,
        forecastSubaccount: body.forecastSubaccount ?? null,
      },
    });
  }

  /**
   * Las opciones disponibles para este renglon: lo capturado ahorita, lo que
   * costo el mismo concepto en cada anio fiscal anterior que exista, y -- si
   * el concepto ya tiene mapeo -- la prediccion de metric_forecast para este
   * departamento/unidad de negocio/anio.
   */
  @Get('lines/:id/source-options')
  @RequirePermission('budget_line.read')
  async sourceOptions(@CurrentUser() user: RequestUser, @Param('id', ParseIntPipe) id: number) {
    const line = await this.prisma.budgetLine.findUnique({
      where: { id },
      include: {
        lineItem: { select: { id: true, name: true, forecastAccount: true, forecastSubaccount: true } },
        budget: { select: { businessUnitId: true, fiscalYearId: true, fiscalYear: { select: { year: true } } } },
        budgetLineMonth: { select: { month: true, amount: true } },
      },
    });
    if (!line) throw new NotFoundException('El renglon no existe');
    await this.budgets.assertReach(user.id, line.departmentId, line.budget.businessUnitId);

    const currentTotal = line.budgetLineMonth.reduce((s, m) => s + Number(m.amount), 0);
    const options: Record<string, unknown>[] = [
      { source: 'manual', year: line.budget.fiscalYear.year, total: currentTotal },
    ];

    const priorYears = await this.prisma.fiscalYear.findMany({
      where: { year: { lt: line.budget.fiscalYear.year } },
      orderBy: { year: 'desc' },
      select: { id: true, year: true },
    });

    for (const fy of priorYears) {
      const priorLine = await this.prisma.budgetLine.findFirst({
        where: {
          lineItemId: line.lineItemId,
          departmentId: line.departmentId,
          budget: { fiscalYearId: fy.id, businessUnitId: line.budget.businessUnitId },
        },
        include: { budgetLineMonth: { select: { month: true, amount: true } } },
      });
      if (!priorLine) continue;
      const total = priorLine.budgetLineMonth.reduce((s, m) => s + Number(m.amount), 0);
      options.push({ source: 'previous_year', year: fy.year, lineId: priorLine.id, total, months: priorLine.budgetLineMonth });
    }

    if (line.lineItem.forecastAccount) {
      // metric_forecast trae filas duplicadas al por mayor (~972x visto en
      // produccion) -- distinct por (date, subaccount) antes de sumar, o el
      // total sale inflado por cientos de veces.
      const rows = await this.prisma.metricForecast.findMany({
        where: {
          account: line.lineItem.forecastAccount,
          ...(line.lineItem.forecastSubaccount ? { subaccount: line.lineItem.forecastSubaccount } : {}),
          businessUnitId: line.budget.businessUnitId,
          department: line.departmentId,
          date: {
            gte: new Date(Date.UTC(line.budget.fiscalYear.year, 0, 1)),
            lt: new Date(Date.UTC(line.budget.fiscalYear.year + 1, 0, 1)),
          },
        },
        select: { date: true, predictedValue: true },
        distinct: ['date', 'subaccount'],
      });
      if (rows.length > 0) {
        const total = rows.reduce((s, r) => s + Number(r.predictedValue), 0);
        options.push({ source: 'forecast', year: line.budget.fiscalYear.year, total, dataPoints: rows.length });
      }
    }

    return { line: { id: line.id, name: line.lineItem.name }, options };
  }

  /** Aplica una de las opciones de /source-options: materializa los 12 meses del renglon. */
  @Put('lines/:id/apply-source')
  @RequirePermission('budget_line.update')
  async applySource(@CurrentUser() user: RequestUser, @Param('id', ParseIntPipe) id: number, @Body() body: ApplySourceDto) {
    const line = await this.budgets.assertCanEditLine(user.id, id);

    if (body.source === 'previous_year') {
      if (!body.sourceLineId) throw new BadRequestException('"previous_year" requiere sourceLineId.');
      const sourceLine = await this.prisma.budgetLine.findUnique({
        where: { id: body.sourceLineId },
        include: { budgetLineMonth: true },
      });
      if (!sourceLine) throw new NotFoundException('El renglon origen no existe');
      if (sourceLine.lineItemId !== line.lineItemId) {
        throw new BadRequestException('El renglon origen debe ser el mismo concepto en otro anio.');
      }

      const ratio = body.ratio ?? 1;
      await this.prisma.budgetLineLink.upsert({
        where: { targetLineId_sourceLineId: { targetLineId: id, sourceLineId: body.sourceLineId } },
        update: { ratio },
        create: { targetLineId: id, sourceLineId: body.sourceLineId, ratio, description: 'Enlazado a anio anterior' },
      });

      const overrides = await this.overriddenMonths(id);

      let total = new Prisma.Decimal(0);
      for (const m of sourceLine.budgetLineMonth) {
        const calculated = new Prisma.Decimal(m.amount).mul(ratio);
        const override = overrides.get(m.month);
        const effective = override ?? calculated;
        total = total.add(effective);
        await this.prisma.budgetLineMonth.upsert({
          // Un mes ya corregido a mano conserva su amount -- solo se
          // actualiza calculatedAmount, para que la UI pueda mostrar "lo
          // capturado" vs "lo que diria la fuente" sin perder la correccion.
          where: { lineId_month: { lineId: id, month: m.month } },
          update: { amount: effective, calculatedAmount: calculated, ...(override ? {} : { isOverride: false }) },
          create: { lineId: id, month: m.month, amount: effective, calculatedAmount: calculated },
        });
      }
      await this.prisma.budgetLine.update({ where: { id }, data: { source: LineSource.previous_year, totalAnnual: total } });
    } else if (body.source === 'forecast') {
      const full = await this.prisma.budgetLine.findUniqueOrThrow({
        where: { id },
        include: { lineItem: true, budget: { include: { fiscalYear: true } } },
      });
      if (!full.lineItem.forecastAccount) {
        throw new BadRequestException('Este concepto no tiene mapeo de cuenta de prediccion; configuralo primero en /line-items/:id/forecast-mapping.');
      }

      // Mismo problema de duplicados que en /source-options -- distinct antes de sumar.
      const rows = await this.prisma.metricForecast.findMany({
        where: {
          account: full.lineItem.forecastAccount,
          ...(full.lineItem.forecastSubaccount ? { subaccount: full.lineItem.forecastSubaccount } : {}),
          businessUnitId: full.budget.businessUnitId,
          department: full.departmentId,
          date: {
            gte: new Date(Date.UTC(full.budget.fiscalYear.year, 0, 1)),
            lt: new Date(Date.UTC(full.budget.fiscalYear.year + 1, 0, 1)),
          },
        },
        select: { date: true, predictedValue: true },
        distinct: ['date', 'subaccount'],
      });
      if (rows.length === 0) throw new BadRequestException('No hay prediccion cargada para esta cuenta/departamento/anio.');

      const byMonth = new Map<Month, Prisma.Decimal>();
      for (const row of rows) {
        const month = MONTHS[row.date.getUTCMonth()];
        byMonth.set(month, (byMonth.get(month) ?? new Prisma.Decimal(0)).add(row.predictedValue));
      }

      const overrides = await this.overriddenMonths(id);

      let total = new Prisma.Decimal(0);
      for (const month of MONTHS) {
        const calculated = byMonth.get(month) ?? new Prisma.Decimal(0);
        const override = overrides.get(month);
        const effective = override ?? calculated;
        total = total.add(effective);
        await this.prisma.budgetLineMonth.upsert({
          where: { lineId_month: { lineId: id, month } },
          update: { amount: effective, calculatedAmount: calculated, ...(override ? {} : { isOverride: false }) },
          create: { lineId: id, month, amount: effective, calculatedAmount: calculated },
        });
      }
      await this.prisma.budgetLine.update({ where: { id }, data: { source: LineSource.forecast, totalAnnual: total } });
    } else {
      await this.prisma.budgetLine.update({ where: { id }, data: { source: LineSource.manual } });
    }

    await this.budgets.refreshProgress(line.budgetId);
    return this.prisma.budgetLine.findUnique({ where: { id }, include: { budgetLineMonth: true } });
  }

  /** Meses de este renglon ya corregidos a mano -- apply-source no los pisa, solo el usuario los cambia via /months/:month. */
  private async overriddenMonths(lineId: number): Promise<Map<Month, Prisma.Decimal>> {
    const existing = await this.prisma.budgetLineMonth.findMany({ where: { lineId, isOverride: true } });
    return new Map(existing.map((m) => [m.month, m.amount]));
  }
}
