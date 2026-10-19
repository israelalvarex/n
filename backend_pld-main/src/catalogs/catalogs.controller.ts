import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthorizationService } from '../auth/authorization.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { SessionGuard } from '../auth/session.guard';
import type { RequestUser } from '../auth/session.guard';
import { PrismaService } from '../prisma/prisma.service';

/** Catalogos que alimentan selectores. Todo sale ya filtrado por alcance. */
@Controller()
@UseGuards(SessionGuard, PermissionsGuard)
export class CatalogsController {
  constructor(
    private prisma: PrismaService,
    private authz: AuthorizationService,
  ) {}

  @Get('business-units')
  @RequirePermission('business_unit.read')
  async businessUnits(@CurrentUser() user: RequestUser) {
    const scope = await this.authz.getUserScope(user.id);
    return this.prisma.businessUnit.findMany({
      where: { active: true, ...(scope.allBusinessUnits ? {} : { id: { in: scope.businessUnitIds } }) },
      select: { id: true, code: true, name: true, type: true, city: true },
      orderBy: { name: 'asc' },
    });
  }

  @Get('departments')
  @RequirePermission('department.read')
  async departments(@CurrentUser() user: RequestUser) {
    const scope = await this.authz.getUserScope(user.id);
    return this.prisma.department.findMany({
      where: { active: true, ...(scope.allDepartments ? {} : { id: { in: scope.departmentIds } }) },
      select: { id: true, code: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  @Get('fiscal-years')
  @RequirePermission('fiscal_year.read')
  fiscalYears() {
    return this.prisma.fiscalYear.findMany({ orderBy: { year: 'desc' } });
  }

  @Get('fiscal-years/:year/calendar')
  @RequirePermission('fiscal_year.read')
  calendar(@Query('year') year: string) {
    return this.prisma.monthCalendar.findMany({
      where: { fiscalYear: { year: Number(year) } },
      orderBy: { monthNumber: 'asc' },
    });
  }

  @Get('gl-accounts')
  @RequirePermission('gl_account.read')
  glAccounts() {
    return this.prisma.glAccount.findMany({ where: { active: true }, orderBy: { code: 'asc' } });
  }

  /** Buscador global del sidebar. Departamentos, casinos y personas del alcance. */
  @Get('search')
  async search(@CurrentUser() user: RequestUser, @Query('q') q: string) {
    if (!q || q.length < 2) return { departments: [], businessUnits: [], people: [] };
    const scope = await this.authz.getUserScope(user.id);
    const contains = { contains: q, mode: 'insensitive' as const };

    const [departments, businessUnits, people] = await Promise.all([
      this.prisma.department.findMany({
        where: { name: contains, ...(scope.allDepartments ? {} : { id: { in: scope.departmentIds } }) },
        select: { id: true, code: true, name: true },
        take: 5,
      }),
      this.prisma.businessUnit.findMany({
        where: { name: contains, ...(scope.allBusinessUnits ? {} : { id: { in: scope.businessUnitIds } }) },
        select: { id: true, code: true, name: true },
        take: 5,
      }),
      this.prisma.user.findMany({
        where: { OR: [{ name: contains }, { email: contains }], active: true },
        select: { id: true, name: true, email: true, department: { select: { name: true } } },
        take: 5,
      }),
    ]);
    return { departments, businessUnits, people };
  }
}
