import { Module } from '@nestjs/common';
import { BudgetsController } from './budgets.controller';
import { BudgetsService } from './budgets.service';
import { CalculationService } from './calculation.service';
import { MetricBudgetsController } from './metric-budgets.controller';
import { MetricBudgetsService } from './metric-budgets.service';
import { ReadinessService } from './readiness.service';
import { SheetWriterService } from './sheet-writer.service';

@Module({
  controllers: [BudgetsController, MetricBudgetsController],
  providers: [BudgetsService, CalculationService, ReadinessService, SheetWriterService, MetricBudgetsService],
  exports: [BudgetsService, CalculationService, ReadinessService, SheetWriterService],
})
export class BudgetsModule {}
