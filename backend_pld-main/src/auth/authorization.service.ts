// auth/authorization.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionEffect, ScopeMode } from '../../generated/prisma/enums';

/**
 * Alcance efectivo de un usuario: QUE VE.
 *
 * `allDepartments` / `allBusinessUnits` en true significan comodin. En ese caso
 * la lista correspondiente va vacia y NO debe usarse como filtro: un encargado
 * de departamento tiene allBusinessUnits = true porque ve su departamento en
 * todos los casinos, presentes y futuros.
 */
export interface UserScope {
  userId: number;
  isSuperadmin: boolean;
  allDepartments: boolean;
  departmentIds: number[];
  allBusinessUnits: boolean;
  businessUnitIds: number[];
  allCostCenters: boolean;
  costCenterIds: number[];
}

/**
 * Cuanto se reutilizan las asignaciones de un usuario. Una sola peticion las
 * pide varias veces (permiso, alcance, roles) y una hoja que guarda seguido
 * hace muchas peticiones; un cambio de rol tarda a lo mas esto en notarse.
 */
const VIGENCIA_GRANTS_MS = 10_000;

@Injectable()
export class AuthorizationService {
  constructor(private prisma: PrismaService) {}

  private grants = new Map<number, { hasta: number; valor: ReturnType<AuthorizationService['consultarGrants']> }>();

  /** Olvida lo memorizado (de un usuario, o de todos) tras cambiar asignaciones. */
  olvidar(userId?: number) {
    if (userId === undefined) this.grants.clear();
    else this.grants.delete(userId);
  }

  /**
   * Permisos efectivos, en claves tipo `budget_line.capture`.
   *
   * Resolucion, de mayor a menor peso:
   *   1. denegar explicito sobre la asignacion
   *   2. permitir explicito sobre la asignacion
   *   3. permiso que da el rol
   *   4. lo no listado queda negado
   *
   * El superadmin recibe el catalogo completo sin evaluar nada.
   */
  async getUserPermissions(userId: number): Promise<string[]> {
    const grants = await this.activeGrants(userId);
    if (!grants.length) return [];

    if (grants.some((g) => g.user.isSuperadmin || g.role.bypassesScope)) {
      const all = await this.prisma.permission.findMany({ select: { code: true } });
      return all.map((p) => p.code);
    }

    const allowed = new Set<string>();
    const denied = new Set<string>();

    for (const grant of grants) {
      for (const rp of grant.role.rolePermission) {
        (rp.effect === PermissionEffect.deny ? denied : allowed).add(rp.permission.code);
      }
      // La excepcion puntual del usuario pesa mas que lo que da el rol
      for (const gp of grant.accessGrantPermission) {
        if (gp.effect === PermissionEffect.deny) {
          denied.add(gp.permission.code);
          allowed.delete(gp.permission.code);
        } else {
          allowed.add(gp.permission.code);
        }
      }
    }

    return [...allowed].filter((code) => !denied.has(code)).sort();
  }

  async hasPermission(userId: number, permission: string): Promise<boolean> {
    return (await this.getUserPermissions(userId)).includes(permission);
  }

  async hasAnyPermission(userId: number, permissions: string[]): Promise<boolean> {
    const granted = await this.getUserPermissions(userId);
    return permissions.some((p) => granted.includes(p));
  }

  /** Los roles vigentes del usuario. Puede llevar mas de uno. */
  async getUserRoles(userId: number): Promise<string[]> {
    const grants = await this.activeGrants(userId);
    return [...new Set(grants.map((g) => g.role.code))];
  }

  /**
   * Que departamentos y que casinos alcanza el usuario.
   * El acceso efectivo es la UNION de todas sus asignaciones vigentes: si una
   * sola dice "todos", esa dimension queda abierta.
   */
  async getUserScope(userId: number): Promise<UserScope> {
    const grants = await this.activeGrants(userId);

    const scope: UserScope = {
      userId,
      isSuperadmin: false,
      allDepartments: false,
      departmentIds: [],
      allBusinessUnits: false,
      businessUnitIds: [],
      allCostCenters: false,
      costCenterIds: [],
    };

    const departments = new Set<number>();
    const businessUnits = new Set<number>();
    const costCenters = new Set<number>();

    for (const grant of grants) {
      if (grant.user.isSuperadmin || grant.role.bypassesScope) {
        scope.isSuperadmin = true;
        scope.allDepartments = true;
        scope.allBusinessUnits = true;
        scope.allCostCenters = true;
        return scope;
      }

      if (grant.departmentScope === ScopeMode.all) scope.allDepartments = true;
      else grant.accessGrantDepartment.forEach((d) => departments.add(d.departmentId));

      if (grant.businessUnitScope === ScopeMode.all) scope.allBusinessUnits = true;
      else grant.accessGrantBusinessUnit.forEach((u) => businessUnits.add(u.businessUnitId));

      if (grant.costCenterScope === ScopeMode.all) scope.allCostCenters = true;
      else grant.accessGrantCostCenter.forEach((c) => costCenters.add(c.costCenterId));
    }

    if (!scope.allDepartments) scope.departmentIds = [...departments];
    if (!scope.allBusinessUnits) scope.businessUnitIds = [...businessUnits];
    if (!scope.allCostCenters) scope.costCenterIds = [...costCenters];
    return scope;
  }

  /** ¿Puede tocar este departamento en este casino? */
  async canReach(userId: number, departmentId: number, businessUnitId: number): Promise<boolean> {
    const scope = await this.getUserScope(userId);
    return (
      (scope.allDepartments || scope.departmentIds.includes(departmentId)) &&
      (scope.allBusinessUnits || scope.businessUnitIds.includes(businessUnitId))
    );
  }

  /**
   * Clausula `where` lista para filtrar cualquier consulta que tenga columnas
   * de departamento y unidad de negocio. Un alcance abierto no agrega filtro.
   */
  async scopeFilter(userId: number): Promise<Record<string, unknown>> {
    const scope = await this.getUserScope(userId);
    const where: Record<string, unknown> = {};
    if (!scope.allDepartments) where.departmentId = { in: scope.departmentIds };
    if (!scope.allBusinessUnits) where.businessUnitId = { in: scope.businessUnitIds };
    return where;
  }

  /** Asignaciones vigentes hoy, con su rol, sus permisos y sus listas de alcance. */
  private activeGrants(userId: number) {
    const ahora = Date.now();
    const memo = this.grants.get(userId);
    if (memo && memo.hasta > ahora) return memo.valor;
    const valor = this.consultarGrants(userId);
    this.grants.set(userId, { hasta: ahora + VIGENCIA_GRANTS_MS, valor });
    // Una consulta fallida no se queda memorizada.
    valor.catch(() => this.grants.delete(userId));
    return valor;
  }

  private consultarGrants(userId: number) {
    const today = new Date();
    return this.prisma.accessGrant.findMany({
      where: {
        userId,
        user: { active: true },
        role: { active: true },
        validFrom: { lte: today },
        OR: [{ validUntil: null }, { validUntil: { gte: today } }],
      },
      include: {
        user: { select: { isSuperadmin: true } },
        role: {
          select: {
            code: true,
            bypassesScope: true,
            rolePermission: { select: { effect: true, permission: { select: { code: true } } } },
          },
        },
        accessGrantPermission: { select: { effect: true, permission: { select: { code: true } } } },
        accessGrantDepartment: { select: { departmentId: true } },
        accessGrantBusinessUnit: { select: { businessUnitId: true } },
        accessGrantCostCenter: { select: { costCenterId: true } },
      },
    });
  }
}
