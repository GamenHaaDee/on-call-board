import { config } from "./config";
import { getDbConfig, getRoster, getRotation, getTimezone } from "./settings";
import { nowInZone, zonedToUtc } from "./timezone";
import { getDb, closeDb } from "./db/index";

const DAY_MS = 24 * 60 * 60 * 1000;

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
  const anchor = parseDate(getRotation().anchorDate);
  const dateOnly = parseDate(formatDate(date));
  return Math.floor((dateOnly.getTime() - anchor.getTime()) / (7 * DAY_MS));
}

function weekStartDate(index: number): Date {
  return addDays(parseDate(getRotation().anchorDate), index * 7);
}

/**
 * Vult de piket-tabel aan met komende weken volgens de vaste rotatie.
 * Bestaande rijen (zelfde pc_startterm) worden niet gedupliceerd; verleden
 * weken worden overgeslagen. Schrijft NIETS over wat er al staat.
 */
export async function ensureAssignments(now = new Date()): Promise<void> {
  const roster = getRoster();
  if (roster.length === 0) {
    console.warn("[rotation] Nog geen rooster ingesteld — niets te plannen.");
    return;
  }

  const rotation = getRotation();
  const db = await getDb();
  const TABLE = db.quoteId(getDbConfig().table);
  const startIndex = weekIndex(now);
  let inserted = 0;

  for (let i = 0; i <= rotation.weeksAhead; i++) {
    const index = startIndex + i;
    const personIdx = ((index % roster.length) + roster.length) % roster.length;
    const person = roster[personIdx];

    const startStr = `${formatDate(weekStartDate(index))} ${rotation.startTime}`;
    const endStr = `${formatDate(weekStartDate(index + 1))} ${rotation.endTime}`;

    // Verleden weken overslaan (einde van de week in de ingestelde tijdzone).
    if (zonedToUtc(endStr, getTimezone()) < now) {
      continue;
    }

    const existing = await db.all<{ n: number }>(
      `SELECT COUNT(*) AS n FROM ${TABLE} WHERE pc_startterm = ?`,
      [startStr]
    );
    if (existing[0].n > 0) continue;

    await db.run(
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
  const db = await getDb();
  const TABLE = db.quoteId(getDbConfig().table);
  const now = nowInZone(getTimezone());
  const rows = await db.all<Assignment>(
    `SELECT ${SELECT_COLS} FROM ${TABLE}
      WHERE pc_startterm <= ? AND pc_endterm >= ?
      ORDER BY pc_startterm DESC LIMIT 1`,
    [now, now]
  );
  return rows[0] ?? null;
}

export async function getUpcoming(weeks: number): Promise<Assignment[]> {
  const db = await getDb();
  const TABLE = db.quoteId(getDbConfig().table);
  // LIMIT accepteert geen parameter in beide dialecten; daarom als gevalideerd
  // geheel getal in de query.
  const limit = Math.max(1, Math.min(52, Math.trunc(Number(weeks) || 8)));
  return db.all<Assignment>(
    `SELECT ${SELECT_COLS} FROM ${TABLE}
      WHERE pc_endterm >= ?
      ORDER BY pc_startterm ASC
      LIMIT ${limit}`,
    [nowInZone(getTimezone())]
  );
}

/** Past de bereikbare persoon van één bestaande week aan (vakantie/omzetting). */
export async function updateAssignment(
  id: number,
  name: string,
  phone: string
): Promise<boolean> {
  const db = await getDb();
  const TABLE = db.quoteId(getDbConfig().table);
  const result = await db.run(
    `UPDATE ${TABLE} SET pc_description = ?, pc_telnum = ? WHERE pc_id = ?`,
    [name, phone, id]
  );
  return result.affectedRows > 0;
}

export async function getById(id: number): Promise<Assignment | null> {
  const db = await getDb();
  const TABLE = db.quoteId(getDbConfig().table);
  const rows = await db.all<Assignment>(`SELECT ${SELECT_COLS} FROM ${TABLE} WHERE pc_id = ?`, [id]);
  return rows[0] ?? null;
}

/** Eén rij zoals hij in een back-upbestand staat. */
export interface AssignmentRow {
  week_start: string;
  week_end: string;
  period: number;
  name: string;
  phone: string;
}

/** Alle weken uit de tabel — voor de export/back-up. */
export async function exportAssignments(): Promise<AssignmentRow[]> {
  const db = await getDb();
  const TABLE = db.quoteId(getDbConfig().table);
  return db.all<AssignmentRow>(
    `SELECT pc_startterm AS week_start, pc_endterm AS week_end, pc_period AS period,
            pc_description AS name, pc_telnum AS phone
       FROM ${TABLE} ORDER BY pc_startterm ASC`
  );
}

/**
 * Weken uit een back-up terugzetten. Bestaande weken (zelfde pc_startterm)
 * blijven staan, zodat importeren nooit iets overschrijft.
 */
export async function importAssignments(rows: AssignmentRow[]): Promise<number> {
  const db = await getDb();
  const TABLE = db.quoteId(getDbConfig().table);
  let imported = 0;

  for (const row of rows) {
    const weekStart = String(row?.week_start ?? "").trim();
    const weekEnd = String(row?.week_end ?? "").trim();
    const name = String(row?.name ?? "").trim();
    const phone = String(row?.phone ?? "").trim();
    if (!weekStart || !weekEnd || !phone) continue;

    const existing = await db.all<{ n: number }>(
      `SELECT COUNT(*) AS n FROM ${TABLE} WHERE pc_startterm = ?`,
      [weekStart]
    );
    if (existing[0].n > 0) continue;

    await db.run(
      `INSERT INTO ${TABLE} (pc_startterm, pc_endterm, pc_period, pc_description, pc_telnum)
       VALUES (?, ?, ?, ?, ?)`,
      [weekStart, weekEnd, Number(row.period ?? config.rotation.periodValue) || 0, name, phone]
    );
    imported++;
  }

  if (imported > 0) console.log(`[rotation] ${imported} week(en) geïmporteerd.`);
  return imported;
}

/** Wist alle weken uit de tabel (alleen vanuit de reset-knop). */
export async function deleteAllAssignments(): Promise<number> {
  const db = await getDb();
  const TABLE = db.quoteId(getDbConfig().table);
  const result = await db.run(`DELETE FROM ${TABLE}`);
  return result.affectedRows;
}

/** Sluit de databaseverbinding (bij afsluiten van de server). */
export async function closePool(): Promise<void> {
  await closeDb();
}
