// Instellingen die via de setup- en instellingenpagina worden vastgelegd.
//
// Volgorde van voorrang, per instelling:
//   1. environment variables (ROSTER, DB_*, ROTATION_*, SMTP_*, ADMIN_TOKEN)
//   2. data/setup.json — ingevuld via de browser
//   3. de standaardwaarden uit config.ts
//
// Zo blijft een installatie die alles via .env/Portainer regelt ongewijzigd
// werken, en heeft een verse installatie geen .env nodig.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  config,
  envBool,
  envDriver,
  envHas,
  envNumber,
  envRoster,
  envText,
  type RosterPerson,
} from "./config";
import type { DbConfig, DbDriverName } from "./db/types";
import { isValidTimezone, serverTimezone } from "./timezone";

export interface RotationSettings {
  anchorDate: string;
  startTime: string;
  endTime: string;
  weeksAhead: number;
}

export interface MailSettings {
  /** Meldingen versturen? */
  enabled: boolean;
  host: string;
  port: number;
  /** true = TLS vanaf de verbinding (poort 465), false = STARTTLS (587). */
  secure: boolean;
  user: string;
  password: string;
  /** Afzender, bv. "RotaCall <rota@example.com>". */
  from: string;
  /** Extra ontvangers (bv. een teamadres) naast de dienstdoende. */
  cc: string;
  /** Mail sturen zodra iemands dienst begint. */
  notifyOnStart: boolean;
  /** Aantal uren vooraf herinneren (0 = uit). */
  reminderHoursBefore: number;
  /** Agendabestand (.ics) meesturen, zodat de dienst in Outlook/MS365 komt. */
  attachIcs: boolean;
  subject: string;
  /** Berichttekst; {{name}}, {{phone}}, {{start}} en {{end}} worden vervangen. */
  body: string;
}

export interface Settings {
  roster: RosterPerson[];
  /** IANA-naam, bv. "Europe/Amsterdam". Leeg = de tijdzone van de server. */
  timezone: string;
  rotation: RotationSettings;
  database: DbConfig;
  mail: MailSettings;
  adminToken: string;
  savedAt?: string;
}

/** Wat er daadwerkelijk in setup.json staat (alles optioneel). */
type StoredSettings = Partial<Omit<Settings, "roster">> & { roster?: RosterPerson[] };

export const DEFAULT_MAIL: MailSettings = {
  enabled: false,
  host: "",
  port: 587,
  secure: false,
  user: "",
  password: "",
  from: "",
  cc: "",
  notifyOnStart: true,
  reminderHoursBefore: 0,
  attachIcs: true,
  subject: "Je hebt vanaf nu dienst",
  body:
    "Hoi {{name}},\n\n" +
    "Vanaf {{start}} tot {{end}} ben jij bereikbaar voor storingen op {{phone}}.\n\n" +
    "Groet,\nRotaCall",
};

let cached: StoredSettings | null | undefined;

function readStored(): StoredSettings | null {
  if (cached !== undefined) return cached;
  cached = null;
  if (existsSync(config.setupFile)) {
    try {
      cached = JSON.parse(readFileSync(config.setupFile, "utf8")) as StoredSettings;
    } catch {
      console.warn(`[settings] ${config.setupFile} kon niet gelezen worden — genegeerd.`);
    }
  }
  return cached;
}

/** Het actuele rooster (leeg zolang er niets is ingesteld). */
export function getRoster(): RosterPerson[] {
  return envRoster ?? readStored()?.roster ?? [];
}

export function getRotation(): RotationSettings {
  const saved = readStored()?.rotation;
  return {
    anchorDate: envHas("ROTATION_ANCHOR_DATE")
      ? config.rotation.anchorDate
      : (saved?.anchorDate ?? config.rotation.anchorDate),
    startTime: envHas("ROTATION_START_TIME")
      ? config.rotation.startTime
      : (saved?.startTime ?? config.rotation.startTime),
    endTime: envHas("ROTATION_END_TIME")
      ? config.rotation.endTime
      : (saved?.endTime ?? config.rotation.endTime),
    weeksAhead: envHas("ROTATION_WEEKS_AHEAD")
      ? config.rotation.weeksAhead
      : (saved?.weeksAhead ?? config.rotation.weeksAhead),
  };
}

