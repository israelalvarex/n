# Cómo probar el flujo

## Puesta a punto

```bash
pnpm install
cp prisma/seed-data.example.json prisma/seed-data.json   # opcional: datos reales
npx prisma generate          # sin esto, @prisma/client es un cascarón
npx prisma db push           # crea/actualiza las tablas
npx prisma db seed           # catálogos, personas, roles y permisos
```

La seed dice de qué archivo leyó los datos:

```
Seed lista (seed-data.json) · 10 unidades de negocio · 14 departamentos ·
10 usuarios · 4 roles · 12 meses del ejercicio 2026 · 72 objetos · 441 permisos
```

## Crear una cuenta de acceso

El registro público está **deshabilitado a propósito** (`disableSignUp: true`):
al sistema se entra por invitación. Una cuenta con acceso completo necesita
**tres piezas**, no dos — la tercera es fácil de olvidar y sin ella el login
funciona pero `/me` devuelve permisos vacíos:

1. **Perfil de negocio** en `app_user` (nombre, correo, `isSuperadmin` si aplica)
2. **Credencial de acceso** en Better Auth (`auth_user` + `auth_account`), vía el plugin admin
3. **`AccessGrant`** enlazando ese usuario a un rol — `isSuperadmin: true` por sí solo
   **no autoriza nada**; sin un `AccessGrant` apuntando a `SUPERADMIN` (o al rol que
   corresponda), `getUserPermissions` devuelve `[]`.

La seed (`prisma/seed.ts`) ya hace los tres pasos para los encargados iniciales.
Para dar de alta a alguien más (tú mismo, un compañero), este script cubre los tres
de una vez — ajusta `EMAIL`, `NAME` y `PASSWORD` y córrelo con
`npx tsx --env-file=.env crear-cuenta.ts`:

```ts
// crear-cuenta.ts
import 'dotenv/config';
import { PrismaClient } from './generated/prisma/client';
import { ScopeMode } from './generated/prisma/enums';
import { PrismaPg } from '@prisma/adapter-pg';
import { auth } from './src/auth/auth';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const EMAIL = 'tu-correo@ejemplo.com';
const NAME = 'Tu Nombre';
const PASSWORD = 'CambiaEstoLuego123!'; // cambiala despues del primer login
const ROLE_CODE = 'SUPERADMIN'; // o 'DEPT_HEAD', 'CASINO_HEAD', 'MEMBER'

(async () => {
  // 1. Perfil de negocio
  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    update: { isSuperadmin: ROLE_CODE === 'SUPERADMIN' },
    create: { email: EMAIL, name: NAME, isSuperadmin: ROLE_CODE === 'SUPERADMIN' },
  });

  // 2. Credencial de acceso
  try {
    await (auth.api as any).createUser({ body: { email: EMAIL, password: PASSWORD, name: NAME } });
  } catch (e: any) {
    if (!String(e?.message).includes('exist')) throw e; // ya existia: seguir
  }

  // 3. AccessGrant — el paso que se olvida
  const role = await prisma.role.findUniqueOrThrow({ where: { code: ROLE_CODE } });
  const already = await prisma.accessGrant.findFirst({ where: { userId: user.id, roleId: role.id } });
  if (!already) {
    await prisma.accessGrant.create({
      data: { userId: user.id, roleId: role.id, departmentScope: ScopeMode.all, businessUnitScope: ScopeMode.all, costCenterScope: ScopeMode.all },
    });
  }

  console.log('Listo:', EMAIL, '| rol:', ROLE_CODE);
  await prisma.$disconnect();
})();
```

Para un `DEPT_HEAD` (no superadmin), cambia el paso 3 por `ScopeMode.selected` y
crea también las filas en `accessGrantDepartment` con los departamentos que le
correspondan — mira `replaceGrant()` en `prisma/seed.ts` para el patrón completo.

La primera vez que esa persona entra, `SessionGuard` **enlaza sola** la identidad
de Better Auth con su perfil buscando por correo, y guarda el enlace en
`app_user.auth_user_id`. Quien no esté en el directorio no entra, aunque tenga
credenciales válidas.

**No pongas la contraseña real en este archivo ni en Swagger.** `/docs` no tiene
guard propio — cualquiera con la URL puede ejecutar el ejemplo con un clic y
quedar autenticado. Guarda las credenciales reales en un gestor de contraseñas
o en variables de entorno, nunca en un archivo que se commitea.

## Probar

```bash
pnpm start          # http://localhost:3000

# 1. Login: guarda la cookie de sesión. Sustituye por las credenciales reales
#    que creaste con crear-cuenta.ts — cookies.txt esta en .gitignore, no se sube.
curl -c cookies.txt -X POST http://localhost:3000/api/auth/sign-in/email \
  -H 'Content-Type: application/json' \
  -d '{"email":"tu-correo@ejemplo.com","password":"tu-password"}'

# 2. Perfil, alcance y permisos
curl -b cookies.txt http://localhost:3000/me

# 3. Contexto (casino y ejercicio activos)
curl -b cookies.txt http://localhost:3000/me/context

# 4. Cambiar de casino — se valida contra el alcance
curl -b cookies.txt -X PUT http://localhost:3000/me/context \
  -H 'Content-Type: application/json' \
  -d '{"businessUnitId":1,"fiscalYearId":1}'
```

## Qué deberías ver

| Usuario | Rol | Departamentos | Casinos | Permisos |
|---|---|---|---|---|
| `admin@cecom.mx` | SUPERADMIN | TODOS | 10 | 441 |
| `rcano@cecom.mx` | DEPT_HEAD | 2 | 10 | 275 |

Esa es la regla del diseño funcionando: **el encargado ve su departamento en
todos los casinos**. Restringe una dimensión y abre la otra.

Sin cookie, `/me` responde **401**. Con un casino fuera de alcance,
`PUT /me/context` responde **400**.

## Las cuatro capas

```
1. Better Auth        ¿quién eres?      /api/auth/*  → auth_user + cookie
2. SessionGuard       ¿y aquí quién es? auth_user    → app_user  (enlaza por correo)
3. AuthorizationService ¿qué alcanza?   access_grant → departamentos × casinos
4. Controlador        responde ya filtrado
```

La separación importa: Better Auth resuelve **autenticación**, este esquema
resuelve **autorización**. Nunca se mezclan.

## Notas

- **`userContext` no es fuente de autorización.** Recuerda en qué casino quedó el
  usuario, pero cada petición revalida contra `access_grant`.
- **El plugin `organization` de Better Auth está desactivado** a propósito: su
  modelo de roles es plano y duplicaría lo que hace `access_grant`.
- **`auth_user.role`** (valores `"user"` / `"admin"`) es de Better Auth y no tiene
  nada que ver con el modelo `Role` del negocio.
