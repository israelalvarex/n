/**
 * Seed base.
 *
 * Solo catalogos de arranque: casinos, departamentos, encargados, roles, el
 * ejercicio con su calendario, y los objetos y permisos del sistema.
 * NADA del Excel todavia (recursos, precios, renglones y presupuestos van aparte).
 *
 * Es idempotente: se puede correr las veces que haga falta.
 *
 *   npx prisma db seed
 */
import { PrismaClient } from '../generated/prisma/client';
import { ScopeMode, Month, Action } from '../generated/prisma/enums';
import { PrismaPg } from '@prisma/adapter-pg';
import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// -----------------------------------------------------------------------------
// Datos base
// -----------------------------------------------------------------------------

/**
 * Datos identificables (empresa, casinos y personas) NO viven en el codigo:
 * se leen de seed-data.json, que esta en .gitignore. Si no existe, se usa
 * seed-data.example.json, que trae valores ficticios y si se sube al repo.
 */
interface SeedData {
  company: { code: string; legalName: string };
  businessUnits: Array<{ code: string; name: string; type: string }>;
  superadmin: { name: string; email: string; jobTitle: string };
  departmentHeads: Array<{ name: string; email: string; jobTitle: string; departments: string[] }>;
}

const DATA_FILE = join(__dirname, 'seed-data.json');
const EXAMPLE_FILE = join(__dirname, 'seed-data.example.json');

function loadSeedData(): { data: SeedData; source: string } {
  const path = existsSync(DATA_FILE) ? DATA_FILE : EXAMPLE_FILE;
  return { data: JSON.parse(readFileSync(path, 'utf8')) as SeedData, source: basename(path) };
}

const { data: DATA, source: DATA_SOURCE } = loadSeedData();
const {
  company: COMPANY,
  businessUnits: BUSINESS_UNITS,
  superadmin: SUPERADMIN,
  departmentHeads: DEPARTMENT_HEADS,
} = DATA;

/** Un departamento por cedula. Una persona puede llevar varios. */
const DEPARTMENTS = [
  { code: 'RENTA_SERVICIOS', name: 'Renta y servicios' },
  { code: 'LIMPIEZA_MTTO', name: 'Limpieza y mantenimiento' },
  { code: 'LICENCIAMIENTO', name: 'Licenciamiento' },
  { code: 'REGALIAS_ACC', name: 'Regalias y accesorios' },
  { code: 'RH_GENTE', name: 'RH · Gente y Cultura' },
  { code: 'RH_NOMINA', name: 'RH · Nomina' },
  { code: 'MKT', name: 'Mercadotecnia' },
  { code: 'ADM_VIATICOS', name: 'Administracion y viaticos' },
  { code: 'GTOS_FIN', name: 'Gastos financieros' },
  { code: 'LEGAL', name: 'Legal' },
  { code: 'AYB', name: 'Alimentos y bebidas' },
  { code: 'ATT_CLIENTES', name: 'Atencion a clientes' },
  { code: 'ACTIVOS_DEP', name: 'Activos y depreciaciones' },
  { code: 'IMPUESTOS', name: 'Impuestos' },
];

/** Los cuatro roles del diseno. El alcance define QUE VE; el rol, QUE PUEDE ESCRIBIR. */
const ROLES = [
  {
    code: 'SUPERADMIN',
    name: 'Superadmin',
    description: 'Alcance completo, dictamina, edita reglas y parametros',
    bypassesScope: true,
  },
  {
    code: 'DEPT_HEAD',
    name: 'Encargado de departamento',
    description: 'Su departamento en todos los casinos: edita, comenta, asigna y envia a revision',
    bypassesScope: false,
  },
  {
    code: 'CASINO_HEAD',
    name: 'Encargado de casino',
    description: 'Todos los departamentos de su casino: edita lo no asignado y comenta',
    bypassesScope: false,
  },
  {
    code: 'MEMBER',
    name: 'Miembro de casino',
    description: 'Solo los renglones asignados: edita esos y comenta el resto',
    bypassesScope: false,
  },
];

const FISCAL_YEAR = { year: 2026, referenceYear: 2025 };

