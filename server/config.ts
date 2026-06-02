import "dotenv/config";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === "") {
    throw new Error(`Ontbrekende environment variable: ${name}`);
  }
  return value;
}

export interface RosterPerson {
  name: string; // voornaam, komt in pc_description
  phone: string; // lokaal formaat, komt in pc_telnum (bv. 0612345678)
}

// Geordende rotatielijst (volgorde bepaalt de wisseling). Geladen in volgorde:
//   1. env ROSTER  (JSON-array, bv. ingesteld in Portainer)
//   2. server/roster.json        (lokaal, NIET in git — echte gegevens)
//   3. server/roster.example.json (voorbeeld, wel in git)
// Zo blijven persoonsgegevens uit een publieke repo.
function loadRoster(): RosterPerson[] {
  if (process.env.ROSTER) {
    try {
      const parsed = JSON.parse(process.env.ROSTER);
      if (Array.isArray(parsed)) return parsed;
      console.warn("[config] ROSTER is geen JSON-array — genegeerd.");
    } catch {
      console.warn("[config] ROSTER kon niet als JSON gelezen worden — genegeerd.");
    }
  }
  for (const file of ["roster.json", "roster.example.json"]) {
    const p = path.join(__dirname, file);
    if (existsSync(p)) {
      try {
        return JSON.parse(readFileSync(p, "utf8"));
      } catch {
        console.warn(`[config] ${file} kon niet gelezen worden.`);
      }
    }
  }
  return [];
}

export const roster: RosterPerson[] = loadRoster();

export const config = {
  port: Number(process.env.PORT ?? 3001),

  db: {
    host: required("DB_HOST", "localhost"),
    port: Number(process.env.DB_PORT ?? 3306),
    user: required("DB_USER"),
    password: required("DB_PASSWORD"),
    database: required("DB_NAME"),
    // Naam van de BESTAANDE piket-tabel die 3CX uitleest.
    table: process.env.DB_TABLE ?? "piket",
  },

  rotation: {
    // Ankerdatum = een maandag waarop de EERSTE persoon uit `roster` (index 0)
    // aan de beurt is. Vanaf hier roteert de lijst elke week door.
    anchorDate: process.env.ROTATION_ANCHOR_DATE ?? "2026-03-02",
    // Wisselmoment binnen de dag (bestaande conventie: maandag 12:00).
    startTime: process.env.ROTATION_START_TIME ?? "12:00:00",
    endTime: process.env.ROTATION_END_TIME ?? "11:59:00",
    // Waarde voor pc_period (bestaande rijen gebruiken 0).
    periodValue: Number(process.env.ROTATION_PERIOD_VALUE ?? 0),
    // Hoeveel weken vooruit de planning wordt aangevuld.
    weeksAhead: Number(process.env.ROTATION_WEEKS_AHEAD ?? 12),
  },

  // Cron voor het aanvullen van de planning. Standaard elke maandag 00:05.
  cronSchedule: process.env.CRON_SCHEDULE ?? "5 0 * * 1",

  // Optioneel wachtwoord/token voor de admin-pagina. Als dit leeg is, is de
  // admin-pagina onbeveiligd (alleen geschikt voor een intern netwerk).
  adminToken: process.env.ADMIN_TOKEN ?? "",

  staticDir: process.env.STATIC_DIR ?? "dist",
};
