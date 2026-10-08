// Koppeling met het telefoniesysteem.
//
// De eigen database (standaard SQLite) houdt de volledige planning bij. Het
// telefoniesysteem heeft maar één ding nodig: welk nummer op dit moment
// bereikbaar is. Dat zet deze module door naar de tabel die daar uitgelezen
// wordt, als één rij die de app zelf beheert.
//
// Bewust géén "alles wissen en opnieuw schrijven": in een tabel van een ander
// systeem kunnen rijen staan die niet van ons zijn. De app onthoudt daarom het
// id van haar eigen rij en werkt alleen die bij.
import { createDriver, describeDbError } from "./db/index";
import type { DbConfig, DbDriver } from "./db/types";
import { config } from "./config";
import { getSync, saveSettings } from "./settings";
import { getCurrent, type Assignment } from "./rotation";

export interface SyncResult {
  /** Wat er nu in de doeltabel staat, of null als er niemand dienst heeft. */
  assignment: Assignment | null;
  /** "insert" | "update" | "unchanged" | "skipped" */
  action: string;
  rowId: number | null;
}

/** Zoekt het id van de rij die we zojuist schreven (Postgres kent geen insertId). */
async function findRowId(db: DbDriver, target: DbConfig, start: string): Promise<number | null> {
  const table = db.quoteId(target.table);
  const rows = await db.all<{ pc_id: number }>(
    `SELECT pc_id FROM ${table} WHERE pc_startterm = ? ORDER BY pc_id DESC LIMIT 1`,
    [start]
  );
  return rows[0]?.pc_id ?? null;
}

/**
 * Zet de dienst die nu loopt door naar het telefoniesysteem. Geeft terug wat
 * er gebeurd is, zodat de instellingenpagina dat kan tonen.
 */
export async function syncCurrent(): Promise<SyncResult> {
  const sync = getSync();
  if (!sync.enabled) {
    return { assignment: null, action: "skipped", rowId: sync.rowId };
  }

  const current = await getCurrent();
  if (!current) {
    // Niemand ingepland: de bestaande rij laten staan is veiliger dan het
    // doorschakelnummer leeghalen, want dan komt er niemand meer aan de lijn.
    return { assignment: null, action: "skipped", rowId: sync.rowId };
  }

  const target = sync.target;
  const db = createDriver(target);

  try {
    await db.init();
    const table = db.quoteId(target.table);
    const values = [
      current.week_start,
      current.week_end,
      config.rotation.periodValue,
      current.name,
      current.phone,
    ];

    let action = "update";
    let rowId = sync.rowId;

    if (rowId !== null) {
      const updated = await db.run(
        `UPDATE ${table}
            SET pc_startterm = ?, pc_endterm = ?, pc_period = ?,
                pc_description = ?, pc_telnum = ?
          WHERE pc_id = ?`,
        [...values, rowId]
      );
      if (updated.affectedRows === 0) {
        // Onze rij is daar weggehaald; dan maken we hem opnieuw aan.
        rowId = null;
      }
    }

    if (rowId === null) {
      const inserted = await db.run(
        `INSERT INTO ${table} (pc_startterm, pc_endterm, pc_period, pc_description, pc_telnum)
         VALUES (?, ?, ?, ?, ?)`,
        values
      );
      rowId = inserted.insertId || (await findRowId(db, target, current.week_start));
      action = "insert";
    }

    await saveSettings({
      sync: { ...sync, rowId, lastSyncedAt: new Date().toISOString() },
    });

    console.log(
      `[sync] ${current.name} (${current.phone}) doorgezet naar ` +
        `${target.driver}:${target.table} (rij ${rowId}).`
    );
    return { assignment: current, action, rowId };
  } catch (err) {
    throw new Error(describeDbError(err));
  } finally {
    await db.close().catch(() => {});
  }
}

/** Leest terug wat er nu in de doeltabel staat, voor de controle in de UI. */
export async function readSyncedRow(): Promise<{
  name: string;
  phone: string;
  week_start: string;
} | null> {
  const sync = getSync();
  if (sync.rowId === null) return null;

  const db = createDriver(sync.target);
  try {
    await db.init();
    const table = db.quoteId(sync.target.table);
    const rows = await db.all<{ name: string; phone: string; week_start: string }>(
      `SELECT pc_description AS name, pc_telnum AS phone, pc_startterm AS week_start
         FROM ${table} WHERE pc_id = ?`,
      [sync.rowId]
    );
    return rows[0] ?? null;
  } catch (err) {
    throw new Error(describeDbError(err));
  } finally {
    await db.close().catch(() => {});
  }
}