/** 2026 no es bisiesto: febrero tiene 28. Festivos segun la cedula de nomina. */
const MONTHS: Array<{ month: Month; days: number; holidays: number }> = [
  { month: Month.jan, days: 31, holidays: 1 },
  { month: Month.feb, days: 28, holidays: 1 },
  { month: Month.mar, days: 31, holidays: 1 },
  { month: Month.apr, days: 30, holidays: 0 },
  { month: Month.may, days: 31, holidays: 1 },
  { month: Month.jun, days: 30, holidays: 0 },
  { month: Month.jul, days: 31, holidays: 0 },
  { month: Month.aug, days: 31, holidays: 0 },
  { month: Month.sep, days: 30, holidays: 1 },
  { month: Month.oct, days: 31, holidays: 0 },
  { month: Month.nov, days: 30, holidays: 1 },
  { month: Month.dec, days: 31, holidays: 1 },
];

// -----------------------------------------------------------------------------

async function main() {
  const company = await prisma.company.upsert({
    where: { code: COMPANY.code },
    update: { legalName: COMPANY.legalName },
    create: COMPANY,
  });

  for (const unit of BUSINESS_UNITS) {
    await prisma.businessUnit.upsert({
      where: { code: unit.code },
      update: { name: unit.name, type: unit.type },
      create: { ...unit, companyId: company.id },
    });
  }

  for (const dept of DEPARTMENTS) {
    await prisma.department.upsert({
      where: { code: dept.code },
      update: { name: dept.name },
      create: dept,
    });
  }

  for (const role of ROLES) {
    await prisma.role.upsert({
      where: { code: role.code },
      update: { name: role.name, description: role.description, bypassesScope: role.bypassesScope },
      create: role,
    });
  }

  const fiscalYear = await prisma.fiscalYear.upsert({
    where: { year: FISCAL_YEAR.year },
    update: { referenceYear: FISCAL_YEAR.referenceYear },
    create: FISCAL_YEAR,
  });

  for (const [i, m] of MONTHS.entries()) {
    await prisma.monthCalendar.upsert({
      where: { fiscalYearId_month: { fiscalYearId: fiscalYear.id, month: m.month } },
      update: { days: m.days, holidays: m.holidays },
      create: { fiscalYearId: fiscalYear.id, monthNumber: i + 1, ...m },
    });
  }

  // --- Personas -------------------------------------------------------------
  const departmentIdByCode = new Map(
    (await prisma.department.findMany({ select: { id: true, code: true } })).map((d) => [d.code, d.id]),
  );
  const roleIdByCode = new Map(
    (await prisma.role.findMany({ select: { id: true, code: true } })).map((r) => [r.code, r.id]),
  );

  const superadmin = await prisma.user.upsert({
    where: { email: SUPERADMIN.email },
    update: { name: SUPERADMIN.name, jobTitle: SUPERADMIN.jobTitle, isSuperadmin: true },
    create: { ...SUPERADMIN, isSuperadmin: true },
  });
  await replaceGrant(superadmin.id, roleIdByCode.get('SUPERADMIN')!, ScopeMode.all, []);

  for (const head of DEPARTMENT_HEADS) {
    const user = await prisma.user.upsert({
      where: { email: head.email },
      update: { name: head.name, jobTitle: head.jobTitle },
      // El departamento de adscripcion es el primero; el acceso real lo da la asignacion
      create: {
        name: head.name,
        email: head.email,
        jobTitle: head.jobTitle,
        departmentId: departmentIdByCode.get(head.departments[0]),
      },
    });

    await replaceGrant(
      user.id,
      roleIdByCode.get('DEPT_HEAD')!,
      ScopeMode.selected,
      head.departments.map((code) => departmentIdByCode.get(code)!),
    );
  }

  await seedCostCenters();
  await seedSystemObjectsAndPermissions();
  await report();
}

/**
 * Deja al usuario con una sola asignacion vigente.
 * Se borra y se vuelve a crear porque la llave unica incluye fiscalYearId, que
 * es nulo, y en PostgreSQL un nulo no colisiona: un upsert duplicaria filas.
 */
