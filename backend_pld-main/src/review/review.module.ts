import { Module } from '@nestjs/common';
import { BudgetsModule } from '../budgets/budgets.module';
import { ReviewController } from './review.controller';

@Module({ imports: [BudgetsModule], controllers: [ReviewController] })
export class ReviewModule {}
