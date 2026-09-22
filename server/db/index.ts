import { getDbConfig } from "../settings";
import { createMysqlDriver } from "./mysql";
import { createPostgresDriver } from "./postgres";
import { createSqliteDriver } from "./sqlite";
import type { DbConfig, DbDriver } from "./types";

export type { DbConfig, DbDriver, DbDriverName, RunResult } from "./types";
export { quoteBacktick, quoteDouble } from "./identifier";

/** Maakt een driver voor deze verbindingsgegevens (nog niet verbonden). */
export function createDriver(dbConfig: DbConfig): DbDriver {
  switch (dbConfig.driver) {
    case "mysql":
      return createMysqlDriver(dbConfig);
    case "postgres":
      return createPostgresDriver(dbConfig);
    default:
      return createSqliteDriver(dbConfig);
  }
}

/**
 * Databasefouten hebben lang niet altijd een leesbare `message` (mysql2 gooit
 * bv. een AggregateError zonder tekst). Dit maakt er iets toonbaars van.
 */
export function describeDbError(err: unknown): string {
  const error = err as { message?: string; code?: string; errors?: unknown[] };
  if (error?.message) return error.message;
  if (Array.isArray(error?.errors) && error.errors.length > 0) {
    return describeDbError(error.errors[0]);
  }
  if (error?.code) return error.code;
  return String(err);
}

/**
 * Probeert te verbinden met de opgegeven database en sluit meteen weer af.
 * Wordt gebruikt door de "verbinding testen"-knop in de instellingen.
 */
export async function testConnection(dbConfig: DbConfig): Promise<void> {
  const driver = createDriver(dbConfig);
  try {
    await driver.init();
  } catch (err) {
    throw new Error(describeDbError(err));
  } finally {
    await driver.close().catch(() => {});
  }
}

let ready: Promise<DbDriver> | null = null;

/** Opent (eenmalig) de ingestelde database en geeft de driver terug. */
export function getDb(): Promise<DbDriver> {
  if (!ready) {
    const driver = createDriver(getDbConfig());
    ready = driver
      .init()
      .then(() => driver)
      .catch((err) => {
        ready = null; // volgende poging mag opnieuw verbinden
        throw err;
      });
  }
  return ready;
}

export async function query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
  return (await getDb()).all<T>(sql, params);
}

export async function execute(sql: string, params?: unknown[]) {
  return (await getDb()).run(sql, params);
}

export async function closeDb(): Promise<void> {
  if (!ready) return;
  const driver = await ready.catch(() => null);
  ready = null;
  await driver?.close();
}

/** Na het wijzigen van de database-instellingen opnieuw verbinden. */
export async function reopenDb(): Promise<DbDriver> {
  await closeDb().catch(() => {});
  return getDb();
}
