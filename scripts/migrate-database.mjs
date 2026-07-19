import path from 'node:path';

import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for database migrations');
}

const client = postgres(databaseUrl, {
  max: 1,
  prepare: false,
  onnotice: () => {},
});

try {
  await migrate(drizzle(client), {
    migrationsFolder: path.join(process.cwd(), 'drizzle'),
  });
  process.stdout.write('OC Kindergarten database migrations completed\n');
} finally {
  await client.end({ timeout: 5 });
}
