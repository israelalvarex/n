import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor() {
    // Prisma 7 exige driver adapter: la URL ya no viaja en el schema,
    // vive en prisma.config.ts y se le pasa al cliente aqui.
    super({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }
}
