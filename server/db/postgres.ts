import pg from "pg";
import { quoteDouble } from "./identifier";
import { assertColumns } from "./columns";
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
      // Bestaat de tabel al (bijvoorbeeld die van het telefoonsysteem), dan
      // blijft hij onaangeroerd: geen CREATE, geen ALTER. Alleen bij een lege
      // database legt de app zelf een tabel aan.
      const existing = await pool.query(
        "SELECT to_regclass($1) AS found",
        [dbConfig.table]
      );

      if (!existing.rows[0]?.found) {
        await pool.query(
          `CREATE TABLE ${quoteDouble(dbConfig.table)} (
             pc_id          SERIAL PRIMARY KEY,
             pc_startterm   TIMESTAMP    NOT NULL,
             pc_endterm     TIMESTAMP    NOT NULL,
             pc_period      SMALLINT     NOT NULL DEFAULT 0,
             pc_description VARCHAR(45),
             pc_telnum      VARCHAR(15)  NOT NULL
           )`
        );
        console.log(`[db] PostgreSQL: tabel "${dbConfig.table}" aangemaakt.`);
      }

      // Controleren of de kolommen zijn die de app verwacht; een tabel met
      // andere kolomnamen levert anders pas bij de eerste schrijfactie een
      // onbegrijpelijke fout op.
      const columns = await pool.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
          WHERE table_name = $1`,
        [dbConfig.table]
      );
      assertColumns(dbConfig.table, columns.rows.map((r) => r.column_name));

      console.log(`[db] PostgreSQL: ${dbConfig.database || dbConfig.url}`);
    },

    async close() {
      await pool.end();
    },
  };
}
