import { Module } from '@nestjs/common';
import { CatalogsController } from './catalogs.controller';

@Module({ controllers: [CatalogsController] })
export class CatalogsModule {}
