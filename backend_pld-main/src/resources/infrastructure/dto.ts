import { IsBoolean, IsEnum, IsInt, IsNumber, IsObject, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';
import { MetricType } from '../../../generated/prisma/enums';
import type { MetricScope } from '../domain/metric';

export class CreateResourceDto {
  @IsString() @MaxLength(60) code!: string;
  @IsString() @MaxLength(180) name!: string;
  @IsEnum(MetricType) type!: MetricType;
  @IsOptional() @IsString() expression?: string;
  @IsObject() scope!: MetricScope;
  @IsInt() @IsPositive() businessUnitId!: number;
  @IsInt() @IsPositive() createdBy!: number;
  /** Como se aplica/calcula -- texto libre, opcional, se llena a futuro. */
  @IsOptional() @IsString() @MaxLength(255) howApplied?: string;
}

export class UpdateResourceDto {
  @IsOptional() @IsString() @MaxLength(180) name?: string;
  @IsOptional() @IsObject() scope?: MetricScope;
  @IsOptional() @IsString() expression?: string;
  @IsOptional() @IsString() @MaxLength(255) howApplied?: string;
}

export class SetResourceValueDto {
  @IsNumber() value!: number;
  @IsOptional() @IsBoolean() isProjection?: boolean;
  @IsInt() @IsPositive() createdBy!: number;
  /** NULL/omitido = valor global. Si se manda, este valor solo aplica a ese casino/departamento. */
  @IsOptional() @IsInt() @IsPositive() businessUnitId?: number;
  @IsOptional() @IsInt() @IsPositive() departmentId?: number;
}
