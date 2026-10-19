import {
  BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, ParseIntPipe, Post, Query, UseGuards,
} from '@nestjs/common';
import { ArrayMaxSize, IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsPositive, IsString } from 'class-validator';
import { BudgetStatus, ReviewOutcome, ThreadStatus } from '../../generated/prisma/enums';
import { CurrentUser } from '../auth/current-user.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { SessionGuard } from '../auth/session.guard';
import type { RequestUser } from '../auth/session.guard';
import { BudgetsService } from '../budgets/budgets.service';
import { ReadinessService } from '../budgets/readiness.service';
import { PrismaService } from '../prisma/prisma.service';

class SubmitDto {
  @IsInt() @IsPositive() fiscalYearId!: number;
  @IsInt() @IsPositive() departmentId!: number;
  @IsOptional() @IsString() note?: string;
  /**
   * Enviar aunque haya hojas sin marcar como listas: a esas se les llenan con
   * la prediccion base las cuentas que nadie eligio, se marcan como listas y
   * se envian con las demas.
   */
  @IsOptional() @IsBoolean() completarConBase?: boolean;
  /**
   * Enviar solo estos casinos. Es para las hojas que el dictamen devolvio: se
   * corrigen y se reenvian solas, sin marcarlas como listas ni esperar al
   * resto del departamento. Cualquier otra hoja va en el envio completo.
   */
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsInt({ each: true }) @IsPositive({ each: true })
  businessUnitIds?: number[];
}

class DecideDto {
  @IsEnum(ReviewOutcome) result!: ReviewOutcome;
  @IsOptional() @IsString() comment?: string;
}

/**
 * El envio es POR DEPARTAMENTO y abarca sus casinos.
 * El dictamen es CASINO POR CASINO. Esa asimetria viene del diseno.
 *
 * Antes del envio, cada hoja (departamento x casino) se marca como "lista" por
 * quien la captura; el envio se lleva las listas.
 */
@Controller()
@UseGuards(SessionGuard, PermissionsGuard)
export class ReviewController {
  constructor(
    private prisma: PrismaService,
    private budgets: BudgetsService,
    private readiness: ReadinessService,
  ) {}

  // ------------------------------------------------------------ hoja lista

  /** Marcar la hoja como lista para revision. Solo en captura y con algo guardado. */
  @Post('sheets/:businessUnitId/:departmentId/ready')
  @RequirePermission('budget_line_month.capture')
  async marcarLista(
    @CurrentUser() user: RequestUser,
    @Param('businessUnitId', ParseIntPipe) businessUnitId: number,
    @Param('departmentId', ParseIntPipe) departmentId: number,
    @Query('fiscalYearId', ParseIntPipe) fiscalYearId: number,
  ) {
    await this.budgets.assertReach(user.id, departmentId, businessUnitId);
    await this.readiness.marcar(fiscalYearId, businessUnitId, departmentId, user.id);
    return { ready: true };
  }

  /** Quitar la marca, para seguir capturando antes del envio. */
  @Delete('sheets/:businessUnitId/:departmentId/ready')
  @RequirePermission('budget_line_month.capture')
  async quitarLista(
    @CurrentUser() user: RequestUser,
    @Param('businessUnitId', ParseIntPipe) businessUnitId: number,
    @Param('departmentId', ParseIntPipe) departmentId: number,
    @Query('fiscalYearId', ParseIntPipe) fiscalYearId: number,
  ) {
    await this.budgets.assertReach(user.id, departmentId, businessUnitId);
    await this.readiness.quitar(fiscalYearId, businessUnitId, departmentId);
    return { ready: false };
  }

  // ------------------------------------------------------------------ envio

