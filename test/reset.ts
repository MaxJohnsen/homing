// Recreates the test database and applies the migrations. Run by `npm test`.

import postgres from 'postgres';
import { adminUrl, authDatabaseUrl, databaseUrl } from '../src/db.ts';
import { migrate } from '../src/migrate.ts';

/** The test database. Runs side by side, such as in several worktrees, each set HOMING_TEST_DB to their own. */
const testDatabase = process.env.HOMING_TEST_DB ?? 'homing_test';
if (!/^[a-z_][a-z0-9_]*$/.test(testDatabase)) throw new Error(`HOMING_TEST_DB isn't a plain database name: ${testDatabase}`);

/** Points a database URL at the test database. */
export function inTestDatabase(url: string, name = testDatabase): string {
  const test = new URL(url);
  test.pathname = `/${name}`;
  return test.toString();
}

/**
 * A new database of its own, for a test about the instance as a whole, such
 * as before anyone has set it up.
 */
export async function freshDatabase(name: string) {
  const database = `${testDatabase}_${name}`;
  const sql = postgres(adminUrl, { onnotice: () => {} });
  await sql.unsafe(`drop database if exists ${database} with (force)`);
  await sql.unsafe(`create database ${database}`);
  await sql.end();
  const urls = {
    app: inTestDatabase(databaseUrl, database),
    auth: inTestDatabase(authDatabaseUrl, database),
    admin: inTestDatabase(adminUrl, database),
  };
  await migrate(urls.admin, urls.app, urls.auth);
  return urls;
}

if (import.meta.main) {
  const sql = postgres(adminUrl, { onnotice: () => {} });
  await sql.unsafe(`drop database if exists ${testDatabase} with (force)`);
  await sql.unsafe(`create database ${testDatabase}`);
  await sql.end();
  await migrate(inTestDatabase(adminUrl), inTestDatabase(databaseUrl), inTestDatabase(authDatabaseUrl));
}
