import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { ApiKeyGuard } from './common/guards/api-key.guard';
import { BudgetsModule } from './budgets/budgets.module';
import { CatalogsModule } from './catalogs/catalogs.module';
import { CycleModule } from './cycle/cycle.module';
import { MeModule } from './me/me.module';
import { PeopleModule } from './people/people.module';
import { PrismaModule } from './prisma/prisma.module';
import { ReportsModule } from './reports/reports.module';
import { ResourcesModule } from './resources/infrastructure/resources.module';
import { ReviewModule } from './review/review.module';
import { ThreadsModule } from './threads/threads.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    MeModule,
    CatalogsModule,
    BudgetsModule,
    ResourcesModule,
    ThreadsModule,
    ReviewModule,
    PeopleModule,
    CycleModule,
    ReportsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // x-api-key obligatorio en todo lo que pasa por el router de Nest. Better
    // Auth (/api/auth/*) se monta como middleware crudo de Express antes del
    // router de Nest (ver main.ts), asi que nunca llega a esta guard y no
    // necesita la llave.
    { provide: APP_GUARD, useClass: ApiKeyGuard },
  ],
})
export class AppModule {}
