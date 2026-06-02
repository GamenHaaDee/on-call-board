import "dotenv/config";
import mysql from "mysql2/promise";

async function main() {
  const t = process.env.DB_TABLE!;
  const c = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    dateStrings: true,
    connectTimeout: 8000,
  });
  const [cnt] = await c.query<any[]>(`SELECT COUNT(*) n FROM \`${t}\``);
  console.log(`Tabel ${t}: ${cnt[0].n} rijen`);
  const [rows] = await c.query<any[]>(
    `SELECT pc_id,pc_startterm,pc_endterm,pc_description,pc_telnum FROM \`${t}\`
     WHERE pc_startterm >= '2026-06-01' ORDER BY pc_startterm ASC`
  );
  console.log("Vanaf juni:");
  rows.forEach((r) =>
    console.log("  ", String(r.pc_id).padStart(2), r.pc_startterm, "->", r.pc_endterm, "|", String(r.pc_description).padEnd(8), "|", r.pc_telnum)
  );
  const [cur] = await c.query<any[]>(
    `SELECT pc_description,pc_telnum FROM \`${t}\` WHERE NOW() BETWEEN pc_startterm AND pc_endterm ORDER BY pc_startterm DESC LIMIT 1`
  );
  console.log("NU bereikbaar:", cur[0]?.pc_description, cur[0]?.pc_telnum);
  await c.end();
}

main().catch((e) => {
  console.error("FOUT:", e.code ?? "", e.message);
  process.exit(1);
});
