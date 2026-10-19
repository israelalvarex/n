# CONTEXT.md — Plataforma de Presupuestos Foliatti

> Este documento es el contexto de arranque para Claude Code (o cualquier
> desarrollador nuevo) al entrar a este repositorio. Léelo antes de tocar
> código: explica **qué estamos construyendo**, **por qué la arquitectura
> se decidió así**, y **qué hacer primero al escanear lo que ya existe**.

---

## 1. Qué es esto

Estamos construyendo una plataforma que automatiza la elaboración de
presupuestos anuales para **Foliatti**, un grupo de casinos (unidades como
Mitras, Guadalupe/Sendero, Escobedo, Irapuato, Esmeralda, más una unidad
Online). Hoy el proceso es manual: cada área (ingresos, máquinas,
marketing, mantenimiento, alimentos y bebidas, online) tiene su propio
Excel gigante, con fórmulas y criterios que solo el dueño del archivo
entiende de memoria.

El objetivo es que el sistema:

- Genere una **primera propuesta de presupuesto por default** (usando
  históricos + reglas/forecast), que cada responsable de área solo tenga
  que ajustar — no partir de cero.
- Maneje **roles y permisos por área/departamento**.
- Soporte **versiones** del presupuesto (v1, v2, v3...) y estado del ciclo
  (pendiente / capturado / enviado).
- Permita ver **metas diarias**, no solo mensuales (la estacionalidad por
  día de la semana, quincena, días de pago a jubilados, etc. importa
  mucho — viene de los históricos).
- Tenga **notas/comentarios** por celda o por mes, para justificar
  desviaciones (hoy en Excel eso se pierde y "hay que leerle la mente" a
  quien lo hizo).
- Ofrezca **rangos/escenarios** (bajo, medio, alto) con un nivel de
  confianza aproximado (~95%, buscando afinarlo con más variables).

Los leads del lado del cliente son **Paola** (finanzas) y **Andrés**
(director de operaciones). El trabajo se está haciendo levantando
requerimientos por área en reuniones (ingresos/máquinas, marketing,
mantenimiento, A&B, online) antes de automatizar cada una.

---

## 2. La restricción que cambia todo: 3 semanas o menos

Bajo condiciones normales, este proyecto se abordaría con **DDD +
monolito modular** (agregados, value objects, domain events, repositorios
abstractos, capas de dominio puras separadas de infraestructura). Es el
enfoque que normalmente uso y en el que tengo más experiencia (NestJS +
DDD).

**Pero con 3 semanas de plazo, ese nivel de ceremonia no se paga.** DDD
táctico es una inversión que rinde en mantenibilidad a largo plazo, no en
la primera semana. Por eso la decisión fue:

### Qué SÍ nos quedamos de DDD (nivel estratégico)

- La **separación por bounded contexts**, que aquí coincide casi 1:1 con
  las áreas ya mapeadas en las juntas con el cliente:
  `ingresos`, `maquinas`, `marketing`, `mantenimiento`, `ayb`, `online`.
  Eso define los límites de módulos/carpetas.

### Qué NOS QUITAMOS (para ganar velocidad)

- Agregados y value objects tipados por todos lados.
- Repositorios abstractos "por si algún día cambiamos de ORM" — no vamos
  a cambiar de ORM en 3 semanas, así que se usa Prisma directo en los
  servicios de aplicación.
- Domain events / event sourcing.
- CQRS formal.

En otras palabras: **DDD estratégico sí, DDD táctico no** — por ahora.
Nada impide refactorizar hacia patrones tácticos más adelante si el
proyecto crece; la estructura por bounded context ya deja esa puerta
abierta sin que duela migrar después.

---

## 3. Arquitectura elegida: monolito modular pragmático + servicio satélite de forecasting

No es microservicios (no hay tiempo para operar colas, service mesh,
etc.), pero tampoco es un monolito monolítico sin estructura. Son
**dos piezas**:

```
apps/
  api/                     # NestJS + GraphQL + Prisma + Postgres
    modules/
      ingresos/
      maquinas/
      marketing/
      mantenimiento/
      ayb/
      online/
      shared/              # roles, auth, versionado de presupuesto, notas
  forecasting-service/      # Python — pipeline ya existente, expuesto aparte
```

1. **Motor de negocio (Node/NestJS + GraphQL + Prisma + Postgres):**
   CRUD, roles/permisos, versiones, estado del ciclo, notas por celda, UI
   de captura por departamento. Este es el patrón que ya se usa en otros
   proyectos del equipo (Next.js + Apollo + NestJS/GraphQL + Prisma) —
   reutilizar ese boilerplate en vez de inventar de cero.

2. **Servicio de forecasting (Python):** reutiliza el pipeline ya
   construido (Polars + XGBoost + Monte Carlo, con clases
   `MonteCarloSimulation`, `TrainingModels`, `DataPipeline` /
   `DatasetConfig` / `CalendarFeatures` para estacionalidad mexicana). No
   se migra a Node bajo presión de tiempo. Se expone como microservicio
   delgado (FastAPI) o incluso como job batch que deja resultados
   precalculados en una tabla de Postgres que el motor de negocio
   simplemente lee. Comunicación por HTTP simple o por base de datos
   compartida — nada de colas ni event bus.