async function replaceGrant(userId: number, roleId: number, departmentScope: ScopeMode, departmentIds: number[]) {
  const previous = await prisma.accessGrant.findMany({ where: { userId }, select: { id: true } });
  const ids = previous.map((g) => g.id);
  if (ids.length) {
    await prisma.accessGrantDepartment.deleteMany({ where: { grantId: { in: ids } } });
    await prisma.accessGrant.deleteMany({ where: { id: { in: ids } } });
  }

  const grant = await prisma.accessGrant.create({
    data: {
      userId,
      roleId,
      departmentScope,
      businessUnitScope: ScopeMode.all, // su departamento en TODOS los casinos
      costCenterScope: ScopeMode.all,
    },
  });

  if (departmentIds.length) {
    await prisma.accessGrantDepartment.createMany({
      data: departmentIds.map((departmentId) => ({ grantId: grant.id, departmentId })),
    });
  }
}

/**
 * Un centro de costo por casino. `budget.cost_center_id` es obligatorio, asi que
 * sin esto no se puede dar de alta una hoja.
 */
async function seedCostCenters() {
  const units = await prisma.businessUnit.findMany({ select: { id: true } });
  for (const unit of units) {
    await prisma.costCenter.upsert({
      where: { businessUnitId_code: { businessUnitId: unit.id, code: 'GEN' } },
      update: {},
      create: { businessUnitId: unit.id, code: 'GEN', name: 'General' },
    });
  }
}

// -----------------------------------------------------------------------------
// Objetos del sistema y permisos
// -----------------------------------------------------------------------------

/** Modulo de cada tabla. Lo que no aparezca cae en 'core'. */
const MODULES: Record<string, string[]> = {
  security: ['app_role', 'app_user', 'permission', 'role_permission', 'system_object', 'setting', 'access_log', 'user_context', 'access_grant', 'access_grant_department', 'access_grant_business_unit', 'access_grant_cost_center', 'access_grant_permission'],
  auth: ['auth_user', 'auth_session', 'auth_account', 'auth_verification'],
  catalog: ['company', 'business_unit', 'cost_center', 'department', 'fiscal_year', 'month_calendar', 'gl_account'],
  sheet: ['budget_sheet', 'budget_sheet_note', 'category', 'line_item'],
  budget: ['budget', 'budget_line', 'budget_line_month', 'budget_line_link', 'capture_progress'],
  resource: ['resource', 'resource_value', 'resource_quantity', 'resource_factor', 'resource_recalculation', 'monthly_demand'],
  collab: ['budget_line_assignment', 'comment_thread', 'message', 'attachment'],
  review: ['review_submission', 'review_decision'],
  fiscal: ['monthly_tax', 'monthly_tax_base', 'tax_type', 'monthly_profit_share', 'pos_provider', 'pos_rate', 'pos_fee_line', 'fixed_asset', 'monthly_depreciation', 'machine_royalty', 'table_royalty'],
  control: ['monthly_actual', 'budget_audit_log'],
  metrics: ['metric_definition', 'metric_forecast'],
};

/** Tablas cuyo contenido no es para cualquiera. */
const SENSITIVE = new Set([
  'app_user', 'payroll_benefit', 'monthly_tax', 'monthly_tax_base', 'tax_type',
  'monthly_profit_share', 'permission', 'role_permission', 'system_object',
  'access_grant', 'access_log', 'auth_user', 'auth_session', 'auth_account',
  'auth_verification', 'review_decision',
]);

/** Acciones que aplican a cualquier objeto. */
const BASE_ACTIONS = ['read', 'create', 'update', 'delete', 'export', 'manage'] as const;

/** Acciones propias del ciclo presupuestal. */
const EXTRA_ACTIONS: Record<string, string[]> = {
  budget: ['capture', 'approve', 'reopen'],
  budget_line: ['capture'],
  budget_line_month: ['capture'],
  monthly_actual: ['capture'],
  review_submission: ['approve'],
  review_decision: ['approve'],
  fiscal_year: ['reopen'],
};

/**
 * Lee prisma/schema.prisma y devuelve el nombre fisico de cada tabla.
 * Se lee el schema en vez de una lista escrita a mano para que una tabla nueva
 * quede registrada sola; sin fila en system_object, un objeto queda cerrado.
 */
