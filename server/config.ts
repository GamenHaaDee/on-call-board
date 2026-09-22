import "dotenv/config";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { DbDriverName } from "./db/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface RosterPerson {
  name: string; // voornaam, komt in pc_description
  phone: string; // lokaal formaat, komt in pc_telnum (bv. 0612345678)
  email?: string; // optioneel, voor de dienstmeldingen per mail
}

// Geordende rotatielijst uit de omgeving (volgorde bepaalt de wisseling):
//   1. env ROSTER        (JSON-array, bv. ingesteld in Portainer)
//   2. server/roster.json (lokaal, NIET in git — echte gegevens)
// Staat geen van beide er, dan komt het rooster uit de setup-/instellingen-
// pagina (zie server/settings.ts). Zo blijven persoonsgegevens uit een
// publieke repo.
function loadEnvRoster(): RosterPerson[] | null {
  if (process.env.ROSTER) {
    try {
      const parsed = JSON.parse(process.env.ROSTER);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      console.warn("[config] ROSTER is geen gevulde JSON-array — genegeerd.");
    } catch {
      console.warn("[config] ROSTER kon niet als JSON gelezen worden — genegeerd.");
    }
  }
  const file = path.join(__dirname, "roster.json");
  if (existsSync(file)) {
    try {
      const parsed = JSON.parse(readFileSync(file, "utf8"));
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch {
      console.warn("[config] roster.json kon niet gelezen worden.");
    }
  }
  return null;
}

/** Rooster uit env/bestand, of null als het uit de instellingen moet komen. */
export const envRoster: RosterPerson[] | null = loadEnvRoster();

/** Of een instelling expliciet (en niet leeg) in de omgeving is gezet. */
export const envHas = (name: string) => (process.env[name] ?? "").trim() !== "";

/** Tekst uit de omgeving, of undefined als hij er niet (zinvol) staat. */
export const envText = (name: string): string | undefined =>
  envHas(name) ? (process.env[name] as string).trim() : undefined;

/** Getal uit de omgeving; lege waarden (bv. uit docker-compose) tellen niet. */
export function envNumber(name: string, fallback: number): number {
  if (!envHas(name)) return fallback;
  const value = Number(process.env[name]);
  if (!Number.isFinite(value)) {
    throw new Error(`Ongeldige waarde voor ${name}: ${process.env[name]}`);
  }
  return value;
}

/** Ja/nee uit de omgeving ("1", "true", "yes", "on" = waar). */
export const envBool = (name: string): boolean | undefined =>
  envHas(name) ? ["1", "true", "yes", "on"].includes(envText(name)!.toLowerCase()) : undefined;

const DRIVER_ALIASES: Record<string, DbDriverName> = {
  sqlite: "sqlite",
  sqlite3: "sqlite",
  mysql: "mysql",
  mariadb: "mysql",
  postgres: "postgres",
  postgresql: "postgres",
  pg: "postgres",
};

/** DB_DRIVER uit de omgeving, of null als de gebruiker zelf mag kiezen. */
export function envDriver(): DbDriverName | null {
  const raw = envText("DB_DRIVER")?.toLowerCase();
  if (!raw) return null;
  const driver = DRIVER_ALIASES[raw];
  if (!driver) {
    throw new Error(`Onbekende DB_DRIVER: ${raw} (gebruik "sqlite", "mysql" of "postgres")`);
  }
  return driver;
}

export const config = {
  port: envNumber("PORT", 3001),

  // Standaarden voor de database; de werkelijke waarden stelt server/settings.ts
  // samen uit environment variables + wat in de instellingen is opgeslagen.
  db: {
    defaultFile: path.resolve(
      envText("SQLITE_FILE") ?? path.join(process.cwd(), "data", "rotacall.db")
    ),
    defaultTable: envText("DB_TABLE") ?? "period_config",
  },

  rotation: {
    // Ankerdatum = een maandag waarop de EERSTE persoon uit het rooster
    // (index 0) aan de beurt is. Vanaf hier roteert de lijst elke week door.
    anchorDate: envText("ROTATION_ANCHOR_DATE") ?? "2026-03-02",
    // Wisselmoment binnen de dag (bestaande conventie: maandag 12:00).
    startTime: envText("ROTATION_START_TIME") ?? "12:00:00",
    endTime: envText("ROTATION_END_TIME") ?? "11:59:00",
    // Waarde voor pc_period (bestaande rijen gebruiken 0).
    periodValue: envNumber("ROTATION_PERIOD_VALUE", 0),
    // Hoeveel weken vooruit de planning wordt aangevuld.
    weeksAhead: envNumber("ROTATION_WEEKS_AHEAD", 12),
  },

  // Cron voor het aanvullen van de planning. Standaard elke maandag 00:05.
  cronSchedule: envText("CRON_SCHEDULE") ?? "5 0 * * 1",

  // Hoe vaak gekeken wordt of er een dienstmelding verstuurd moet worden.
  mailCheckSchedule: envText("MAIL_CHECK_SCHEDULE") ?? "*/5 * * * *",

  // Optioneel wachtwoord/token voor de admin- en instellingenpagina. Als dit
  // leeg is, zijn die pagina's onbeveiligd (alleen op een intern netwerk doen).
  adminToken: envText("ADMIN_TOKEN") ?? "",

  staticDir: envText("STATIC_DIR") ?? "dist",

  // Instellingen uit de setup-/instellingenpagina worden hier bewaard.
  setupFile: path.resolve(envText("SETUP_FILE") ?? path.join(process.cwd(), "data", "setup.json")),

  // Bijhouden welke dienstmeldingen al verstuurd zijn.
  mailStateFile: path.resolve(
    envText("MAIL_STATE_FILE") ?? path.join(process.cwd(), "data", "mail-state.json")
  ),
};
