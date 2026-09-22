import pg from "pg";
import { quoteDouble } from "./identifier";
import type { DbConfig, DbDriver, RunResult } from "./types";

// Postgres geeft timestamps standaard als Date-object terug; de rest van de app
// (en de frontend) werkt met "2026-03-02 12:00:00". Daarom als tekst laten staan.
pg.types.setTypeParser(1114, (value: string) => value); // timestamp
pg.types.setTypeParser(1184, (value: string) => value); // timestamptz
pg.types.setTypeParser(20, (value: string) => Number(value)); // bigint (COUNT)

// De queries in deze app gebruiken "?" (MySQL/sqlite-stijl); Postgres wil $1, $2…
export function toPlaceholders(sql: string): string {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

/** Driver voor een bestaande PostgreSQL-server. */
export function createPostgresDriver(dbConfig: DbConfig): DbDriver {
  const pool = new pg.Pool(
    dbConfig.url
      ? { connectionString: dbConfig.url, max: 5 }
      : {
          host: dbConfig.host,
          port: dbConfig.port,
          user: dbConfig.user,
          password: dbConfig.password,
          database: dbConfig.database,
          max: 5,
        }
  );

  return {
    nowExpr: "NOW()",
    quoteId: quoteDouble,

    async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
      const result = await pool.query(toPlaceholders(sql), params);
      return result.rows as T[];
    },

    async run(sql: string, params: unknown[] = []): Promise<RunResult> {
      const result = await pool.query(toPlaceholders(sql), params);
      return { affectedRows: result.rowCount ?? 0, insertId: 0 };
    },

    async init() {
      // Maakt de tabel aan als die er nog niet is; bestaande tabellen (bv. van
      // het telefoonsysteem) blijven ongemoeid.
      await pool.query(
        `CREATE TABLE IF NOT EXISTS ${quoteDouble(dbConfig.table)} (
           pc_id          SERIAL PRIMARY KEY,
           pc_startterm   TIMESTAMP    NOT NULL,
           pc_endterm     TIMESTAMP    NOT NULL,
           pc_period      SMALLINT     NOT NULL DEFAULT 0,
           pc_description VARCHAR(45),
           pc_telnum      VARCHAR(15)  NOT NULL
         )`
      );
      console.log(`[db] PostgreSQL: ${dbConfig.database || dbConfig.url}`);
    },

    async close() {
      await pool.end();
    },
  };
}
