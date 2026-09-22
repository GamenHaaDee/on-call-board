import mysql from "mysql2/promise";
import { quoteBacktick } from "./identifier";
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
      // De tabel bestaat al (3CX gebruikt hem); alleen controleren of hij
      // bereikbaar is, zodat een verkeerde naam meteen opvalt.
      await pool.query(`SELECT 1 FROM ${quoteBacktick(dbConfig.table)} LIMIT 1`);
      console.log(`[db] MySQL: ${dbConfig.database}@${dbConfig.host}`);
    },

    async close() {
      await pool.end();
    },
  };
}
