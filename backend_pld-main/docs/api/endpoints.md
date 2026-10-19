# Endpoints derivados del diseño

Cada endpoint sale de una pantalla concreta de `images/`. La columna **Permiso**
usa las claves de la tabla `permission` (`objeto.acción`).

## Reglas que aplican a todo

1. **Todo listado pasa por `scopeFilter`.** `AuthorizationService.getUserScope()`
   devuelve departamentos y casinos alcanzables; ninguna consulta se hace sin
   ese filtro. Un alcance abierto (`allBusinessUnits`) **no** agrega condición.
2. **404 en vez de 403** cuando el recurso existe pero está fuera del alcance.
   Un 403 confirma que el dato existe: eso ya filtra información.
3. **La unidad de trabajo es departamento × casino.** Casi todo cuelga de ahí.
4. **Todo intento denegado se registra** en `access_log`.

> **Pendiente de esquema:** el producto direcciona "hoja" (departamento × casino)
> pero `budget` solo llega a casino. Mientras no exista la tabla `sheet`, la ruta
> `/sheets/...` se resuelve por la tripleta ejercicio + casino + departamento.

---

## 1. Contexto y navegación

Del selector de casino y del buscador `⌘K`.

| Método | Ruta | Qué hace | Permiso |
|---|---|---|---|
| `GET` | `/me` | Perfil, roles, alcance y permisos efectivos. **Lo primero que pide el front** | — |
| `GET` | `/me/context` | Casino y ejercicio en los que quedó | — |
| `PUT` | `/me/context` | Cambiar de casino. Revalida contra `access_grant`, no confía en el cliente | — |
| `GET` | `/me/sheets` | Sus hojas con avance y estado. Alimenta el sidebar | — |
| `GET` | `/search?q=` | Buscador: departamentos, casinos y personas ya filtrados por alcance | — |

`GET /me` es el endpoint más importante del sistema: de él sale qué pinta la UI.

## 2. Catálogos

| Método | Ruta | Qué hace | Permiso |
|---|---|---|---|
| `GET` | `/business-units` | Casinos visibles | `business_unit.read` |
| `GET` | `/departments` | Departamentos visibles | `department.read` |
| `GET` | `/fiscal-years` | Ejercicios y su estado de cierre | `fiscal_year.read` |
| `GET` | `/fiscal-years/:year/calendar` | Días y festivos por mes | `fiscal_year.read` |
| `GET` | `/gl-accounts` | Cuentas contables | `gl_account.read` |
| `POST` `PATCH` | `/gl-accounts` | Alta y edición | `gl_account.manage` |

## 3. La hoja de presupuesto

La pantalla principal.

| Método | Ruta | Qué hace | Permiso |
|---|---|---|---|
| `GET` | `/sheets` | Todas las hojas del alcance, con avance. Vista *Por casino* | `budget.read` |
| `GET` | `/sheets/:id` | Hoja completa: categorías, renglones, 12 meses, subtotales y días del mes | `budget.read` |
| `GET` | `/sheets/:id?compare=2025` | Agrega el renglón gris de ejercido y la variación | `budget.read` |
| `GET` | `/sheets/:id/guide` | Consideraciones, criterios y frecuencias disponibles | `budget_sheet.read` |
| `PUT` | `/sheets/:id/guide` | "Editar guía" | `budget_sheet_note.manage` |
| `GET` | `/sheets/:id/export` | Exportar a Excel | `budget.export` |

El `GET /sheets/:id` devuelve **todo lo que la pantalla necesita en una sola
llamada** — incluidos días del mes y contadores de conversaciones. Doce llamadas
por renglón harían la tabla inusable.

## 4. Renglones y celdas

| Método | Ruta | Qué hace | Permiso |
|---|---|---|---|
| `POST` | `/sheets/:id/lines` | "Agregar renglón" | `budget_line.create` |
| `PATCH` | `/lines/:id` | Cambiar cantidad, recurso o frecuencia. **Dispara recálculo de los 12 meses** | `budget_line.update` |
| `DELETE` | `/lines/:id` | Quitar renglón | `budget_line.delete` |
| `GET` | `/lines/:id/origin` | Panel *Origen del renglón*: memoria de cálculo, precio, cantidad, qué puede cambiar el usuario y en qué otros casinos se usa | `budget_line.read` |
| `PUT` | `/lines/:id/months/:month` | Override manual. **Exige motivo**; conserva `calculated_amount` | `budget_line_month.capture` |
| `DELETE` | `/lines/:id/months/:month/override` | Volver al valor calculado | `budget_line_month.capture` |
| `POST` | `/lines/:id/recalculate` | Forzar recálculo | `budget_line.update` |

