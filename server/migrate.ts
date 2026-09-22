// Bestaande rijen uit MySQL/MariaDB of PostgreSQL overzetten naar een
// sqlite-bestand, zodat er geen aparte databaseserver meer nodig is.
//
//   npm run server:migrate
//
// Bron = de database die nu is ingesteld (env of instellingenpagina),
// doel = het sqlite-bestand (SQLITE_FILE, standaard data/rotacall.db).
// Rijen die er in sqlite al staan (zelfde pc_startterm) worden overgeslagen,
// dus het script mag opnieuw draaien.
import { config } from "./config";
import { createDriver } from "./db/index";
import { getDbConfig } from "./settings";

interface Row {
  pc_startterm: string;
  pc_endterm: string;
  pc_period: number;
  pc_description: string | null;
  pc_telnum: string;
}

async function main() {
  const sourceConfig = getDbConfig();
  if (sourceConfig.driver === "sqlite") {
    throw new Error(
      "De huidige database is al sqlite. Stel eerst MySQL/PostgreSQL in als bron " +
        "(via .env of de instellingenpagina) en draai dit script daarna."
    );
  }

  const targetFile = config.db.defaultFile;
  const source = createDriver(sourceConfig);
  const target = createDriver({ ...sourceConfig, driver: "sqlite", file: targetFile });

  await source.init();
  await target.init();

  const sourceTable = source.quoteId(sourceConfig.table);
  const targetTable = target.quoteId(sourceConfig.table);

  const rows = await source.all<Row>(
    `SELECT pc_startterm, pc_endterm, pc_period, pc_description, pc_telnum
       FROM ${sourceTable} ORDER BY pc_startterm ASC`
  );
  console.log(`[migrate] ${rows.length} rijen gevonden in ${sourceConfig.driver}.`);

  let copied = 0;
  let skipped = 0;
  for (const row of rows) {
    const existing = await target.all<{ n: number }>(
      `SELECT COUNT(*) AS n FROM ${targetTable} WHERE pc_startterm = ?`,
      [row.pc_startterm]
    );
    if (existing[0].n > 0) {
      skipped++;
      continue;
    }
    await target.run(
      `INSERT INTO ${targetTable} (pc_startterm, pc_endterm, pc_period, pc_description, pc_telnum)
       VALUES (?, ?, ?, ?, ?)`,
      [row.pc_startterm, row.pc_endterm, row.pc_period, row.pc_description, row.pc_telnum]
    );
    copied++;
  }

  await source.close();
  await target.close();
  console.log(`[migrate] Klaar: ${copied} gekopieerd, ${skipped} overgeslagen (bestond al).`);
  console.log(`[migrate] Zet de database nu op sqlite — bestand: ${targetFile}`);
}

main().catch((err) => {
  console.error("[migrate] Mislukt:", err.message);
  process.exit(1);
});
