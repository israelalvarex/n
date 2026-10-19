import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BudgetsService } from './budgets.service';
import { ReviewController } from '../review/review.controller';

test('un envío no cierra otro departamento del mismo casino', async () => {
  const prisma = {
    businessUnit: { findMany: async () => [{ id: 1, code: 'CAS', name: 'Casino' }] },
    department: { findMany: async () => [
      { id: 10, code: 'A', name: 'Administración' },
      { id: 20, code: 'B', name: 'Otro departamento' },
    ] },
    budget: { findMany: async () => [{ id: 5, businessUnitId: 1, status: 'inReview', version: 1 }] },
    setting: { findMany: async () => [] },
    budgetLine: { groupBy: async () => [] },
    budgetSheetReview: { findMany: async () => [{ budgetId: 5, departmentId: 10, status: 'inReview' }] },
  };
  const authz = { getUserScope: async () => ({ allBusinessUnits: true, allDepartments: true }) };
  const service = new BudgetsService(prisma as never, authz as never, {} as never);

  const sheets = await service.listSheets(1, 2027);

  assert.equal(sheets.find((s) => s.department.id === 10)?.status, 'inReview');
  assert.equal(sheets.find((s) => s.department.id === 20)?.status, 'draft');
});

test('la vista previa de otro departamento sigue en captura aunque el Budget esté en revisión', async () => {
  const prisma = {
    fiscalYear: { findUnique: async () => ({ year: 2027 }) },
    businessUnit: { findMany: async () => [
      { id: 1, code: 'CAS', name: 'Casino' },
      { id: 2, code: 'NUE', name: 'Casino sin presupuesto abierto' },
    ] },
    budget: { findMany: async () => [{
      id: 5, status: 'inReview', businessUnitId: 1,
    }] },
    budgetSheetReview: { findMany: async () => [] },
    budgetLine: { count: async () => 1 },
    commentThread: { count: async () => 0 },
  };
  const readiness = { listas: async () => new Set(), casinosConPrediccion: async () => new Set([2]) };
  const budgets = { devolucion: async () => null };
  const controller = new ReviewController(prisma as never, budgets as never, readiness as never);

  const preview = await controller.preview(20, 2027);

  assert.equal(preview.units[0]?.status, 'draft');
  assert.equal(preview.units[0]?.pending, true);
  assert.equal(preview.units[1]?.budgetId, null);
  assert.equal(preview.units[1]?.pending, true);
});

test('el envío solo cambia la hoja del departamento elegido', async () => {
  const escritos: { budgetId: number; departmentId: number }[] = [];
  const tx = {
    reviewSubmission: { create: async () => ({ id: 12, submittedUnits: 1 }) },
    budgetSheetReview: { upsert: async (args: { create: { budgetId: number; departmentId: number } }) => {
      escritos.push(args.create);
    } },
  };
  const prisma = {
    reviewSubmission: { findFirst: async () => null },
    $transaction: async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
  };
  const controller = new ReviewController(prisma as never, {} as never, {} as never);
  Object.assign(controller, { preview: async () => ({
    units: [
      { businessUnit: { id: 1, name: 'Casino' }, budgetId: 5, complete: true, pending: false },
      { businessUnit: { id: 2, name: 'Otro casino' }, budgetId: 6, complete: false, pending: false },
    ], incomplete: [],
  }) });

  await controller.submit({ id: 9 } as never, { fiscalYearId: 2027, departmentId: 10 });

  assert.deepEqual(escritos.map(({ budgetId, departmentId }) => ({ budgetId, departmentId })), [{ budgetId: 5, departmentId: 10 }]);
});

test('una hoja devuelta se reenvia sola; una que no fue devuelta no', async () => {
  const escritos: number[] = [];
  const marcadas: number[] = [];
  const tx = {
    reviewSubmission: { create: async () => ({ id: 13, submittedUnits: 1 }) },
    budgetSheetReview: { upsert: async (args: { create: { budgetId: number } }) => {
      escritos.push(args.create.budgetId);
    } },
  };
  const prisma = {
    reviewSubmission: { findFirst: async () => ({ version: 1 }) },
    $transaction: async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
  };
  const readiness = { marcarSinValidar: async (_fy: number, bu: number) => { marcadas.push(bu); } };
  const controller = new ReviewController(prisma as never, {} as never, readiness as never);
  const devolucion = { result: 'changesRequested', comment: 'Corregir abril', decidedAt: new Date(), decidedBy: 'Admin' };
  Object.assign(controller, { preview: async () => ({
    units: [
      // Tras marcarla, la devuelta ya cuenta como lista.
      { businessUnit: { id: 1, name: 'Casino' }, budgetId: 5, complete: marcadas.includes(1), pending: false, returned: devolucion },
      { businessUnit: { id: 2, name: 'Otro casino' }, budgetId: 6, complete: true, pending: false, returned: null },
    ], incomplete: [],
  }) });

  await controller.submit({ id: 9 } as never, { fiscalYearId: 2027, departmentId: 10, businessUnitIds: [1] });
  assert.deepEqual(marcadas, [1]);
  assert.deepEqual(escritos, [5]);

  await assert.rejects(
    controller.submit({ id: 9 } as never, { fiscalYearId: 2027, departmentId: 10, businessUnitIds: [2] }),
    /devolvio/,
  );
});
