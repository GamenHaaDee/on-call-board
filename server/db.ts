import mysql from "mysql2/promise";
import { config } from "./config.js";

export const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  waitForConnections: true,
  connectionLimit: 5,
  dateStrings: true,
});

export async function query<T = any>(sql: string, params?: unknown[]): Promise<T[]> {
  const [rows] = await pool.execute(sql, params);
  return rows as T[];
}
