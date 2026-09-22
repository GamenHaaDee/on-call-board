// Snelle inspectie van de piket-tabel (werkt met sqlite én mysql).
//   npm run server:inspect
import { getDbConfig, getTimezone, loadSettings } from "./settings";
import { nowInZone } from "./timezone";
import { getDb, closeDb } from "./db/index";

interface Row {
  pc_id: number;
  pc_startterm: string;
  pc_endterm: string;
  pc_description: string | null;
  pc_telnum: string;
}

async function main() {
  await loadSettings();
  const db = await getDb();
  const dbConfig = getDbConfig();
  const table = db.quoteId(dbConfig.table);

  const [{ n }] = await db.all<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`);
  console.log(`Database: ${dbConfig.driver} (tijdzone: ${getTimezone()})`);
  console.log(`Tabel ${dbConfig.table}: ${n} rijen`);

  const now = nowInZone(getTimezone());
  const rows = await db.all<Row>(
    `SELECT pc_id, pc_startterm, pc_endterm, pc_description, pc_telnum FROM ${table}
      WHERE pc_endterm >= ? ORDER BY pc_startterm ASC LIMIT 20`,
    [now]
  );
  console.log("Komende weken:");
  rows.forEach((r) =>
    console.log(
      "  ",
      String(r.pc_id).padStart(3),
      r.pc_startterm,
      "->",
      r.pc_endterm,
      "|",
      String(r.pc_description ?? "").padEnd(10),
      "|",
      r.pc_telnum
    )
  );

  const current = await db.all<Pick<Row, "pc_description" | "pc_telnum">>(
    `SELECT pc_description, pc_telnum FROM ${table}
      WHERE pc_startterm <= ? AND pc_endterm >= ?
      ORDER BY pc_startterm DESC LIMIT 1`,
    [now, now]
  );
  console.log("NU bereikbaar:", current[0]?.pc_description ?? "—", current[0]?.pc_telnum ?? "");
}

main()
  .catch((e) => {
    console.error("FOUT:", e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb().catch(() => {});
  });
