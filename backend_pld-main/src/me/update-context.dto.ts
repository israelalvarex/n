import { IsInt, IsPositive } from 'class-validator';

export class UpdateContextDto {
  /** Casino al que se cambia. Se valida contra el alcance del usuario. */
  @IsInt()
  @IsPositive()
  businessUnitId!: number;

  @IsInt()
  @IsPositive()
  fiscalYearId!: number;
}
