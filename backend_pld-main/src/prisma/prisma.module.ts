import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

// Global para no importarlo en cada modulo que consulte la base.
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
