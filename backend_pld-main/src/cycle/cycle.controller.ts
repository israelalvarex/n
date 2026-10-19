import {
  BadRequestException, Body, Controller, ForbiddenException, Get, NotFoundException, Param, ParseIntPipe, Post, UseGuards,
} from '@nestjs/common';
import { IsInt, IsOptional, IsPositive } from 'class-validator';
import { CurrentUser } from '../auth/current-user.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { SessionGuard } from '../auth/session.guard';
import type { RequestUser } from '../auth/session.guard';
import { PrismaService } from '../prisma/prisma.service';

class OpenYearDto {
  @IsInt() @IsPositive() referenceYear!: number;
  @IsOptional() @IsInt() daysInFebruary?: number;
}

/** Días de cada mes. Febrero depende del año, y el Excel lo tenía mal para 2026. */
const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const MONTH_CODES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'] as const;
const isLeap = (year: number) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

/**
 * Apertura y cierre del ejercicio.
 *
 * Al abrir un año, los valores de los recursos se copian del anterior marcados
 * como PROYECCION: la UI los dibuja punteados y no afectan al presupuesto
 * vigente hasta que alguien los confirma.
 */
@Controller('fiscal-years')
@UseGuards(SessionGuard, PermissionsGuard)
export class CycleController {
  constructor(private prisma: PrismaService) {}

  /** Modal "Abrir el año": qué hay que confirmar antes de empezar. */
  @Get(':year/opening-preview')
  @RequirePermission('fiscal_year.manage')
  async preview(@Param('year', ParseIntPipe) year: number) {
    const previous = year - 1;
    const [parameters, payScale, supplies] = await Promise.all([
      this.prisma.resourceValue.count({ where: { year: previous, resource: { type: 'parameter' } } }),
      this.prisma.resourceValue.count({ where: { year: previous, resource: { type: 'payScale' } } }),
      this.prisma.resourceValue.count({ where: { year: previous, resource: { type: { in: ['supply', 'rate'] } } } }),
    ]);
    const already = await this.prisma.fiscalYear.findUnique({ where: { year } });

    return {
      year,
      copiesFrom: previous,
      alreadyOpen: Boolean(already),
      parametersToConfirm: parameters,
      payScaleEntries: payScale,
      suppliesAndRates: supplies,
      daysInFebruary: isLeap(year) ? 29 : 28,
    };
  }

  /** "Copiar y abrir". Crea el ejercicio, su calendario y las proyecciones. */
  @Post(':year/open')
  @RequirePermission('fiscal_year.manage')
  async open(@Param('year', ParseIntPipe) year: number, @Body() body: OpenYearDto) {
    const existing = await this.prisma.fiscalYear.findUnique({ where: { year } });
    if (existing) throw new BadRequestException(`El ejercicio ${year} ya esta abierto`);
    return this.crearEjercicio(year, body.referenceYear, body.daysInFebruary);
  }

