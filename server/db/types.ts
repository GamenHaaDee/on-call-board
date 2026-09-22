/** Wat een database-driver moet kunnen. Zie ./mysql.ts, ./postgres.ts en ./sqlite.ts. */
export interface RunResult {
  affectedRows: number;
  insertId: number;
}

export type DbDriverName = "sqlite" | "mysql" | "postgres";

/** Verbindingsgegevens; komt uit env of uit de setup-/instellingenpagina. */
export interface DbConfig {
  driver: DbDriverName;
  /** Alleen bij sqlite: pad naar het databasebestand. */
  file: string;
  /** Alleen bij postgres: volledige connection string (in plaats van de velden hieronder). */
  url: string;
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  /** Naam van de piket-tabel. */
  table: string;
}

export interface DbDriver {
  /** SQL-expressie voor "nu" in het betreffende dialect (NOW() / datetime(...)). */
  readonly nowExpr: string;
  /** Tabel-/kolomnaam veilig quoten (backticks in MySQL/sqlite, "..." in Postgres). */
  quoteId(name: string): string;
  /** Rijen ophalen. */
  all<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
  /** INSERT/UPDATE/DELETE uitvoeren. */
  run(sql: string, params?: unknown[]): Promise<RunResult>;
  /** Verbinden en (waar van toepassing) de tabel aanmaken. */
  init(): Promise<void>;
  close(): Promise<void>;
}