`GET /lines/:id/origin` es el que hace posible el "qué puedes cambiar aquí": por
cada campo devuelve si el usuario lo puede editar, resolviendo `permission.field`
—cantidad la edita el casino, precio solo el encargado dueño, cuenta contable
solo el superadmin.

## 5. Recursos

| Método | Ruta | Qué hace | Permiso |
|---|---|---|---|
| `GET` | `/resources?type=` | Catálogo por tipo: parámetros, insumos, tabulador, tarifas | `resource.read` |
| `POST` | `/resources` | "Agregar recurso" / "Nuevo parámetro" | `resource.create` |
| `PATCH` | `/resources/:id` | Nombre, unidad, cuenta contable | `resource.update` |
| `GET` | `/resources/:id/values` | Precios por año, con la marca de proyección | `resource_value.read` |
| `PUT` | `/resources/:id/values/:year` | **Fija el precio del año. Recalcula todos los presupuestos que lo consumen y notifica a sus encargados** | `resource_value.update` |
| `GET` | `/resources/:id/quantities` | Consumo por casino: "Esmeralda 620, Guadalupe 410…" | `resource_quantity.read` |
| `PUT` | `/resources/:id/quantities/:businessUnitId` | Consumo de un casino. Solo afecta a ese | `resource_quantity.update` |
| `GET` | `/resources/:id/usage` | Qué renglones lo consumen, antes de cambiarle el precio | `resource.read` |
| `GET` | `/pay-scale` | Tabulador: puesto × relación × categoría, con plazas | `resource.read` |
| `PUT` | `/pay-scale/:code` | Sueldo, bono y plazas de un puesto | `resource_value.update` |
| `GET` | `/demand?businessUnitId=&year=` | DAU por mes. Driver de la proyección de AyB | `monthly_demand.read` |
| `PUT` | `/demand/:businessUnitId/:month` | Capturar DAU. **Hoy no tiene pantalla en el mockup** | `monthly_demand.update` |

El `PUT` de precio es el más delicado del sistema: toca los 7 casinos a la vez.
Debe responder **cuántos renglones va a mover antes de confirmar**, y dejar
rastro en `resource_recalculation`.

## 6. Ciclo del ejercicio

| Método | Ruta | Qué hace | Permiso |
|---|---|---|---|
| `GET` | `/fiscal-years/:year/opening-preview` | Modal *Abrir el año*: cuántos parámetros, puestos e insumos hay que confirmar | `fiscal_year.manage` |
| `POST` | `/fiscal-years/:year/open` | "Copiar 2026 y abrir". Copia valores marcados como proyección | `fiscal_year.manage` |
| `POST` | `/resources/values/:year/confirm` | Confirmar proyecciones en bloque | `resource_value.update` |
| `POST` | `/fiscal-years/:year/close` | Cerrar: los precios quedan fijos | `fiscal_year.manage` |

## 7. Asignación de renglones

| Método | Ruta | Qué hace | Permiso |
|---|---|---|---|
| `GET` | `/sheets/:id/assignments` | Quién lleva cada renglón | `budget_line_assignment.read` |
| `POST` | `/sheets/:id/assignments` | "Asignar personas" | `budget_line_assignment.create` |
| `DELETE` | `/assignments/:id` | Quitar asignación | `budget_line_assignment.delete` |
| `GET` | `/me/lines` | *Mis renglones*. Devuelve también los ajenos, marcados como no editables | — |
| `POST` | `/assignments/:id/finish` | "Marcar como terminado" | `budget_line_assignment.update` |

`GET /me/lines` devuelve los renglones ajenos **a propósito**: el miembro los ve
en gris y puede comentarlos. Filtrarlos rompería la pantalla.

## 8. Conversaciones

| Método | Ruta | Qué hace | Permiso |
|---|---|---|---|
| `GET` | `/threads?objeto=&registro=&campo=` | Hilos de un registro o celda | `comment_thread.read` |
| `GET` | `/sheets/:id/threads` | Todos los de la hoja, para pintar los indicadores de una vez | `comment_thread.read` |
| `POST` | `/threads` | Abrir hilo, con marca de bloqueante | `comment_thread.create` |
| `POST` | `/threads/:id/messages` | Responder | `message.create` |
| `PATCH` | `/threads/:id/resolve` | "Resolver" | `comment_thread.update` |
| `PATCH` | `/messages/:id` | Editar | `message.update` |
| `DELETE` | `/messages/:id` | Borrado lógico | `message.delete` |
| `POST` | `/messages/:id/attachments` | Pide URL prefirmada; la fila nace `pending` | `attachment.create` |
| `POST` | `/attachments/:id/confirm` | Confirmar subida → `available` | `attachment.create` |
| `GET` | `/attachments/:id/url` | URL de descarga temporal | `attachment.read` |

