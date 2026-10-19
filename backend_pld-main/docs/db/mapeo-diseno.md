# Mapeo: cada tabla contra el diseño

Qué pantalla de `images/` justifica cada una de las 69 tablas de [presupuesto.dbml](presupuesto.dbml).

Leyenda de la columna **Estado**:

| | |
|---|---|
| ✅ | La pantalla la exige tal como está |
| ⚠️ | Existe en el diseño pero con otra forma, o se traslapa con otra tabla |
| ❌ | Ninguna pantalla la usa. Viene del Excel, no del producto |
| 🔧 | Infraestructura: no tiene pantalla propia, pero sostiene a las que sí |
| 🔢 | Sin pantalla, pero el cálculo la exige |

---

## Catálogos base

| Tabla | Dónde aparece en el diseño | Estado |
|---|---|---|
| `empresa` | En ninguna pantalla; el producto solo habla de "7 casinos" | 🔧 |
| `unidad_negocio` | Selector de casino, "Guadalupe · 1 de 7 casinos", buscador (sección CASINOS) | ✅ |
| `centro_costo` | **No aparece.** La unidad de trabajo del producto es departamento × casino | ❌ |
| `departamento` | Sidebar, "14 departamentos", tabla *Departamentos y encargados* | ✅ |
| `usuario` | *Personas y roles*: 41 personas con correo, rol y alcance. Es el perfil de negocio; las credenciales viven en `auth_account` | ✅ |
| `ejercicio` | "Presupuesto 2026 · V2", "Cierre 28 nov · 6d 04h", modal *Abrir el año 2027* | ✅ |
| `calendario_mes` | Fila `DÍAS DEL MES · 31 28 31 30 … 365` de toda hoja | ✅ |

## Estructura de las hojas

| Tabla | Dónde aparece en el diseño | Estado |
|---|---|---|
| `cedula` | El encabezado "RH · Gente y Cultura" y el modal de guía. Parece 1:1 con `departamento`, pero **AyB ya lleva dos hojas** (Ingresos y MP AyB), y solo la cédula tiene naturaleza contable y aplicabilidad por tipo de UDN | ✅ |
| `cedula_nota` | Modal de guía: bloques *Consideraciones*, *Para cálculo*, *Frecuencias disponibles*, botón "Editar guía" | ✅ |
| `categoria` | Bandas `PREVISIÓN SOCIAL`, `RECLUTAMIENTO Y SELECCIÓN`, `CAPACITACIÓN Y DESARROLLO` con su renglón *Subtotal* y el "+ renglón" | ✅ |
| `concepto` | El nombre del renglón. Pero el botón "Agregar renglón" sugiere renglones libres, y hoy `concepto` es catálogo maestro con clave única | ⚠️ |

## Recursos

| Tabla | Dónde aparece en el diseño | Estado |
|---|---|---|
| `recurso` | Pantalla *Cortesías e insumos* y menú Recursos con sus tipos (Parámetros del año, Tabulador de puestos) | ✅ |
| `recurso_valor` | Columnas `PRECIO 24 / 25 / 26 / 27`, con 2027 punteado por ser proyección | ✅ |
| `recurso_cantidad` | Columna `CONSUMO/DÍA` y el panel "Este recurso también se usa en: Esmeralda 620, Guadalupe 410…" | ✅ |
| `demanda_mes` | Sin pantalla. Es el DAU por casino y mes, driver de la proyección de AyB | 🔢 |
| `recurso_factor` | Sin pantalla. Los factores del cálculo: % de conversión, vasos por cliente, rendimiento del bag in box | 🔢 |
| `recurso_recalculo` | "Cambiar un precio recalcula todos los presupuestos que consumen ese recurso y avisa a sus encargados" | ✅ |
| `cuenta_contable` | Columna `CUENTA`: 6310-004, 6010-001, 6020-003 | ✅ |

## Núcleo

| Tabla | Dónde aparece en el diseño | Estado |
|---|---|---|
| `presupuesto` | La hoja de un casino. **Le falta el departamento**: hoy es (ejercicio + casino + CC + escenario), y el producto trabaja por departamento × casino | ⚠️ |
| `presupuesto_partida` | El renglón con su recurso, cantidad y memoria de cálculo (Container-1) | ✅ |
| `partida_mes` | Las 12 celdas y sus badges `f` / `M` / `▲ Override` / `✎` | ✅ |
| `partida_enlace` | "Comida de empleados · ligado a la venta de AyB" | ✅ |

