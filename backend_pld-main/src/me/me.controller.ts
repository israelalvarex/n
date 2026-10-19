import { BadRequestException, Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { AuthorizationService } from '../auth/authorization.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionGuard } from '../auth/session.guard';
import type { RequestUser } from '../auth/session.guard';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateContextDto } from './update-context.dto';

@Controller('me')
@UseGuards(SessionGuard)
export class MeController {
  constructor(
    private prisma: PrismaService,
    private authz: AuthorizationService,
  ) {}

  /**
   * Todo lo que el front necesita para pintar la primera pantalla: quien es,
   * que alcanza y que puede hacer. De aqui salen el selector de casino, la
   * lista de departamentos del sidebar y que botones se ven.
   */
  @Get()
  async me(@CurrentUser() user: RequestUser) {
    const [roles, scope, permissions] = await Promise.all([
      this.authz.getUserRoles(user.id),
      this.authz.getUserScope(user.id),
      this.authz.getUserPermissions(user.id),
    ]);

    // Las listas visibles se resuelven aqui y no en el front: un alcance abierto
    // significa "todos", incluidos los que se den de alta manana.
    const [departments, businessUnits] = await Promise.all([
      this.prisma.department.findMany({
        where: { active: true, ...(scope.allDepartments ? {} : { id: { in: scope.departmentIds } }) },
        select: { id: true, code: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.businessUnit.findMany({
        where: { active: true, ...(scope.allBusinessUnits ? {} : { id: { in: scope.businessUnitIds } }) },
        select: { id: true, code: true, name: true, type: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    return {
      user,
      roles,
      scope: {
        allDepartments: scope.allDepartments,
        allBusinessUnits: scope.allBusinessUnits,
        departments,
        businessUnits,
      },
      permissions,
    };
  }

  /** Casino y ejercicio en los que quedo el usuario. */
  @Get('context')
  async context(@CurrentUser() user: RequestUser) {
    const context = await this.prisma.userContext.findUnique({
      where: { userId: user.id },
      include: {
        businessUnit: { select: { id: true, code: true, name: true } },
        fiscalYear: { select: { id: true, year: true, isOpen: true, closesOn: true } },
      },
    });
    return context ?? null;
  }

  /**
   * Cambiar de casino.
   *
   * Se revalida contra las asignaciones: userContext es preferencia de interfaz,
   * nunca fuente de autorizacion. Si el cliente manda un casino fuera de su
   * alcance, se rechaza aqui.
   */
  @Put('context')
  async setContext(@CurrentUser() user: RequestUser, @Body() body: UpdateContextDto) {
    const scope = await this.authz.getUserScope(user.id);
    if (!scope.allBusinessUnits && !scope.businessUnitIds.includes(body.businessUnitId)) {
      throw new BadRequestException('Ese casino esta fuera de tu alcance');
    }

    const fiscalYear = await this.prisma.fiscalYear.findUnique({ where: { id: body.fiscalYearId } });
    if (!fiscalYear) {
      throw new BadRequestException('El ejercicio no existe');
    }

    return this.prisma.userContext.upsert({
      where: { userId: user.id },
      update: { businessUnitId: body.businessUnitId, fiscalYearId: body.fiscalYearId, updatedAt: new Date() },
      create: { userId: user.id, businessUnitId: body.businessUnitId, fiscalYearId: body.fiscalYearId },
    });
  }
}
