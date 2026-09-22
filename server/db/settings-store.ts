// Instellingen in de database: één rij per onderdeel (rooster, rotatie, mail,
// tijdzone, admin-token), met de waarde als JSON.
//
// De verbindingsgegevens van de database zelf kunnen hier niet in staan (dan
// wist de app niet waar hij moest inloggen); die blijven in het instellingen-
// bestand of in environment variables.
import { getDb } from "./index";
import { checkIdentifier } from "./identifier";
import type { DbDriver } from "./types";

export interface SettingsRow {
  key: string;
  value: string;
}

/** Maakt de tabel aan als hij ontbreekt. Gooit als dat niet mag. */
async function ensureTable(db: DbDriver, table: string): Promise<void> {
  const name = db.quoteId(checkIdentifier(table));

  if (db.nowExpr === "NOW()") {
    // MySQL en PostgreSQL delen deze vorm; beide accepteren VARCHAR en TEXT.
    await db.run(
      `CREATE TABLE IF NOT EXISTS ${name} (
         setting_key   VARCHAR(64) NOT NULL,
         setting_value TEXT        NOT NULL,
         PRIMARY KEY (setting_key)
       )`
    );
    return;
  }

  await db.run(
    `CREATE TABLE IF NOT EXISTS ${name} (
       setting_key   TEXT NOT NULL PRIMARY KEY,
       setting_value TEXT NOT NULL
     )`
  );
}

/**
 * Leest alle instellingen. Geeft `null` als de tabel niet bestaat of niet
 * gelezen kan worden; de aanroeper valt dan terug op het bestand.
 */
export async function readSettingsTable(table: string): Promise<Record<string, unknown> | null> {
  const db = await getDb();
  const name = db.quoteId(checkIdentifier(table));

  let rows: { setting_key: string; setting_value: string }[];
  try {
    rows = await db.all(`SELECT setting_key, setting_value FROM ${name}`);
  } catch {
    // Tabel bestaat nog niet: proberen aan te maken en opnieuw lezen.
    await ensureTable(db, table);
    rows = await db.all(`SELECT setting_key, setting_value FROM ${name}`);
  }

  const result: Record<string, unknown> = {};
  for (const row of rows) {
    try {
      result[row.setting_key] = JSON.parse(row.setting_value);
    } catch {
      console.warn(`[settings] Waarde van "${row.setting_key}" is geen geldige JSON.`);
    }
  }
  return result;
}

/** Schrijft de meegegeven onderdelen weg; wat er niet in staat blijft staan. */
export async function writeSettingsTable(
  table: string,
  values: Record<string, unknown>
): Promise<void> {
  const db = await getDb();
  const name = db.quoteId(checkIdentifier(table));
  await ensureTable(db, table);

  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) continue;
    const json = JSON.stringify(value);

    // Geen INSERT ... ON CONFLICT: de drie dialecten schrijven dat elk anders,
    // en dit is een handvol rijen die maar zelden verandert.
    const updated = await db.run(
      `UPDATE ${name} SET setting_value = ? WHERE setting_key = ?`,
      [json, key]
    );
    if (updated.affectedRows === 0) {
      await db.run(`INSERT INTO ${name} (setting_key, setting_value) VALUES (?, ?)`, [key, json]);
    }
  }
}

/** Leegt de tabel (bij het resetten van de app). */
export async function clearSettingsTable(table: string): Promise<void> {
  const db = await getDb();
  const name = db.quoteId(checkIdentifier(table));
  try {
    await db.run(`DELETE FROM ${name}`);
  } catch {
    // Tabel bestond niet; dan valt er ook niets te wissen.
  }
}
