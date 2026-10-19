import { Module } from '@nestjs/common';
import { CycleController } from './cycle.controller';

@Module({ controllers: [CycleController] })
export class CycleModule {}