  /**
   * Pantalla de envio: por casino, si su hoja esta lista, si ya se envio, y
   * cuales faltan. Una hoja "pendiente" es una en captura que no esta lista y
   * que tiene algo que presupuestar (renglones o prediccion); las que no
   * tienen ninguna de las dos no cuentan.
   */
  @Get('departments/:id/submission-preview')
  @RequirePermission('budget.read')
  async preview(
    @Param('id', ParseIntPipe) departmentId: number,
    @Query('fiscalYearId', ParseIntPipe) fiscalYearId: number,
  ) {
    const fiscalYear = await this.prisma.fiscalYear.findUnique({ where: { id: fiscalYearId }, select: { year: true } });
    if (!fiscalYear) throw new NotFoundException('El ejercicio no existe');

    const [businessUnits, budgets, listas, conPrediccion] = await Promise.all([
      this.prisma.businessUnit.findMany({
        where: { active: true }, select: { id: true, code: true, name: true }, orderBy: { name: 'asc' },
      }),
      this.prisma.budget.findMany({
        where: { fiscalYearId, isCurrent: true },
        select: { id: true, status: true, businessUnitId: true },
      }),
      this.readiness.listas(fiscalYearId),
      this.readiness.casinosConPrediccion(departmentId, fiscalYear.year),
    ]);
    const budgetByUnit = new Map(budgets.map((b) => [b.businessUnitId, b]));

    const reviews = await this.prisma.budgetSheetReview.findMany({
      where: { budgetId: { in: budgets.map((b) => b.id) }, departmentId },
      select: { budgetId: true, status: true },
    });
    const reviewByBudget = new Map(reviews.map((r) => [r.budgetId, r.status]));

    const units = await Promise.all(
      businessUnits.map(async (businessUnit) => {
        const budget = budgetByUnit.get(businessUnit.id);
        const status = budget?.status === BudgetStatus.closed || budget?.status === BudgetStatus.reforecast
          ? budget.status
          : (budget ? reviewByBudget.get(budget.id) : undefined) ?? BudgetStatus.draft;
        const [total, captured] = budget ? await Promise.all([
          this.prisma.budgetLine.count({ where: { budgetId: budget.id, departmentId } }),
          this.prisma.budgetLine.count({ where: { budgetId: budget.id, departmentId, totalAnnual: { gt: 0 } } }),
        ]) : [0, 0];
        const ready = listas.has(`${businessUnit.id}|${departmentId}`);
        const tienePrediccion = conPrediccion.has(businessUnit.id);
        return {
          businessUnit,
          budgetId: budget?.id ?? null,
          status,
          /** El dictamen la devolvio: se puede corregir y reenviar sola. */
          returned: budget ? await this.budgets.devolucion(budget.id, departmentId) : null,
          total,
          captured,
          ready,
          conPrediccion: tienePrediccion,
          /** Lista y en captura: sale en el siguiente envio. */
          complete: ready && status === BudgetStatus.draft,
          /** En captura, sin marcar, y con algo que presupuestar. */
          pending: !ready && status === BudgetStatus.draft && (total > 0 || tienePrediccion),
        };
      }),
    );

    const threads = await this.prisma.commentThread.count({
      where: { departmentId, fiscalYearId, status: ThreadStatus.open },
    });
    const blocking = await this.prisma.commentThread.count({
      where: { departmentId, fiscalYearId, status: ThreadStatus.open, blocking: true },
    });

    return {
      units,
      complete: units.filter((u) => u.complete).length,
      incomplete: units.filter((u) => u.pending).map((u) => u.businessUnit.name),
      openThreads: threads,
      blockingThreads: blocking,
    };
  }