## Colaboración y ciclo de revisión

| Tabla | Dónde aparece en el diseño | Estado |
|---|---|---|
| `partida_asignacion` | Botón "Asignar personas", pantalla *Mis renglones*, filas grises "de otra persona", "Marcar como terminado" | ✅ |
| `conversacion` | Hilo anclado a celda, marca **Bloqueante**, botón Resolver, contador del sidebar | ✅ |
| `mensaje` | Los turnos del hilo: "Fulana · hace 2h", "Fulano · hace 40m" | ✅ |
| `avance_captura` | "34 de 42 renglones", barras de avance, estados *Sin capturar / En captura / Completo*. **Llave única mal puesta**: hoy es por presupuesto, debe ser por departamento × casino | ⚠️ |
| `envio_revision` | "Enviar a revisión", etiquetas V1/V2, modal "Enviar 5 casinos · Recordar a los 2" | ✅ |
| `dictamen` | "Aprobar y congelar", "Pedir cambios", "Rechazar", aplicado casino por casino | ✅ |

## Cédulas heredadas del Excel

Estas nacieron del libro, no del producto. Se dividen en dos grupos.

### Colapsables: el diseño ya las cubre con recurso + cantidad

| Tabla | Cómo lo resuelve el diseño | Estado |
|---|---|---|
| `nomina_prestacion` | Sería un renglón más, con su recurso y su cantidad | ❌ |
| `evento_integracion` | Ya es un renglón: "Eventos de integración · x Evento · Ptto x pax · 213 pax" | ❌ |
| `viaje_presupuestado` | Renglón con recurso "Visita a MTY" (tarifa) y cantidad = pax | ❌ |
| `licencia` · `licencia_partida` | Cada licencia es un recurso tipo tarifa con su precio por año | ⚠️ |
| `ingreso_mes` | Es del encargado de AyB, pero **Ingresos no está entre los 14 departamentos** ni tiene pantalla | ⚠️ |

### Sobreviven: su cálculo no es cantidad × precio, o alimentan al que lo es

| Tabla | Por qué se queda |
|---|---|
| `regalia_maquina` · `regalia_mesa` | Se calcula sobre % de netwin generado, no sobre un precio unitario |
| `proveedor_tpv` · `tasa_tpv` · `comision_tpv_partida` | Comisión sobre un % de las ventas, con tasas negociadas por proveedor |
| `activo_fijo` · `depreciacion_mes` | Compra puntual más su curva de depreciación |
| `base_fiscal_mes` · `tipo_impuesto` · `impuesto_mes` · `participacion_mes` | Bases fiscales y tasas de ley |
| `mp_insumo_bloque` · `mp_insumo_bloque_mes` · `mp_resumen_mes` | % de MP óptimo aplicado a bloques de ingreso |
| `demanda_mes` · `recurso_factor` | Proyección de cigarros y refresco por afluencia, en vez de consumo fijo |
| `historico_insumo` | De aquí sale el % de conversión DAU → cajetillas del año de referencia |
| `historico_mensual_udn` | Base de la regla de crecimiento mínimo del 10% y del benchmark de MP |

Ninguna tiene pantalla en el mockup. Si el diseño las va a tratar como renglones
normales, se colapsan; si conservan su lógica, necesitan su propia vista. El DAU
es el caso más urgente: hoy no hay dónde capturarlo.

## Control

| Tabla | Dónde aparece en el diseño | Estado |
|---|---|---|
| `ejercido_mes` | Menú *Ejecución* y el renglón gris "2025 · ejercido" del comparativo | ✅ |
| `bitacora_presupuesto` | Menú *Historial*. Cubre acciones, **no** el historial de valor por celda | ⚠️ |

## Autenticación (Better Auth)

Ninguna aparece en el mockup: no hay pantalla de login ni de sesiones. Las genera
y las migra la librería (`npx @better-auth/cli generate`); aquí solo se dibujan
para que el diagrama muestre por dónde entra la gente.

