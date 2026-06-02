import { config, roster } from "./config.js";
import { query, pool } from "./db.js";

const DAY_MS = 24 * 60 * 60 * 1000;

// Tabelnaam komt uit config en wordt als identifier ge-quote. Valideer streng
// (identifiers kunnen niet als parameter; daarom een whitelist-check).
const TABLE = (() => {
  const t = config.db.table;
  if (!/^[A-Za-z0-9_]+$/.test(t)) {
    throw new Error(`Ongeldige tabelnaam in DB_TABLE: ${t}`);
  }
  return "`" + t + "`";
})();

function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * DAY_MS);
}

/** Index van de rotatieweek waarin `date` valt (kan negatief zijn). */
function weekIndex(date: Date): number {
  const anchor = parseDate(config.rotation.anchorDate);
  const dateOnly = parseDate(formatDate(date));
  return Math.floor((dateOnly.getTime() - anchor.getTime()) / (7 * DAY_MS));
}

function weekStartDate(index: number): Date {
  return addDays(parseDate(config.rotation.anchorDate), index * 7);
}

/**
 * Vult de bestaande piket-tabel aan met komende weken volgens de vaste rotatie.
 * Bestaande rijen (zelfde pc_startterm) worden niet gedupliceerd; verleden
 * weken worden overgeslagen. Schrijft NIETS over wat er al staat.
 */
export async function ensureAssignments(now = new Date()): Promise<void> {
  if (roster.length === 0) {
    console.warn("[rotation] Lege roster — niets te plannen.");
    return;
  }

  const startIndex = weekIndex(now);
  let inserted = 0;

  for (let i = 0; i <= config.rotation.weeksAhead; i++) {
    const index = startIndex + i;
    const personIdx = ((index % roster.length) + roster.length) % roster.length;
    const person = roster[personIdx];

    const startStr = `${formatDate(weekStartDate(index))} ${config.rotation.startTime}`;
    const endStr = `${formatDate(weekStartDate(index + 1))} ${config.rotation.endTime}`;

    // Verleden weken overslaan.
    if (new Date(`${formatDate(weekStartDate(index + 1))}T${config.rotation.endTime}`) < now) {
      continue;
    }

    const existing = await query<{ n: number }>(
      `SELECT COUNT(*) AS n FROM ${TABLE} WHERE pc_startterm = ?`,
      [startStr]
    );
    if (existing[0].n > 0) continue;

    await query(
      `INSERT INTO ${TABLE} (pc_startterm, pc_endterm, pc_period, pc_description, pc_telnum)
       VALUES (?, ?, ?, ?, ?)`,
      [startStr, endStr, config.rotation.periodValue, person.name, person.phone]
    );
    inserted++;
  }

  if (inserted > 0) console.log(`[rotation] ${inserted} nieuwe week(en) toegevoegd.`);
}

export interface Assignment {
  id: number;
  week_start: string;
  week_end: string;
  name: string;
  phone: string;
}

const SELECT_COLS =
  "pc_id AS id, pc_startterm AS week_start, pc_endterm AS week_end, pc_description AS name, pc_telnum AS phone";

export async function getCurrent(): Promise<Assignment | null> {
  const rows = await query<Assignment>(
    `SELECT ${SELECT_COLS} FROM ${TABLE}
      WHERE NOW() BETWEEN pc_startterm AND pc_endterm
      ORDER BY pc_startterm DESC LIMIT 1`
  );
  return rows[0] ?? null;
}

export async function getUpcoming(weeks: number): Promise<Assignment[]> {
  return query<Assignment>(
    `SELECT ${SELECT_COLS} FROM ${TABLE}
      WHERE pc_endterm >= NOW()
      ORDER BY pc_startterm ASC
      LIMIT ?`,
    [String(Math.max(1, Math.min(52, weeks)))]
  );
}

/** Past de bereikbare persoon van één bestaande week aan (vakantie/omzetting). */
export async function updateAssignment(
  id: number,
  name: string,
  phone: string
): Promise<boolean> {
  const result = await query<any>(
    `UPDATE ${TABLE} SET pc_description = ?, pc_telnum = ? WHERE pc_id = ?`,
    [name, phone, id]
  );
  // mysql2 geeft bij UPDATE een OkPacket terug i.p.v. een rij-array.
  const ok = result as unknown as { affectedRows?: number };
  return (ok.affectedRows ?? 0) > 0;
}

export async function getById(id: number): Promise<Assignment | null> {
  const rows = await query<Assignment>(`SELECT ${SELECT_COLS} FROM ${TABLE} WHERE pc_id = ?`, [
    String(id),
  ]);
  return rows[0] ?? null;
}

export async function closePool(): Promise<void> {
  await pool.end();
}