### Patrón clave para las "familias de gasto": calculadora enchufable

Cada área tiene reglas de cálculo distintas pero la misma forma de fondo:
histórico + factores → propuesta. En vez de código específico por área
desde cero, usar patrón estrategia:

```typescript
interface BudgetCalculator {
  familia: string;
  calcular(input: HistoricoInput, factores: FactorConfig): PropuestaPresupuesto;
}
```

Cada área implementa su propia calculadora. Esto permite meter primero
las áreas más complejas (ingresos y máquinas) y dejar las más simples
(marketing, mantenimiento) para después, sin tocar el core.

---

## 4. Reglas de negocio capturadas por área (de las juntas con el cliente)

- **Ingresos / Máquinas:** parte del real del año anterior, aplica
  factores de crecimiento (algunos fijados por dirección, otros varían
  por mes), distribuye la meta mensual en metas diarias según
  estacionalidad histórica (día de semana + ajuste por quincena y día
  post-quincena). Para máquinas: ventas, devoluciones y premios
  normalizados por volatilidad; regalías a terceros calculadas como % del
  NetWin, separando máquinas propias / rentadas / de operadora integral.
  Fuente de datos: sistema **Turul** (con huecos históricos según casino
  y año — no todos los años tienen las mismas columnas).
- **Marketing:** presupuesto asignado por finanzas como % del ingreso
  proyectado, distribuido por **campañas** (San Valentín, Mes Foliatti,
  aniversario, Navidad, etc.) más programas nacionales fijos (Cliente
  Nuevo, etc.). Mejora pedida: pasar de presupuestar por mes a
  presupuestar por campaña con desglose de conceptos dentro.
- **Mantenimiento:** separa gasto fijo (pólizas, limpieza) de gasto
  variable/discrecional (mantenimiento general, sobre el que el
  responsable de área "puede jugar"). Emergencias se manejan como
  "aditivas presupuestales" fuera del presupuesto regular, no como parte
  de las cuentas normales (para no ensuciar el histórico de la cuenta
  mayor en Turul).
- **Alimentos y Bebidas (A&B):** depende de DAOs (gasto por
  jugador/cortesías del programa de lealtad) + nómina + materia prima
  (cigarros y refrescos como categorías especiales de compra). El gasto
  de cortesías en sala se refleja como ingreso dentro de A&B (el
  restaurante "vende" lo que el cliente redime con puntos).
- **Online:** Excel separado desde el origen del negocio (2022+),
  basado en clientes activos, depósitos/retiros, con fórmulas de
  crecimiento ancladas en registros. Se usa como "laboratorio" para
  probar variables (DAOs, tiempo en plataforma) que luego se replicarían
  en el físico. Objetivo explícito del cliente: unificar metodología
  entre online y físico (mismas familias de gasto: marketing,
  licenciamiento, etc.), no tratarlos como universos separados.

---

## 5. Prioridad de 3 semanas

1. **Semana 1:** Ingresos + Máquinas (la lógica más compleja).
   Validar con **tests de regresión (golden-master)** contra los Excels
   reales que el cliente ya compartió — mismo input debe producir el
   mismo output que su Excel.
2. **Semana 2:** Marketing (campañas) + Mantenimiento (fijo vs. variable)
   + roles/permisos + versionado de presupuesto.
3. **Semana 3:** A&B + Online + pulido de UI (metas diarias, notas,
   comparativos año contra año) + integración con el servicio de
   forecasting en Python.

---

## 6. Qué necesito que hagas al escanear este repo (para Claude Code)

Este repo ya tiene trabajo hecho por un compañero de equipo, previo a
esta conversación de arquitectura. Antes de escribir código nuevo:

1. **Audita lo existente.** Identifica qué patrones de arquitectura sigue
   ya el código (¿hay capas de dominio separadas? ¿usa Prisma directo o
   repositorios abstractos? ¿ya hay módulos por área?).
2. **Evalúa el gap contra este documento.** Dime en qué se parece o
   difiere del enfoque de monolito modular pragmático descrito arriba, y
   qué tan fácil (o costoso) sería acoplarlo sin reescribir todo.
3. **Propón el punto de integración.** Especialmente para:
   - Cómo encaja lo ya hecho con la estructura de módulos por
     `bounded context` (`ingresos`, `maquinas`, `marketing`,
     `mantenimiento`, `ayb`, `online`, `shared`).
   - Si el pipeline de Python (forecasting) ya está referenciado o
     integrado de alguna forma, o si hay que conectarlo desde cero.
   - Si el esquema de datos (Prisma/SQL) ya modela algo de roles,
     versiones de presupuesto, o histórico — y si es compatible con lo
     que se necesita.
4. **No asumas que hay que tirar el trabajo existente.** El objetivo es
   acoplar, no reescribir, salvo que el gap sea tan grande que no valga
   la pena — en ese caso, dilo explícitamente con la razón.
