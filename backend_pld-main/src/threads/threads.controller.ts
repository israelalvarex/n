import {
  BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, ParseIntPipe, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { IsBoolean, IsInt, IsOptional, IsPositive, IsString, MaxLength, MinLength } from 'class-validator';
import { ThreadStatus } from '../../generated/prisma/enums';
import { CurrentUser } from '../auth/current-user.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { SessionGuard } from '../auth/session.guard';
import type { RequestUser } from '../auth/session.guard';
import { PrismaService } from '../prisma/prisma.service';

class OpenThreadDto {
  /**
   * Codigo del objeto (system_object). Los que usa la app:
   *  - budget_line: un renglon guardado (recordId = su id).
   *  - budget_sheet_cell: cualquier otra celda de la hoja de presupuesto
   *    (recordId = "a:cuenta||subcuenta", "g:grupo", "col" u "hoja").
   *  - metric_budget_month: la hoja de una metrica de ingresos (recordId = el
   *    nombre de la metrica; el casino va en businessUnitId).
   */
  @IsString() @MaxLength(80) object!: string;
  @IsString() @MaxLength(255) recordId!: string;
  @IsOptional() @IsString() @MaxLength(60) field?: string;
  @IsString() @MinLength(1) text!: string;
  @IsOptional() @IsBoolean() blocking?: boolean;
  @IsOptional() @IsInt() @IsPositive() departmentId?: number;
  @IsOptional() @IsInt() @IsPositive() businessUnitId?: number;
  @IsOptional() @IsInt() @IsPositive() fiscalYearId?: number;
}

class ReplyDto {
  @IsString() @MinLength(1) text!: string;
  @IsOptional() @IsInt() @IsPositive() parentMessageId?: number;
}

/**
 * Conversaciones ancladas a cualquier registro.
 *
 * Comentar NO exige permiso de edicion: quien alcanza el registro puede abrir un
 * hilo. Es lo que permite al miembro de casino discutir un renglon que no le toca.
 */
@Controller()
@UseGuards(SessionGuard, PermissionsGuard)
export class ThreadsController {
  constructor(private prisma: PrismaService) {}

  /**
   * Hilos de un ancla. El ejercicio, el casino y el departamento son filtros
   * opcionales: un ancla como "a:NOMINAS||" existe en cada hoja, y es el
   * alcance del hilo lo que dice de cual.
   */
  @Get('threads')
  @RequirePermission('comment_thread.read')
  async list(
    @Query('object') object: string,
    @Query('recordId') recordId: string,
    @Query('field') field?: string,
    @Query('fiscalYearId') fiscalYearId?: string,
    @Query('businessUnitId') businessUnitId?: string,
    @Query('departmentId') departmentId?: string,
  ) {
    const systemObject = await this.prisma.systemObject.findUnique({ where: { code: object }, select: { id: true } });
    if (!systemObject) throw new NotFoundException(`El objeto ${object} no esta registrado`);
    const entero = (v?: string) => (v && Number.isInteger(Number(v)) ? Number(v) : undefined);

    return this.prisma.commentThread.findMany({
      where: {
        systemObjectId: systemObject.id,
        recordId,
        ...(field ? { field } : {}),
        ...(entero(fiscalYearId) ? { fiscalYearId: entero(fiscalYearId) } : {}),
        ...(entero(businessUnitId) ? { businessUnitId: entero(businessUnitId) } : {}),
        ...(entero(departmentId) ? { departmentId: entero(departmentId) } : {}),
      },
      include: {
        object: { select: { code: true } },
        message: {
          where: { deletedAt: null },
          select: { id: true, text: true, createdAt: true, user: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Todos los hilos de una hoja, para pintar los indicadores de golpe. */
  @Get('sheets/:businessUnitId/:departmentId/threads')
  @RequirePermission('comment_thread.read')
  bySheet(
    @Param('businessUnitId', ParseIntPipe) businessUnitId: number,
    @Param('departmentId', ParseIntPipe) departmentId: number,
    @Query('fiscalYearId', ParseIntPipe) fiscalYearId: number,
  ) {
    return this.prisma.commentThread.findMany({
      where: { businessUnitId, departmentId, fiscalYearId },
      // El objeto dice como leer recordId: el id de un renglon o el ancla de una celda.
      include: { _count: { select: { message: true } }, object: { select: { code: true } } },
      orderBy: [{ status: 'asc' }, { blocking: 'desc' }],
    });
  }

  @Post('threads')
  @RequirePermission('comment_thread.create')
  async open(@CurrentUser() user: RequestUser, @Body() body: OpenThreadDto) {
    const systemObject = await this.prisma.systemObject.findUnique({
      where: { code: body.object },
      select: { id: true, commentable: true },
    });
    if (!systemObject) throw new NotFoundException(`El objeto ${body.object} no esta registrado`);
    if (!systemObject.commentable) throw new BadRequestException('Ese objeto no admite comentarios');

    const scope = await this.resolveScope(body);

    const thread = await this.prisma.commentThread.create({
      data: {
        systemObjectId: systemObject.id,
        recordId: body.recordId,
        field: body.field,
        blocking: body.blocking ?? false,
        openedBy: user.id,
        ...scope,
        message: { create: { userId: user.id, text: body.text } },
      },
      include: { message: true },
    });
    return thread;
  }

  @Post('threads/:id/messages')
  @RequirePermission('message.create')
  async reply(@CurrentUser() user: RequestUser, @Param('id', ParseIntPipe) id: number, @Body() body: ReplyDto) {
    const thread = await this.prisma.commentThread.findUnique({ where: { id } });
    if (!thread) throw new NotFoundException('El hilo no existe');
    return this.prisma.message.create({
      data: { threadId: id, userId: user.id, text: body.text, parentMessageId: body.parentMessageId },
    });
  }

  /** Resolver un hilo bloqueante es lo que destraba la aprobacion del departamento. */
  @Patch('threads/:id/resolve')
  @RequirePermission('comment_thread.update')
  resolve(@CurrentUser() user: RequestUser, @Param('id', ParseIntPipe) id: number) {
    return this.prisma.commentThread.update({
      where: { id },
      data: { status: ThreadStatus.resolved, resolvedBy: user.id, resolvedAt: new Date() },
    });
  }

  @Delete('messages/:id')
  @RequirePermission('message.delete')
  async remove(@CurrentUser() user: RequestUser, @Param('id', ParseIntPipe) id: number) {
    const message = await this.prisma.message.findUnique({ where: { id } });
    if (!message) throw new NotFoundException('El mensaje no existe');
    if (message.userId !== user.id) throw new BadRequestException('Solo el autor borra su mensaje');
    // Borrado logico: el hilo debe conservar su historia
    return this.prisma.message.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  /**
   * El alcance se copia del registro comentado para poder filtrar los hilos sin
   * recorrer la tabla origen. Si el cliente no lo manda y el ancla es un renglon,
   * se deduce.
   */
  private async resolveScope(body: OpenThreadDto) {
    // Lo que el cliente manda, aunque sea parcial: la hoja de una metrica no
    // tiene departamento, y su fila de totales tampoco casino.
    if (body.departmentId || body.businessUnitId || body.fiscalYearId) {
      return { departmentId: body.departmentId, businessUnitId: body.businessUnitId, fiscalYearId: body.fiscalYearId };
    }
    if (body.object === 'budget_line' || body.object === 'budget_line_month') {
      const lineId = body.object === 'budget_line' ? Number(body.recordId) : undefined;
      if (lineId) {
        const line = await this.prisma.budgetLine.findUnique({
          where: { id: lineId },
          select: { departmentId: true, budget: { select: { businessUnitId: true, fiscalYearId: true } } },
        });
        if (line) {
          return {
            departmentId: line.departmentId,
            businessUnitId: line.budget.businessUnitId,
            fiscalYearId: line.budget.fiscalYearId,
          };
        }
      }
    }
    return {};
  }
}
