import { Body, Controller, Get, ParseIntPipe, Put, Query, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsInt, IsNumber, IsOptional, IsPositive, IsString, Matches, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';
import { CurrentUser } from '../auth/current-user.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { SessionGuard } from '../auth/session.guard';
import type { RequestUser } from '../auth/session.guard';
import { MetricBudgetsService } from './metric-budgets.service';

class CambioMesMetricaDto {
  @IsInt() @Min(0) @Max(11) month!: number;
  @IsString() @Matches(/^(predicted|lower|upper|manual|y\d{4})$/) variant!: string;
  @IsOptional() @IsNumber() amount?: number;
  @IsOptional() @IsString() @MaxLength(255) reason?: string;
}

class CambioCasinoDto {
  @IsInt() @IsPositive() businessUnitId!: number;

  @IsArray() @ArrayMaxSize(12) @ValidateNested({ each: true }) @Type(() => CambioMesMetricaDto)
  months!: CambioMesMetricaDto[];
}

class GuardarMetricaDto {
  @IsString() @MaxLength(150) metric!: string;

  @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => CambioCasinoDto)
  changes!: CambioCasinoDto[];
}

/** La hoja de Ingresos y metas: lo presupuestado de cada metrica por casino y mes. */
@Controller()
@UseGuards(SessionGuard, PermissionsGuard)
export class MetricBudgetsController {
  constructor(private service: MetricBudgetsService) {}

  @Get('metric-budgets')
  @RequirePermission('budget.read')
  leer(
    @CurrentUser() user: RequestUser,
    @Query('metric') metric: string,
    @Query('fiscalYearId', ParseIntPipe) fiscalYearId: number,
  ) {
    return this.service.leer(user.id, metric, fiscalYearId);
  }

  /**
   * Guardado por lote: para bandas y cierres llega la opcion y el servidor
   * calcula el importe; para "manual", el importe y su motivo.
   */
  @Put('metric-budgets')
  @RequirePermission('budget_line_month.capture')
  guardar(
    @CurrentUser() user: RequestUser,
    @Query('fiscalYearId', ParseIntPipe) fiscalYearId: number,
    @Body() body: GuardarMetricaDto,
  ) {
    return this.service.guardar(user.id, body.metric, fiscalYearId, body.changes);
  }
}
