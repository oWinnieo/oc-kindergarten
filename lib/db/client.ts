import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema';

function readPoolMaximum(): number {
  const parsed = Number(process.env.DATABASE_POOL_MAX ?? '10');
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 50 ? parsed : 10;
}

function createDatabaseClient() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error('DATABASE_URL 未配置');
  }
  const queryClient = postgres(databaseUrl, {
    max: readPoolMaximum(),
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 10,
    onnotice: () => {},
  });
  return {
    queryClient,
    database: drizzle(queryClient, { schema }),
  };
}

type DatabaseClient = ReturnType<typeof createDatabaseClient>;

const globalForDatabase = globalThis as typeof globalThis & {
  __ocKindergartenDatabase?: DatabaseClient;
};

export function getDatabaseClient(): DatabaseClient {
  if (!globalForDatabase.__ocKindergartenDatabase) {
    globalForDatabase.__ocKindergartenDatabase = createDatabaseClient();
  }
  return globalForDatabase.__ocKindergartenDatabase;
}
