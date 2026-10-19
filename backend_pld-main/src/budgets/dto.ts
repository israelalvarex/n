import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsPositive, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateNested,
} from 'class-validator';
import { Frequency, LineNature, LineSource, Month } from '../../generated/prisma/enums';

export class CreateLineDto {
  @IsInt() @IsPositive() lineItemId!: number;
  @IsInt() @IsPositive() departmentId!: number;
  @IsOptional() @IsInt() @IsPositive() resourceId?: number;
  @IsOptional() @IsString() @MaxLength(60) component?: string;
  @IsOptional() @IsNumber() quantity?: number;
  @IsOptional() @IsString() @MaxLength(30) quantityUnit?: string;
  @IsOptional() @IsEnum(Frequency) frequency?: Frequency;
  @IsOptional() @IsEnum(LineSource) source?: LineSource;
  @IsOptional() @IsInt() @IsPositive() glAccountId?: number;
}

export class UpdateLineDto {
  @IsOptional() @IsInt() @IsPositive() resourceId?: number;
  @IsOptional() @IsString() @MaxLength(60) component?: string;
  @IsOptional() @IsNumber() quantity?: number;
  @IsOptional() @IsString() @MaxLength(30) quantityUnit?: string;
  @IsOptional() @IsEnum(Frequency) frequency?: Frequency;
  @IsOptional() @IsInt() @IsPositive() glAccountId?: number;
}

export class OverrideDto {
  @IsNumber() amount!: number;

  /** Obligatorio: un override sin motivo es un numero sin dueno. */
  @IsString() @MinLength(5) @MaxLength(255) reason!: string;
}

export class AssignDto {
  @IsInt() @IsPositive() lineId!: number;
  @IsInt() @IsPositive() userId!: number;
}

export class FinishDto {
  @IsBoolean() finished!: boolean;
}

export class MonthParamDto {
  @IsEnum(Month) month!: Month;
}

/** Mapeo manual (via la plataforma, no via Excel) de un concepto hacia su cuenta/subcuenta de metric_forecast. Manda ambos campos o ninguno -- se sobreescriben juntos. */
export class SetForecastMappingDto {
  @IsOptional() @IsString() @MaxLength(80) forecastAccount?: string;
  @IsOptional() @IsString() @MaxLength(80) forecastSubaccount?: string;
}

export class ApplySourceDto {
  @IsIn(['manual', 'previous_year', 'forecast']) source!: 'manual' | 'previous_year' | 'forecast';

  /** Requerido si source = previous_year: el id del renglon del anio de origen. */
  @IsOptional() @IsInt() @IsPositive() sourceLineId?: number;

  /** Factor de ajuste sobre el anio anterior (1.1 = +10%). Default 1. Solo aplica a previous_year. */
  @IsOptional() @IsNumber() ratio?: number;
}

/**
 * Alta de una categoria nueva del catalogo -- NO ligada a ningun anio fiscal,
 * queda disponible para siempre desde el momento en que se crea (incluye los
 * anios futuros, sin volver a capturarla). El code se deriva del name.
 */
export class CreateCategoryDto {
  @IsInt() @IsPositive() budgetSheetId!: number;
  @IsString() @MaxLength(180) name!: string;
  @IsOptional() @IsInt() @IsPositive() parentCategoryId?: number;
  @IsOptional() @IsInt() @IsPositive() departmentId?: number;
  @IsOptional() @IsBoolean() isSubtotal?: boolean;
}

/** Alta de un concepto nuevo del catalogo, dentro de una categoria existente. */
export class CreateLineItemDto {
  @IsInt() @IsPositive() categoryId!: number;
  @IsString() @MaxLength(255) name!: string;
  @IsEnum(LineNature) nature!: LineNature;
  @IsOptional() @IsEnum(Frequency) frequency?: Frequency;
  @IsOptional() @IsArray() applicableMonths?: number[];
  @IsOptional() @IsString() @MaxLength(30) glAccount?: string;
  @IsOptional() @IsBoolean() fnbOnly?: boolean;
  @IsOptional() @IsString() @MaxLength(20) costCenterOnly?: string;
}

/** Un mes de un cambio del guardado por lote. */
export class CambioMesDto {
  @IsInt() @Min(0) @Max(11) month!: number;

  /** "predicted" | "lower" | "upper" (bandas), "y2025" (cierre de ese año) o "manual". */
  @IsString() @Matches(/^(predicted|lower|upper|manual|y\d{4})$/) variant!: string;

  /** Solo en "manual". */
  @IsOptional() @IsNumber() amount?: number;

  /** Solo en "manual"; si no llega, se guarda "Captura directa en la hoja". */
  @IsOptional() @IsString() @MaxLength(255) reason?: string;
}

/** Los cambios de un renglon: el renglon existente, o la cuenta de metricas. */
export class CambioRenglonDto {
  @IsOptional() @IsInt() @IsPositive() lineId?: number;
  @IsOptional() @IsString() @MaxLength(80) account?: string;
  @IsOptional() @IsString() @MaxLength(80) subaccount?: string | null;

  @IsArray() @ArrayMaxSize(12) @ValidateNested({ each: true }) @Type(() => CambioMesDto)
  months!: CambioMesDto[];
}

/** PUT /sheets/:bu/:dept/lines · todo lo que cambio en la hoja, en una peticion. */
export class GuardarHojaDto {
  @IsArray() @ArrayMaxSize(1000) @ValidateNested({ each: true }) @Type(() => CambioRenglonDto)
  changes!: CambioRenglonDto[];
}