**Comentar no requiere permiso de edición**: cualquiera que alcance el registro
puede abrir un hilo. Es lo que permite al miembro de casino discutir un renglón
que no le toca.

## 9. Revisión y dictamen

| Método | Ruta | Qué hace | Permiso |
|---|---|---|---|
| `GET` | `/departments/:id/submission-preview` | Modal de envío: renglones capturados, total, conversaciones abiertas y qué casinos van incompletos | `budget.read` |
| `POST` | `/submissions` | "Enviar a revisión". Permite enviar solo los completos | `budget.approve` |
| `POST` | `/submissions/:id/remind` | "Recordar a los 2" | `budget.approve` |
| `GET` | `/reviews/queue` | Cola *En revisión*: por departamento, con días de espera y reglas incumplidas | `budget.approve` |
| `GET` | `/reviews/:submissionId` | Detalle con sus hojas y conversaciones | `budget.approve` |
| `POST` | `/reviews/:submissionId/units/:businessUnitId/decide` | Aprobar y congelar · Pedir cambios · Rechazar. **Casino por casino** | `budget.approve` |
| `POST` | `/sheets/:id/reopen` | Reabrir una hoja congelada | `budget.reopen` |

El envío es **por departamento** (abarca sus casinos) pero el dictamen es **por
casino**. Esa asimetría está en el mockup y el modelo la respeta.

## 10. Personas y roles

| Método | Ruta | Qué hace | Permiso |
|---|---|---|---|
| `GET` | `/people` | Personas con rol y alcance | `app_user.read` |
| `POST` | `/people/invite` | "Invitar persona". Crea `User` y dispara Better Auth | `app_user.create` |
| `PATCH` | `/people/:id` | Nombre, puesto, departamento, activo | `app_user.update` |
| `GET` | `/roles` | Roles y su matriz de capacidades | `app_role.read` |
| `PUT` | `/roles/:id/permissions` | Editar la matriz | `role_permission.manage` |
| `GET` | `/people/:id/grants` | Sus asignaciones | `access_grant.read` |
| `PUT` | `/people/:id/grants` | Reemplazar alcance: departamentos y casinos | `access_grant.manage` |
| `POST` | `/people/:id/grants/:grantId/exceptions` | Excepción puntual sobre el rol | `access_grant_permission.manage` |

## 11. Reglas, consolidado, ejecución e historial

| Método | Ruta | Qué hace | Permiso |
|---|---|---|---|
| `GET` `POST` `PATCH` `DELETE` | `/rules` | Menú *Reglas* | `business_rule.manage` |
| `POST` | `/sheets/:id/validate` | Evalúa las reglas. Alimenta los badges *Sin reglas / 2 reglas* | `budget.read` |
| `GET` | `/consolidated?year=` | Consolidado por casino y departamento | `budget.export` |
| `GET` | `/execution?year=&month=` | Ejercido contra presupuesto | `monthly_actual.read` |
| `POST` | `/execution` | Registrar ejercido. **Exige referencia de OC** | `monthly_actual.capture` |
| `GET` | `/history?sheetId=` | Menú *Historial* | `budget_audit_log.read` |

---

## Orden sugerido para construirlos

1. `GET /me` — sin él no se pinta nada
2. Catálogos y `/me/context` — el selector de casino
3. `GET /sheets/:id` — la pantalla principal
4. Recursos y sus valores — sin ellos los renglones no calculan
5. `PATCH /lines/:id` y el override — la captura
6. Conversaciones
7. Asignaciones
8. Revisión y dictamen
9. Consolidado, ejecución e historial

## Lo que falta en la base antes de empezar

- **`system_object` y `permission` sin sembrar.** Todos los permisos de este
  documento existen solo en papel; hoy `getUserPermissions` devuelve vacío para
  cualquiera que no sea superadmin.
- **`cost_center` vacío**, y `budget.cost_center_id` es obligatorio.
- **No hay tabla `sheet`** (departamento × casino), que es lo que casi todas
  estas rutas direccionan.
