import mysql, { type RowDataPacket } from "mysql2/promise";
import { quoteBacktick } from "./identifier";
import { assertColumns } from "./columns";
import type { DbConfig, DbDriver, RunResult } from "./types";

type MysqlParam = string | number | boolean | Date | null;

/** Driver voor een bestaande MySQL/MariaDB-server. */
export function createMysqlDriver(dbConfig: DbConfig): DbDriver {
  const pool = mysql.createPool({
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    password: dbConfig.password,
    database: dbConfig.database,
    waitForConnections: true,
    connectionLimit: 5,
    dateStrings: true,
  });

  return {
    nowExpr: "NOW()",
    quoteId: quoteBacktick,

    async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
      const [rows] = await pool.execute(sql, params as MysqlParam[]);
      return rows as T[];
    },

    async run(sql: string, params: unknown[] = []): Promise<RunResult> {
      const [result] = await pool.execute(sql, params as MysqlParam[]);
      const ok = result as mysql.ResultSetHeader;
      return { affectedRows: ok.affectedRows ?? 0, insertId: ok.insertId ?? 0 };
    },

    async init() {
      // De tabel wordt hier nooit aangemaakt of gewijzigd: hij is van het
      // telefoonsysteem. Wel controleren of hij bestaat en de juiste kolommen
      // heeft, zodat een verkeerde naam meteen opvalt in plaats van bij de
      // eerste schrijfactie.
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
        [dbConfig.database, dbConfig.table]
      );

      assertColumns(dbConfig.table, rows.map((r) => String(r.COLUMN_NAME)));

      console.log(`[db] MySQL: ${dbConfig.database}@${dbConfig.host}`);
    },

    async close() {
      await pool.end();
    },
  };
}
