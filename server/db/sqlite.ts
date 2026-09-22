import { mkdirSync } from "node:fs";
import path from "node:path";
import { quoteBacktick } from "./identifier";
import type { DbConfig, DbDriver, RunResult } from "./types";

// Minimale vorm van wat we van node:sqlite gebruiken (de types zitten niet in
// elke @types/node-versie).
type SqliteValue = string | number | bigint | null | Uint8Array;
interface SqliteStatement {
  all(...params: SqliteValue[]): unknown[];
  run(...params: SqliteValue[]): { changes: number | bigint; lastInsertRowid: number | bigint };
}
interface SqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
  close(): void;
}

// node:sqlite zit ingebouwd in Node (18/20 hebben het niet, 22.5+ wel).
// Daarom pas laden wanneer deze driver echt gebruikt wordt.
async function openDatabase(file: string): Promise<SqliteDatabase> {
  let DatabaseSync: new (path: string) => SqliteDatabase;
  try {
    ({ DatabaseSync } = await import("node:sqlite"));
  } catch {
    throw new Error(
      `SQLite vereist Node 22.5 of nieuwer (deze versie: ${process.version}). ` +
        `Update Node, of kies MySQL/PostgreSQL.`
    );
  }
  mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  return db;
}

/** Driver voor een ingebouwd sqlite-bestand — geen aparte databaseserver. */
export function createSqliteDriver(dbConfig: DbConfig): DbDriver {
  let db: SqliteDatabase | null = null;

  const handle = (): SqliteDatabase => {
    if (!db) throw new Error("Database nog niet geopend (init() ontbreekt).");
    return db;
  };

  // sqlite accepteert alleen null/number/string/bigint/Uint8Array als parameter.
  const toParams = (params: unknown[]): SqliteValue[] =>
    params.map((p): SqliteValue => {
      if (p === undefined || p === null) return null;
      if (typeof p === "number" || typeof p === "bigint" || typeof p === "string") return p;
      if (typeof p === "boolean") return p ? 1 : 0;
      if (p instanceof Date) return p.toISOString().slice(0, 19).replace("T", " ");
      return String(p);
    });

  return {
    // sqlite kent NOW() niet; localtime zodat het gelijk loopt met de server.
    nowExpr: "datetime('now', 'localtime')",
    quoteId: quoteBacktick,

    async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
      return handle().prepare(sql).all(...toParams(params)) as T[];
    },

    async run(sql: string, params: unknown[] = []): Promise<RunResult> {
      const result = handle().prepare(sql).run(...toParams(params));
      return {
        affectedRows: Number(result.changes ?? 0),
        insertId: Number(result.lastInsertRowid ?? 0),
      };
    },

    async init() {
      db = await openDatabase(dbConfig.file);
      // Zelfde kolommen als de MySQL-tabel, zodat de rest van de code identiek is.
      db.exec(
        `CREATE TABLE IF NOT EXISTS ${quoteBacktick(dbConfig.table)} (
           pc_id          INTEGER PRIMARY KEY AUTOINCREMENT,
           pc_startterm   TEXT    NOT NULL,
           pc_endterm     TEXT    NOT NULL,
           pc_period      INTEGER NOT NULL DEFAULT 0,
           pc_description TEXT,
           pc_telnum      TEXT    NOT NULL
         )`
      );
      db.exec(
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_${dbConfig.table}_startterm
           ON ${quoteBacktick(dbConfig.table)} (pc_startterm)`
      );
      console.log(`[db] SQLite: ${dbConfig.file}`);
    },

    async close() {
      db?.close();
      db = null;
    },
  };
}
