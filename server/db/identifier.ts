// Tabelnamen kunnen niet als query-parameter mee; daarom een strikte
// whitelist-check en quoting per dialect.

export function checkIdentifier(name: string): string {
  if (!/^[A-Za-z0-9_]+$/.test(name)) {
    throw new Error(`Ongeldige tabelnaam in DB_TABLE: ${name}`);
  }
  return name;
}

/** Quoting voor MySQL en sqlite (beide begrijpen backticks). */
export function quoteBacktick(name: string): string {
  return "`" + checkIdentifier(name) + "`";
}

/** Quoting voor Postgres. */
export function quoteDouble(name: string): string {
  return '"' + checkIdentifier(name) + '"';
}
