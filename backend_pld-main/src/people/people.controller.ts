import { BadRequestException, Body, Controller, Get, NotFoundException, Param, ParseIntPipe, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { IsArray, IsBoolean, IsEmail, IsEnum, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { randomBytes } from 'node:crypto';
import { ScopeMode } from '../../generated/prisma/enums';
import { auth } from '../auth/auth';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { SessionGuard } from '../auth/session.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { RequestUser } from '../auth/session.guard';
import { PrismaService } from '../prisma/prisma.service';

class UpdatePersonDto {
  @IsOptional() @IsString() @MaxLength(150) name?: string;
  @IsOptional() @IsString() @MaxLength(150) jobTitle?: string;
  @IsOptional() @IsInt() departmentId?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}

class SetGrantDto {
  @IsInt() roleId!: number;
  @IsEnum(ScopeMode) departmentScope!: ScopeMode;
  @IsEnum(ScopeMode) businessUnitScope!: ScopeMode;
  @IsOptional() @IsArray() departmentIds?: number[];
  @IsOptional() @IsArray() businessUnitIds?: number[];
}

class InvitePersonDto {
  @IsEmail() email!: string;
  @IsString() @MaxLength(150) name!: string;
  @IsOptional() @IsString() @MaxLength(150) jobTitle?: string;
  /** Departamento de adscripcion en el directorio. No es lo mismo que el alcance de acceso. */
  @IsOptional() @IsInt() departmentId?: number;

  @IsInt() roleId!: number;
  @IsEnum(ScopeMode) departmentScope!: ScopeMode;
  @IsEnum(ScopeMode) businessUnitScope!: ScopeMode;
  @IsOptional() @IsArray() departmentIds?: number[];
  @IsOptional() @IsArray() businessUnitIds?: number[];
}

/** Pantalla "Personas y roles". */
@Controller()
@UseGuards(SessionGuard, PermissionsGuard)
export class PeopleController {
  constructor(private prisma: PrismaService) {}

  @Get('people')
  @RequirePermission('app_user.read')
  list() {
    return this.prisma.user.findMany({
      select: {
        id: true, name: true, email: true, jobTitle: true, active: true, isSuperadmin: true,
        department: { select: { code: true, name: true } },
        accessGrantUser: {
          select: {
            role: { select: { code: true, name: true } },
            departmentScope: true,
            businessUnitScope: true,
            accessGrantDepartment: { select: { department: { select: { code: true, name: true } } } },
          },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  @Patch('people/:id')
  @RequirePermission('app_user.update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: UpdatePersonDto) {
    return this.prisma.user.update({ where: { id }, data: body });
  }

  @Get('roles')
  @RequirePermission('app_role.read')
  roles() {
    return this.prisma.role.findMany({
      select: {
        id: true, code: true, name: true, description: true, bypassesScope: true,
        _count: { select: { rolePermission: true, accessGrant: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  /** Reemplaza el alcance de una persona. Es la columna ALCANCE del diseno. */
  @Put('people/:id/grants')
  @RequirePermission('access_grant.manage')
  async setGrant(@CurrentUser() user: RequestUser, @Param('id', ParseIntPipe) id: number, @Body() body: SetGrantDto) {
    const previous = await this.prisma.accessGrant.findMany({ where: { userId: id }, select: { id: true } });
    const ids = previous.map((g) => g.id);
    if (ids.length) {
      await this.prisma.accessGrantDepartment.deleteMany({ where: { grantId: { in: ids } } });
      await this.prisma.accessGrantBusinessUnit.deleteMany({ where: { grantId: { in: ids } } });
      await this.prisma.accessGrantPermission.deleteMany({ where: { grantId: { in: ids } } });
      await this.prisma.accessGrant.deleteMany({ where: { id: { in: ids } } });
    }

    const grant = await this.prisma.accessGrant.create({
      data: {
        userId: id,
        roleId: body.roleId,
        departmentScope: body.departmentScope,
        businessUnitScope: body.businessUnitScope,
        grantedBy: user.id,
      },
    });

    if (body.departmentScope === ScopeMode.selected && body.departmentIds?.length) {
      await this.prisma.accessGrantDepartment.createMany({
        data: body.departmentIds.map((departmentId) => ({ grantId: grant.id, departmentId })),
      });
    }
    if (body.businessUnitScope === ScopeMode.selected && body.businessUnitIds?.length) {
      await this.prisma.accessGrantBusinessUnit.createMany({
        data: body.businessUnitIds.map((businessUnitId) => ({ grantId: grant.id, businessUnitId })),
      });
    }
    return grant;
  }

  /**
   * Alta completa: perfil + credencial + alcance, en una sola llamada.
   *
   * Reemplaza al flujo manual de 3 pasos (crear-cuenta.ts en docs/pruebas.md).
   * Ese script se olvido una vez del AccessGrant y dejo a una cuenta con login
   * valido pero sin permisos; este endpoint no puede olvidarlo porque los tres
   * pasos son parte del mismo metodo.
   *
   * La contrasena la genera el servidor y se devuelve UNA vez en la respuesta:
   * no hay flujo de correo de invitacion todavia, asi que quien la ve aqui debe
   * compartirla por un canal seguro y decirle a la persona que la cambie.
   */
  @Post('people/invite')
  @RequirePermission('app_user.create')
  async invite(@CurrentUser() admin: RequestUser, @Body() body: InvitePersonDto) {
    const role = await this.prisma.role.findUnique({ where: { id: body.roleId } });
    if (!role) throw new NotFoundException('Ese rol no existe');

    if (body.departmentScope === ScopeMode.selected && !body.departmentIds?.length) {
      throw new BadRequestException('Con alcance "selected" hay que mandar al menos un departmentId');
    }
    if (body.businessUnitScope === ScopeMode.selected && !body.businessUnitIds?.length) {
      throw new BadRequestException('Con alcance "selected" hay que mandar al menos un businessUnitId');
    }

    // 1. Perfil de negocio
    const person = await this.prisma.user.upsert({
      where: { email: body.email },
      update: { name: body.name, jobTitle: body.jobTitle, departmentId: body.departmentId, active: true },
      create: {
        email: body.email,
        name: body.name,
        jobTitle: body.jobTitle,
        departmentId: body.departmentId,
        isSuperadmin: role.code === 'SUPERADMIN',
      },
    });

    // 2. Credencial de acceso. Password temporal, 16 bytes al azar en base64url.
    const temporaryPassword = randomBytes(16).toString('base64url');
    try {
      await (auth.api as any).createUser({
        body: { email: body.email, password: temporaryPassword, name: body.name },
      });
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (!/exist/i.test(msg)) throw new BadRequestException(`No se pudo crear la credencial: ${msg}`);
      // Ya tenia login (se le esta re-invitando con otro rol): no se toca su password.
    }

    // 3. Alcance. Aditivo a proposito: no se tocan otros grants que ya tuviera.
    const grant = await this.prisma.accessGrant.create({
      data: {
        userId: person.id,
        roleId: body.roleId,
        departmentScope: body.departmentScope,
        businessUnitScope: body.businessUnitScope,
        grantedBy: admin.id,
      },
    });
    if (body.departmentScope === ScopeMode.selected) {
      await this.prisma.accessGrantDepartment.createMany({
        data: body.departmentIds!.map((departmentId) => ({ grantId: grant.id, departmentId })),
      });
    }
    if (body.businessUnitScope === ScopeMode.selected) {
      await this.prisma.accessGrantBusinessUnit.createMany({
        data: body.businessUnitIds!.map((businessUnitId) => ({ grantId: grant.id, businessUnitId })),
      });
    }

    return { person, role: role.code, grant, temporaryPassword };
  }
}