| Tabla | Dónde aparece en el diseño | Estado |
|---|---|---|
| `auth_user` | Identidad de acceso. Se enlaza con `usuario.auth_user_id` | 🔧 |
| `auth_session` | Sesión real. No confundir con `usuario_contexto`, que solo recuerda el casino | 🔧 |
| `auth_account` | Credenciales y proveedores externos. Aquí vive el hash de la contraseña | 🔧 |
| `auth_verification` | Tokens de verificación de correo y recuperación de contraseña | 🔧 |

El reparto: **Better Auth resuelve quién eres; este esquema, qué puedes tocar.**
El plugin de organizaciones de la librería trae roles propios, pero son planos
(owner / admin / member) y se declaran en código: no alcanzan para
departamento × casino × campo.

## Seguridad

| Tabla | Dónde aparece en el diseño | Estado |
|---|---|---|
| `rol` | Las cuatro tarjetas: Superadmin, Encargado de departamento, Encargado de casino, Miembro | ✅ |
| `permiso` | Matriz *Qué puede hacer cada rol* y el panel *Qué puedes cambiar aquí* (permiso por campo) | ✅ |
| `rol_permiso` | Los "sí / —" de la matriz | ✅ |
| `asignacion` + `asignacion_departamento` / `_unidad` / `_centro_costo` | Columna ALCANCE: "Renta y servicios · Limpieza y mtto", "Esmeralda", "Plataforma completa" | ✅ |
| `usuario_contexto` | El selector recuerda en qué casino te quedaste | ✅ |
| `regla` | Menú *Reglas (4)* y los badges *Sin reglas / 1 regla / 2 reglas* de la cola de revisión | ✅ |
| `variable` | **Se traslapa con `recurso` tipo parámetro.** En el diseño hay una sola pantalla, *Parámetros del año* | ⚠️ |
| `objeto_sistema` | Sin pantalla: es el catálogo que hace posibles permisos y reglas sobre cualquier tabla | 🔧 |
| `asignacion_permiso` | Sin pantalla: excepción puntual sobre lo que da el rol | 🔧 |
| `bitacora_acceso` | Sin pantalla: evidencia de intentos denegados | 🔧 |

---

## Resumen

| | Tablas |
|---|---|
| ✅ Exigidas por el diseño | 31 |
| 🔢 Sin pantalla, pero el cálculo la exige | 18 |
| ⚠️ Con traslape o forma distinta | 8 |
| 🔧 Infraestructura (incluye las 4 de Better Auth) | 8 |
| ❌ Sin uso en el producto | 4 |
| **Total** | **69** |

### Los dos traslapes que conviene resolver

1. **`variable` vs `recurso` tipo parámetro** — las dos guardan "el valor de algo por año". El diseño tiene una sola pantalla. Fusionar en `recurso`.
2. **`concepto` como catálogo maestro vs "Agregar renglón"** — si el usuario inventa renglones libremente, el catálogo estorba más de lo que ayuda.

**Resuelto:** `cedula` vs `departamento` no es traslape. Se ven 1:1 por el
organigrama actual, pero cambian por motivos distintos —uno con la gente, otro
con la estructura contable— y AyB ya rompe el 1:1 con sus dos hojas.

### Lo que falta y no tiene tabla

- Pantalla del DAU por casino y mes: `demanda_mes` no tiene dónde capturarse
- Notificaciones (el "avisa a sus encargados")
- Historial de valor por celda (quién cambió qué y cuándo)
- Consolidado (vista sobre lo existente)
- Compra real de insumos: fecha, precio y proveedor. Decisión pendiente, depende
  de si se captura a mano o se jala de un sistema de compras

### Decisiones abiertas

- **`empresa`**: se queda solo si los 7 casinos son varias sociedades, porque el
  módulo de Impuestos necesitará agrupar declaraciones por RFC. Si es una sola,
  se borra. Hoy `razon_social` está `NOT NULL` sin que nadie lo llene.
- **`hoja` = presupuesto × departamento**: es la unidad real de trabajo del
  producto y hoy no existe como tabla; por eso `avance_captura` quedó con la
  llave mal puesta.
