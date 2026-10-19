import { Body, Controller, Get, NotFoundException, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { IsEnum, IsInt, IsNumber, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';
import { Month } from '../../generated/prisma/enums';
import { AuthorizationService } from '../auth/authorization.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { SessionGuard } from '../auth/session.guard';
import type { RequestUser } from '../auth/session.guard';
import { PrismaService } from '../prisma/prisma.service';

class RegisterActualDto {
  @IsInt() @IsPositive() lineId!: number;
  @IsEnum(Month) month!: Month;
  @IsNumber() committedAmount!: number;
  @IsOptional() @IsNumber() paidAmount?: number;

  /** El presupuesto se ejerce al emitir la OC, no al pagar: por eso es obligatoria. */
  @IsString() @MaxLength(60) purchaseOrderRef!: string;
}

@Controller()
@UseGuards(SessionGuard, PermissionsGuard)
export class ReportsController {
  constructor(
    private prisma: PrismaService,
    private authz: AuthorizationService,
  ) {}

  /** Consolidado: totales por casino y departamento, ya filtrado por alcance. */
  @Get('consolidated')
  @RequirePermission('budget.export')
  async consolidated(@CurrentUser() user: RequestUser, @Query('fiscalYearId', ParseIntPipe) fiscalYearId: number) {
    const scope = await this.authz.getUserScope(user.id);

    const rows = await this.prisma.budgetLine.groupBy({
      by: ['departmentId', 'budgetId'],
      where: {
        budget: {
          fiscalYearId,
          isCurrent: true,
          ...(scope.allBusinessUnits ? {} : { businessUnitId: { in: scope.businessUnitIds } }),
        },
        ...(scope.allDepartments ? {} : { departmentId: { in: scope.departmentIds } }),
      },
      _sum: { totalAnnual: true },
      _count: { _all: true },
    });

    const [budgets, departments] = await Promise.all([
      this.prisma.budget.findMany({
        where: { id: { in: rows.map((r) => r.budgetId) } },
        select: { id: true, businessUnit: { select: { id: true, code: true, name: true } } },
      }),
      this.prisma.department.findMany({ select: { id: true, code: true, name: true } }),
    ]);

    const detail = rows.map((row) => ({
      businessUnit: budgets.find((b) => b.id === row.budgetId)?.businessUnit,
      department: departments.find((d) => d.id === row.departmentId),
      lines: row._count._all,
      total: Number(row._sum.totalAnnual ?? 0),
    }));

    return {
      total: detail.reduce((s, r) => s + r.total, 0),
      byBusinessUnit: this.groupSum(detail, (r) => r.businessUnit?.name ?? '—'),
      byDepartment: this.groupSum(detail, (r) => r.department?.name ?? '—'),
      detail,
    };
  }

  /** Ejercido contra presupuesto. La variacion es lo que se revisa cada mes. */
  @Get('execution')
  @RequirePermission('monthly_actual.read')
  async execution(
    @CurrentUser() user: RequestUser,
    @Query('fiscalYearId', ParseIntPipe) fiscalYearId: number,
    @Query('businessUnitId') businessUnitId?: string,
    @Query('departmentId') departmentId?: string,
  ) {
    const scope = await this.authz.getUserScope(user.id);

    const lines = await this.prisma.budgetLine.findMany({
      where: {
        budget: {
          fiscalYearId,
          isCurrent: true,
          ...(businessUnitId ? { businessUnitId: Number(businessUnitId) } : {}),
          ...(scope.allBusinessUnits ? {} : { businessUnitId: { in: scope.businessUnitIds } }),
        },
        ...(departmentId ? { departmentId: Number(departmentId) } : {}),
        ...(scope.allDepartments ? {} : { departmentId: { in: scope.departmentIds } }),
      },
      select: {
        id: true,
        totalAnnual: true,
        lineItem: { select: { name: true } },
        department: { select: { code: true, name: true } },
        monthlyActual: { select: { month: true, committedAmount: true, paidAmount: true, purchaseOrderRef: true } },
      },
    });

    return lines.map((line) => {
      const committed = line.monthlyActual.reduce((s, a) => s + Number(a.committedAmount), 0);
      const budgeted = Number(line.totalAnnual);
      return {
        lineId: line.id,
        name: line.lineItem.name,
        department: line.department,
        budgeted,
        committed,
        variance: budgeted - committed,
        variancePct: budgeted ? Number((((committed - budgeted) / budgeted) * 100).toFixed(2)) : null,
        months: line.monthlyActual,
      };
    });
  }

  @Post('execution')
  @RequirePermission('monthly_actual.capture')
  async registerActual(@Body() body: RegisterActualDto) {
    const line = await this.prisma.budgetLine.findUnique({ where: { id: body.lineId } });
    if (!line) throw new NotFoundException('El renglon no existe');

    return this.prisma.monthlyActual.upsert({
      where: { lineId_month: { lineId: body.lineId, month: body.month } },
      update: {
        committedAmount: body.committedAmount,
        paidAmount: body.paidAmount ?? 0,
        purchaseOrderRef: body.purchaseOrderRef,
        updatedAt: new Date(),
      },
      create: {
        lineId: body.lineId,
        month: body.month,
        committedAmount: body.committedAmount,
        paidAmount: body.paidAmount ?? 0,
        purchaseOrderRef: body.purchaseOrderRef,
      },
    });
  }

  /** Menu "Historial": que paso con una hoja y quien lo hizo. */
  @Get('history')
  @RequirePermission('budget_audit_log.read')
  async history(@Query('budgetId', ParseIntPipe) budgetId: number) {
    return this.prisma.budgetAuditLog.findMany({
      where: { budgetId },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { loggedAt: 'desc' },
      take: 100,
    });
  }

  private groupSum<T>(rows: T[], key: (row: T) => string) {
    const map = new Map<string, number>();
    for (const row of rows) {
      const k = key(row);
      map.set(k, (map.get(k) ?? 0) + (row as { total: number }).total);
    }
    return [...map.entries()].map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total);
  }
}