  /**
   * Abrir el presupuesto de un año para todos los casinos, de un jalón.
   *
   * El presupuesto se arma para el año siguiente (las predicciones del modelo
   * son del año actual + 1), así que cada año alguien tiene que abrir el que
   * viene: 2027 en 2026, 2028 en 2027. Esto crea el ejercicio si no existe (con
   * su calendario y las proyecciones de recursos, igual que "Copiar y abrir"),
   * y el presupuesto de cada casino activo que tenga centro de costo.
   *
   * Se puede correr las veces que haga falta: lo que ya existe se respeta, y un
   * casino dado de alta despues recibe su presupuesto la siguiente vez.
   * Solo el superadmin.
   */
  @Post(':year/open-budgets')
  @RequirePermission('fiscal_year.manage')
  async openBudgets(@CurrentUser() user: RequestUser, @Param('year', ParseIntPipe) year: number) {
    if (!user.isSuperadmin) throw new ForbiddenException('Solo el superadmin abre el presupuesto de un año');
    const actual = new Date().getFullYear();
    if (year < actual) throw new BadRequestException(`No se abre el presupuesto de un año que ya pasó (${year})`);

    let fiscalYear = await this.prisma.fiscalYear.findUnique({ where: { year } });
    const ejercicioCreado = !fiscalYear;
    if (!fiscalYear) fiscalYear = (await this.crearEjercicio(year, year - 1)).fiscalYear;

    const units = await this.prisma.businessUnit.findMany({
      where: { active: true },
      select: { id: true, name: true, costCenter: { select: { id: true }, orderBy: { id: 'asc' }, take: 1 } },
      orderBy: { name: 'asc' },
    });

    const creados: string[] = [];
    const existentes: string[] = [];
    const sinCentroDeCosto: string[] = [];
    for (const unit of units) {
      const budget = await this.prisma.budget.findFirst({
        where: { fiscalYearId: fiscalYear.id, businessUnitId: unit.id, isCurrent: true },
        select: { id: true },
      });
      if (budget) {
        existentes.push(unit.name);
        continue;
      }
      const costCenter = unit.costCenter[0];
      if (!costCenter) {
        sinCentroDeCosto.push(unit.name);
        continue;
      }
      await this.prisma.budget.create({
        data: { fiscalYearId: fiscalYear.id, businessUnitId: unit.id, costCenterId: costCenter.id },
      });
      creados.push(unit.name);
    }

    return {
      fiscalYear: { id: fiscalYear.id, year: fiscalYear.year, isOpen: fiscalYear.isOpen },
      ejercicioCreado,
      creados,
      existentes,
      sinCentroDeCosto,
    };
  }

  /** Crea el ejercicio, su calendario y las proyecciones de recursos del año de referencia. */
  private async crearEjercicio(year: number, referenceYear: number, daysInFebruary?: number) {
    const fiscalYear = await this.prisma.fiscalYear.create({
      data: { year, referenceYear, openedOn: new Date() },
    });

    const february = daysInFebruary ?? (isLeap(year) ? 29 : 28);
    await this.prisma.monthCalendar.createMany({
      data: MONTH_CODES.map((month, i) => ({
        fiscalYearId: fiscalYear.id,
        month,
        monthNumber: i + 1,
        days: i === 1 ? february : DAYS[i],
      })),
    });

    // Los valores del año anterior se copian como punto de partida, marcados
    // como proyeccion: nadie los ha confirmado todavia.
    const previousValues = await this.prisma.resourceValue.findMany({ where: { year: referenceYear } });
    let copied = 0;
    for (const value of previousValues) {
      await this.prisma.resourceValue.upsert({
        where: { resourceId_year_component: { resourceId: value.resourceId, year, component: value.component } },
        update: {},
        create: { resourceId: value.resourceId, year, component: value.component, value: value.value, isProjection: true },
      });
      copied += 1;
    }

    return { fiscalYear, months: 12, projectionsCopied: copied };
  }

  /** Confirmar proyecciones: dejan de ser punteadas y ya afectan al presupuesto. */
  @Post(':year/confirm-projections')
  @RequirePermission('resource_value.update')
  async confirm(@CurrentUser() user: RequestUser, @Param('year', ParseIntPipe) year: number) {
    const result = await this.prisma.resourceValue.updateMany({
      where: { year, isProjection: true },
      data: { isProjection: false, confirmedAt: new Date(), confirmedBy: user.id },
    });
    return { confirmed: result.count };
  }

  /** Cerrar el ejercicio: los precios quedan fijos. */
  @Post(':year/close')
  @RequirePermission('fiscal_year.manage')
  async close(@CurrentUser() user: RequestUser, @Param('year', ParseIntPipe) year: number) {
    const fiscalYear = await this.prisma.fiscalYear.findUnique({ where: { year } });
    if (!fiscalYear) throw new NotFoundException('El ejercicio no existe');

    const pending = await this.prisma.resourceValue.count({ where: { year, isProjection: true } });
    if (pending > 0) {
      throw new BadRequestException(`Quedan ${pending} valores sin confirmar; confirmalos antes de cerrar`);
    }

    return this.prisma.fiscalYear.update({
      where: { id: fiscalYear.id },
      data: { isOpen: false, closedAt: new Date(), closedBy: user.id },
    });
  }
}
