import postgres from 'postgres';

export type Sql = postgres.Sql;

/**
 * Who a request or routine acts for. Every transaction runs as exactly one.
 * The agent, if any, is what acts for them, such as "Claude Code". A person
 * editing directly, as in the web app or the command line, is marked direct:
 * only then can they change guidance.
 */
export type Principal = ({ person: string; direct?: true } | { space: string }) & { agent?: string };

/** A transaction running as a principal. */
export interface Session {
  tx: postgres.TransactionSql;
  principal: Principal;
}

/** The restricted role Homing uses for everything except migrations. */
export const databaseUrl =
  process.env.DATABASE_URL ?? 'postgres://homing_app:homing_app@localhost:5442/homing';

/** Sign-in's own role, which can use only the auth schema. */
export const authDatabaseUrl =
  process.env.AUTH_DATABASE_URL ?? 'postgres://homing_auth:homing_auth@localhost:5442/homing';

/** The admin role, used only to run migrations. */
export const adminUrl =
  process.env.DATABASE_ADMIN_URL ?? 'postgres://homing:homing@localhost:5442/homing';

export function connect(url = databaseUrl): Sql {
  return postgres(url, { transform: postgres.camel, onnotice: () => {} });
}

/**
 * Runs fn in a transaction as the principal. Row-level security in
 * PostgreSQL reads the same principal, so it applies even where Homing's
 * own checks are missing. A snapshot reads everything as it was at one
 * moment, and writes nothing.
 */
export async function withPrincipal<T>(
  sql: Sql,
  principal: Principal,
  fn: (session: Session) => Promise<T>,
  { snapshot = false }: { snapshot?: boolean } = {},
): Promise<T> {
  const person = 'person' in principal ? principal.person : '';
  const space = 'space' in principal ? principal.space : '';
  const direct = 'person' in principal && principal.direct ? 'true' : '';
  return (await sql.begin(snapshot ? 'isolation level repeatable read read only' : '', async (tx) => {
    // Also how PostgreSQL plans, per transaction so it works through any pooler. Row-level security
    // makes the planner overestimate costs, so JIT compiled queries that take milliseconds, for up to a
    // second. And plans cached for any values ran 2 to 3 times slower than plans for the values at hand.
    await tx`
      select set_config('homing.person_id', ${person}, true),
             set_config('homing.space_id', ${space}, true),
             set_config('homing.agent', ${principal.agent ?? ''}, true),
             set_config('homing.direct', ${direct}, true),
             set_config('jit', 'off', true),
             set_config('plan_cache_mode', 'force_custom_plan', true)
    `;
    return fn({ tx, principal });
  })) as T;
}

/** Homing refused an operation the principal isn't allowed to perform. */
export class AccessDenied extends Error {
  override name = 'AccessDenied';
}

export function personOf(principal: Principal): string | undefined {
  return 'person' in principal ? principal.person : undefined;
}