/** Verbindingsgegevens van de database (env wint per veld). */
export function getDbConfig(): DbConfig {
  const saved = readStored()?.database;
  const driver: DbDriverName = envDriver() ?? saved?.driver ?? "sqlite";
  return {
    driver,
    file: envText("SQLITE_FILE") ?? saved?.file ?? config.db.defaultFile,
    url: envText("DATABASE_URL") ?? saved?.url ?? "",
    host: envText("DB_HOST") ?? saved?.host ?? "localhost",
    port: envHas("DB_PORT")
      ? envNumber("DB_PORT", 0)
      : (saved?.port ?? (driver === "postgres" ? 5432 : 3306)),
    user: envText("DB_USER") ?? saved?.user ?? "",
    password: envText("DB_PASSWORD") ?? saved?.password ?? "",
    database: envText("DB_NAME") ?? saved?.database ?? "",
    table: envText("DB_TABLE") ?? saved?.table ?? config.db.defaultTable,
  };
}

/** Of de database vastligt in de omgeving (dan mag de UI hem niet wijzigen). */
export function isDbFromEnv(): boolean {
  return envDriver() !== null;
}

export function getMail(): MailSettings {
  const saved = readStored()?.mail;
  const merged: MailSettings = { ...DEFAULT_MAIL, ...saved };
  return {
    ...merged,
    enabled: envBool("SMTP_ENABLED") ?? merged.enabled,
    host: envText("SMTP_HOST") ?? merged.host,
    port: envHas("SMTP_PORT") ? envNumber("SMTP_PORT", merged.port) : merged.port,
    secure: envBool("SMTP_SECURE") ?? merged.secure,
    user: envText("SMTP_USER") ?? merged.user,
    password: envText("SMTP_PASSWORD") ?? merged.password,
    from: envText("SMTP_FROM") ?? merged.from,
  };
}

/** De ingestelde tijdzone zoals opgeslagen (leeg = volg de server). */
export function getTimezoneSetting(): string {
  const fromEnv = envText("ROTACALL_TIMEZONE");
  const value = fromEnv ?? readStored()?.timezone ?? "";
  return isValidTimezone(value) ? value : "";
}

/** De tijdzone waarin de planning gelezen en geschreven wordt. */
export function getTimezone(): string {
  return getTimezoneSetting() || serverTimezone();
}

/** Staat de tijdzone vast via de omgeving? Dan is hij in de UI niet wijzigbaar. */
export function isTimezoneFromEnv(): boolean {
  return envText("ROTACALL_TIMEZONE") !== undefined;
}

export function getAdminToken(): string {
  return config.adminToken || readStored()?.adminToken || "";
}

/**
 * Is de app al ingericht? Zo niet, dan toont de frontend de setup-pagina en
 * mag POST /api/setup gebruikt worden (daarna niet meer).
 */
export function isConfigured(): boolean {
  return envRoster !== null || readStored() !== null;
}

/** Alle actuele instellingen bij elkaar (inclusief wachtwoorden). */
export function getSettings(): Settings {
  return {
    roster: getRoster(),
    timezone: getTimezoneSetting(),
    rotation: getRotation(),
    database: getDbConfig(),
    mail: getMail(),
    adminToken: getAdminToken(),
    savedAt: readStored()?.savedAt,
  };
}

/**
 * Instellingen (gedeeltelijk) opslaan. Wat niet meegegeven wordt, blijft staan.
 * Environment variables blijven bij het lezen altijd voorgaan.
 */
export function saveSettings(patch: Partial<Settings>): Settings {
  const current = readStored() ?? {};
  const next: StoredSettings = {
    ...current,
    ...patch,
    savedAt: new Date().toISOString(),
  };

  mkdirSync(path.dirname(config.setupFile), { recursive: true });
  // Het bestand bevat wachtwoorden: alleen leesbaar voor de eigenaar.
  writeFileSync(config.setupFile, JSON.stringify(next, null, 2) + "\n", {
    encoding: "utf8",
    mode: 0o600,
  });
  cached = next;
  console.log(`[settings] Opgeslagen in ${config.setupFile}`);
  return getSettings();
}

/** Alleen voor tests/hulpscripts: de cache vergeten. */
export function reloadSettings(): void {
  cached = undefined;
}

/**
 * Alle opgeslagen instellingen verwijderen: de app is daarna weer "nieuw" en
 * toont de setup-pagina. Raakt de database-inhoud niet aan (dat doet de
 * aanroeper desgewenst apart) en ook niet wat via environment variables
 * is ingesteld.
 */
export function deleteSettings(): void {
  rmSync(config.setupFile, { force: true });
  rmSync(config.mailStateFile, { force: true });
  cached = undefined;
  console.log("[settings] Instellingen gewist — de app is weer ongeconfigureerd.");
}