function tablesFromSchema(): string[] {
  const schema = readFileSync(join(__dirname, 'schema.prisma'), 'utf8');
  return [...schema.matchAll(/^model\s+\w+\s*\{[\s\S]*?@@map\("([a-z_]+)"\)/gm)].map((m) => m[1]);
}

const moduleOf = (table: string) =>
  Object.entries(MODULES).find(([, tables]) => tables.includes(table))?.[0] ?? 'core';

const humanize = (table: string) => table.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

async function seedSystemObjectsAndPermissions() {
  const tables = tablesFromSchema();

  for (const table of tables) {
    await prisma.systemObject.upsert({
      where: { code: table },
      update: { module: moduleOf(table), sensitive: SENSITIVE.has(table) },
      create: {
        code: table,
        name: humanize(table),
        module: moduleOf(table),
        sensitive: SENSITIVE.has(table),
        // Las tablas de auth y las de seguridad no se comentan
        commentable: !['auth', 'security'].includes(moduleOf(table)),
      },
    });
  }

  const objects = await prisma.systemObject.findMany({ select: { id: true, code: true, name: true, module: true } });

  for (const object of objects) {
    const actions = [...BASE_ACTIONS, ...(EXTRA_ACTIONS[object.code] ?? [])];
    for (const action of actions) {
      const code = `${object.code}.${action}`;
      await prisma.permission.upsert({
        where: { code },
        update: {},
        create: { systemObjectId: object.id, action: action as Action, code, description: `${action} ${object.name}` },
      });
    }
  }

  await wireRolePermissions();
}

/**
 * La matriz "Que puede hacer cada rol" del diseno.
 *
 * Ojo: dos restricciones NO se pueden expresar como permiso y se resuelven en el
 * servicio, fila por fila:
 *   - el encargado de casino solo edita lo que NO esta asignado a alguien mas
 *   - el miembro solo edita los renglones que le asignaron
 * El permiso les da la capacidad; budget_line_assignment decide sobre cual fila.
 */
async function wireRolePermissions() {
  const [roles, permissions] = await Promise.all([
    prisma.role.findMany({ select: { id: true, code: true } }),
    prisma.permission.findMany({
      select: { id: true, code: true, action: true, object: { select: { code: true, module: true } } },
    }),
  ]);
  const roleId = (code: string) => roles.find((r) => r.code === code)!.id;

  const grantsFor = (roleCode: string) =>
    permissions.filter((p) => {
      const m = p.object.module;
      const openModule = m !== 'security' && m !== 'auth';

      switch (roleCode) {
        case 'SUPERADMIN':
          return true;

        case 'DEPT_HEAD':
          // Opera lo suyo: captura, comenta, asigna y envia a revision.
          // No administra catalogos ni dictamina.
          return (
            (openModule && ['read', 'create', 'update', 'delete', 'capture', 'export'].includes(p.action)) ||
            (p.object.code === 'review_submission' && ['create', 'approve'].includes(p.action))
          );

        case 'CASINO_HEAD':
          // Ve todo su casino y captura; no asigna ni envia.
          return openModule && ['read', 'export', 'capture'].includes(p.action);

        case 'MEMBER':
          // Solo sus renglones y comentar. El filtro por renglon lo hace el servicio.
          return (
            (openModule && p.action === 'read') ||
            (['budget_line_month', 'budget_line'].includes(p.object.code) && p.action === 'capture') ||
            (['comment_thread', 'message', 'attachment'].includes(p.object.code) && ['create', 'update'].includes(p.action))
          );

        default:
          return false;
      }
    });

  for (const role of roles) {
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    const granted = grantsFor(role.code);
    if (granted.length) {
      await prisma.rolePermission.createMany({
        data: granted.map((p) => ({ roleId: roleId(role.code), permissionId: p.id })),
      });
    }
  }
}

async function report() {
  const [units, departments, users, roles, months, objects, permissions] = await Promise.all([
    prisma.businessUnit.count(),
    prisma.department.count(),
    prisma.user.count(),
    prisma.role.count(),
    prisma.monthCalendar.count(),
    prisma.systemObject.count(),
    prisma.permission.count(),
  ]);
  console.log(
    `Seed lista (${DATA_SOURCE}) · ${units} unidades de negocio · ${departments} departamentos · ` +
      `${users} usuarios · ${roles} roles · ${months} meses del ejercicio ${FISCAL_YEAR.year} · ` +
      `${objects} objetos · ${permissions} permisos`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