  /**
   * "Enviar a revision" el departamento completo: se lleva las hojas listas.
   *
   * Con `completarConBase`, las hojas pendientes se llenan antes con la
   * prediccion base en las cuentas que nadie eligio, se marcan como listas y
   * se envian con las demas. Sin el, las pendientes se quedan en captura.
   */
  @Post('submissions')
  @RequirePermission('review_submission.create')
  async submit(@CurrentUser() user: RequestUser, @Body() body: SubmitDto) {
    let preview = await this.preview(body.departmentId, body.fiscalYearId);

    // Envio de hojas devueltas, solas: se marcan como listas y se van.
    const soloEstas = body.businessUnitIds?.length ? new Set(body.businessUnitIds) : null;
    if (soloEstas) {
      const elegidas = preview.units.filter((u) => soloEstas.has(u.businessUnit.id));
      if (elegidas.length !== soloEstas.size || elegidas.some((u) => !u.returned)) {
        throw new BadRequestException(
          'Solo se puede enviar sola una hoja que el dictamen devolvio; las demas van en el envio del departamento',
        );
      }
      for (const u of elegidas) {
        await this.readiness.marcarSinValidar(body.fiscalYearId, u.businessUnit.id, body.departmentId, user.id);
      }
      preview = await this.preview(body.departmentId, body.fiscalYearId);
    }

    const completadas: string[] = [];
    if (body.completarConBase && !soloEstas) {
      for (const unit of preview.units.filter((u) => u.pending)) {
        await this.readiness.rellenarConBase(body.fiscalYearId, unit.businessUnit.id, body.departmentId);
        const budget = await this.budgets.findOrCreateBudget(body.fiscalYearId, unit.businessUnit.id);
        const guardados = await this.prisma.budgetLine.count({
          where: { budgetId: budget.id, departmentId: body.departmentId, totalAnnual: { gt: 0 } },
        });
        if (guardados > 0) {
          await this.readiness.marcarSinValidar(body.fiscalYearId, unit.businessUnit.id, body.departmentId, user.id);
          completadas.push(unit.businessUnit.name);
        }
      }
      preview = await this.preview(body.departmentId, body.fiscalYearId);
    }

    const aEnviar = preview.units.filter(
      (u) => u.complete && u.budgetId !== null && (!soloEstas || soloEstas.has(u.businessUnit.id)),
    );
    if (!aEnviar.length) throw new BadRequestException('No hay ninguna hoja lista para enviar');

    const last = await this.prisma.reviewSubmission.findFirst({
      where: { fiscalYearId: body.fiscalYearId, departmentId: body.departmentId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });

    const submission = await this.prisma.$transaction(async (tx) => {
      const created = await tx.reviewSubmission.create({
        data: {
          fiscalYearId: body.fiscalYearId,
          departmentId: body.departmentId,
          version: (last?.version ?? 0) + 1,
          submittedBy: user.id,
          submittedUnits: aEnviar.length,
          incompleteUnits: preview.incomplete.length,
          note: body.note,
        },
      });
      for (const unit of aEnviar) {
        await tx.budgetSheetReview.upsert({
          where: { budgetId_departmentId: { budgetId: unit.budgetId!, departmentId: body.departmentId } },
          create: { budgetId: unit.budgetId!, departmentId: body.departmentId, reviewSubmissionId: created.id, status: BudgetStatus.inReview },
          update: { reviewSubmissionId: created.id, status: BudgetStatus.inReview, updatedAt: new Date() },
        });
      }
      return created;
    });

    return { ...submission, pendientes: preview.incomplete, completadas };
  }

  /**
   * Evaluacion por departamento: cada departamento que ha enviado algo, con
   * TODAS sus hojas enviadas en el ejercicio, sin importar en que envio
   * llegaron. Asi una hoja aprobada en el envio 1 no desaparece cuando el
   * departamento reenvia en el envio 2 las que le devolvieron. Cada hoja trae
   * su envio (para dictaminarla), su estado y su ultimo dictamen.
   */
  @Get('reviews/departments')
  @RequirePermission('review_decision.approve')
  async porDepartamento(@Query('fiscalYearId', ParseIntPipe) fiscalYearId: number) {
    const hojas = await this.prisma.budgetSheetReview.findMany({
      where: { budget: { fiscalYearId, isCurrent: true } },
      select: {
        budgetId: true,
        status: true,
        reviewSubmissionId: true,
        department: { select: { id: true, code: true, name: true } },
        budget: { select: { businessUnit: { select: { id: true, code: true, name: true } } } },
        reviewSubmission: {
          select: { id: true, version: true, submittedAt: true, note: true, submittedBy2: { select: { name: true } } },
        },
      },
    });
    const decisiones = await this.prisma.reviewDecision.findMany({
      where: { reviewSubmissionId: { in: [...new Set(hojas.map((h) => h.reviewSubmissionId))] } },
      select: {
        reviewSubmissionId: true, budgetId: true, result: true, comment: true, decidedAt: true,
        decidedBy2: { select: { name: true } },
      },
    });
    const decisionDe = new Map(decisiones.map((d) => [`${d.reviewSubmissionId}|${d.budgetId}`, d]));
    const bloqueantes = await this.prisma.commentThread.groupBy({
      by: ['departmentId', 'businessUnitId'],
      where: { fiscalYearId, status: ThreadStatus.open, blocking: true },
      _count: { _all: true },
    });
    const bloqueantesDe = new Map(bloqueantes.map((b) => [`${b.departmentId}|${b.businessUnitId}`, b._count._all]));

    const porDepto = new Map<number, typeof hojas>();
    for (const h of hojas) porDepto.set(h.department.id, [...(porDepto.get(h.department.id) ?? []), h]);

    return [...porDepto.values()]
      .map((lista) => {
        const ultimo = lista
          .map((h) => h.reviewSubmission)
          .reduce((a, b) => (b.submittedAt > a.submittedAt ? b : a));
        const units = lista
          .map((h) => {
            const d = decisionDe.get(`${h.reviewSubmissionId}|${h.budgetId}`);
            return {
              budgetId: h.budgetId,
              businessUnit: h.budget.businessUnit,
              status: h.status,
              submissionId: h.reviewSubmissionId,
              version: h.reviewSubmission.version,
              submittedAt: h.reviewSubmission.submittedAt,
              decision: d
                ? { result: d.result, comment: d.comment, decidedAt: d.decidedAt, decidedBy: d.decidedBy2.name }
                : null,
              blockingThreads: bloqueantesDe.get(`${lista[0]!.department.id}|${h.budget.businessUnit.id}`) ?? 0,
            };
          })
          .sort((a, b) => a.businessUnit.name.localeCompare(b.businessUnit.name));
        return {
          department: lista[0]!.department,
          lastSubmission: {
            id: ultimo.id,
            version: ultimo.version,
            submittedBy: ultimo.submittedBy2.name,
            submittedAt: ultimo.submittedAt,
            waitingDays: Math.floor((Date.now() - ultimo.submittedAt.getTime()) / 86_400_000),
            note: ultimo.note,
          },
          pending: units.filter((u) => u.status === BudgetStatus.inReview).length,
          units,
        };
      })
      .sort((a, b) => a.department.name.localeCompare(b.department.name));
  }

  /** Cola "En revision" del superadmin, con dias de espera y hilos bloqueantes. */
  @Get('reviews/queue')
  @RequirePermission('review_decision.approve')
  async queue(@Query('fiscalYearId', ParseIntPipe) fiscalYearId: number) {
    const submissions = await this.prisma.reviewSubmission.findMany({
      where: { fiscalYearId },
      include: {
        department: { select: { id: true, code: true, name: true } },
        submittedBy2: { select: { id: true, name: true } },
        reviewDecision: { select: { budgetId: true, result: true } },
      },
      orderBy: { submittedAt: 'asc' },
    });

    const units = await this.prisma.budgetSheetReview.findMany({
      where: { reviewSubmissionId: { in: submissions.map((s) => s.id) } },
      select: {
        reviewSubmissionId: true, status: true, budgetId: true,
        budget: { select: { businessUnit: { select: { id: true, code: true, name: true } } } },
      },
    });
    return Promise.all(
      submissions.filter((s) => units.some((u) => u.reviewSubmissionId === s.id)).map(async (s) => ({
        id: s.id,
        department: s.department,
        version: s.version,
        submittedBy: s.submittedBy2.name,
        waitingDays: Math.floor((Date.now() - s.submittedAt.getTime()) / 86_400_000),
        submittedUnits: s.submittedUnits,
        decided: s.reviewDecision.length,
        units: units.filter((u) => u.reviewSubmissionId === s.id).map((u) => ({
          budgetId: u.budgetId, businessUnit: u.budget.businessUnit, status: u.status,
        })),
        blockingThreads: await this.prisma.commentThread.count({
          where: {
            departmentId: s.departmentId, fiscalYearId, status: ThreadStatus.open, blocking: true,
            businessUnitId: { in: units.filter((u) => u.reviewSubmissionId === s.id && u.status === BudgetStatus.inReview)
              .map((u) => u.budget.businessUnit.id) },
          },
        }),
      })),
    );
  }

  /**
   * Dictamen de un casino dentro del envio.
   * Un hilo bloqueante abierto impide aprobar: es justo para lo que sirve la marca.
   */
  @Post('reviews/:submissionId/units/:businessUnitId/decide')
  @RequirePermission('review_decision.approve')
  async decide(
    @CurrentUser() user: RequestUser,
    @Param('submissionId', ParseIntPipe) submissionId: number,
    @Param('businessUnitId', ParseIntPipe) businessUnitId: number,
    @Body() body: DecideDto,
  ) {
    const submission = await this.prisma.reviewSubmission.findUnique({ where: { id: submissionId } });
    if (!submission) throw new NotFoundException('El envio no existe');

    const budget = await this.prisma.budget.findFirst({
      where: { fiscalYearId: submission.fiscalYearId, businessUnitId, isCurrent: true },
    });
    if (!budget) throw new NotFoundException('Ese casino no tiene presupuesto en el ejercicio');

    const sheetReview = await this.prisma.budgetSheetReview.findUnique({
      where: { budgetId_departmentId: { budgetId: budget.id, departmentId: submission.departmentId } },
    });
    if (sheetReview?.reviewSubmissionId !== submissionId || sheetReview.status !== BudgetStatus.inReview) {
      throw new BadRequestException('Esa hoja no pertenece a este envio pendiente de dictamen');
    }

    if (body.result === ReviewOutcome.approvedAndFrozen) {
      const blocking = await this.prisma.commentThread.count({
        where: {
          departmentId: submission.departmentId,
          businessUnitId,
          fiscalYearId: submission.fiscalYearId,
          status: ThreadStatus.open,
          blocking: true,
        },
      });
      if (blocking > 0) {
        throw new BadRequestException(`Hay ${blocking} conversacion(es) bloqueante(s) sin resolver`);
      }
    }

    const status = body.result === ReviewOutcome.approvedAndFrozen ? BudgetStatus.approved : BudgetStatus.draft;
    return this.prisma.$transaction(async (tx) => {
      const decision = await tx.reviewDecision.upsert({
        where: { reviewSubmissionId_budgetId: { reviewSubmissionId: submissionId, budgetId: budget.id } },
        update: { result: body.result, decidedBy: user.id, decidedAt: new Date(), comment: body.comment },
        create: { reviewSubmissionId: submissionId, budgetId: budget.id, result: body.result, decidedBy: user.id, comment: body.comment },
      });
      if (body.result !== ReviewOutcome.approvedAndFrozen) {
        // Regresa a captura: quien la corrige la vuelve a marcar como lista.
        await tx.setting.deleteMany({
          where: { code: 'budget_sheet.ready', fiscalYearId: submission.fiscalYearId, businessUnitId, departmentId: submission.departmentId },
        });
      }
      await tx.budgetSheetReview.update({
        where: { budgetId_departmentId: { budgetId: budget.id, departmentId: submission.departmentId } },
        data: { status, updatedAt: new Date() },
      });
      return decision;
    });
  }

  /** Reabrir una hoja congelada. Solo el superadmin. */
  @Post('sheets/:businessUnitId/:departmentId/reopen')
  @RequirePermission('budget.reopen')
  async reopen(
    @Param('businessUnitId', ParseIntPipe) businessUnitId: number,
    @Param('departmentId', ParseIntPipe) departmentId: number,
    @Query('fiscalYearId', ParseIntPipe) fiscalYearId: number,
  ) {
    const budget = await this.prisma.budget.findFirst({ where: { businessUnitId, fiscalYearId, isCurrent: true } });
    if (!budget) throw new NotFoundException('No existe el presupuesto');
    const sheetReview = await this.prisma.budgetSheetReview.findUnique({
      where: { budgetId_departmentId: { budgetId: budget.id, departmentId } },
    });
    if (sheetReview?.status !== BudgetStatus.approved) throw new BadRequestException('La hoja no esta aprobada');
    await this.prisma.setting.deleteMany({ where: { code: 'budget_sheet.ready', fiscalYearId, businessUnitId, departmentId } });
    return this.prisma.budgetSheetReview.update({
      where: { budgetId_departmentId: { budgetId: budget.id, departmentId } },
      data: { status: BudgetStatus.draft, updatedAt: new Date() },
    });
  }
}
