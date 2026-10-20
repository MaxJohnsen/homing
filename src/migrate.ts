import { readdir, readFile } from 'node:fs/promises';
import postgres from 'postgres';
import { adminUrl, authDatabaseUrl, databaseUrl } from './db.ts';

const directory = new URL('../migrations/', import.meta.url);

/**
 * Applies new migrations as the admin role, then lets the restricted roles
 * log in with the passwords from their database URLs. A test can stop before
 * one migration, to try it on what came before.
 */
export async function migrate(admin = adminUrl, app = databaseUrl, auth = authDatabaseUrl, { before }: { before?: string } = {}): Promise<void> {
  const logins = [
    { role: 'homing_app', url: new URL(app), setting: 'DATABASE_URL' },
    { role: 'homing_auth', url: new URL(auth), setting: 'AUTH_DATABASE_URL' },
  ];
  for (const { role, url, setting } of logins) {
    if (url.username !== role) throw new Error(`${setting} must connect as ${role}`);
  }

  const sql = postgres(admin, { max: 1, onnotice: () => {} });
  try {
    await sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtext('homing.migrate'))`;
      await tx`
        create table if not exists schema_migrations (
          name text primary key,
          applied_at timestamptz not null default now()
        )
      `;
      const applied = new Set((await tx`select name from schema_migrations`).map((row) => row.name));
      const files = (await readdir(directory)).filter((file) => file.endsWith('.sql') && (before === undefined || file < before)).sort();
      for (const file of files.filter((file) => !applied.has(file))) {
        await tx.unsafe(await readFile(new URL(file, directory), 'utf8'));
        await tx`insert into schema_migrations (name) values (${file})`;
      }
      for (const { role, url } of logins) {
        const [{ statement }] = await tx`
          select format('alter role %I with login password %L', ${role}::text, ${decodeURIComponent(url.password)}::text) as statement
        `;
        await tx.unsafe(statement);
      }
    });
  } finally {
    await sql.end();
  }
}

if (import.meta.main) {
  await migrate();
}
