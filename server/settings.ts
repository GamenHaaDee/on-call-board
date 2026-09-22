// Instellingen die via de setup- en instellingenpagina worden vastgelegd.
//
// Waar ze staan:
//   - rooster, rotatie, mail, tijdzone en admin-token: in de database, in de
//     tabel SETTINGS_TABLE (standaard "rotacall_settings");
//   - de verbindingsgegevens van die database zelf: in SETUP_FILE, want die
//     kunnen niet staan in wat ze zelf ontsluiten.
//
// Volgorde van voorrang, per instelling:
//   1. environment variables (ROSTER, DB_*, ROTATION_*, SMTP_*, ADMIN_TOKEN)
//   2. wat er is opgeslagen (database, of het bestand als de database niet kan)
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
import {
  clearSettingsTable,
  readSettingsTable,
  writeSettingsTable,
} from "./db/settings-store";
import { describeDbError } from "./db/index";
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

/**
 * De instellingen staan in de database (tabel `SETTINGS_TABLE`), behalve de
 * verbindingsgegevens van die database zelf: die kunnen daar niet in staan en
 * blijven in `SETUP_FILE` of in environment variables.
 *
 * Het lezen gebeurt één keer bij het opstarten en na elke wijziging; de rest
 * van de app leest daarna uit deze cache, zodat de bestaande (synchrone)
 * functies kunnen blijven zoals ze zijn.
 */
let cached: StoredSettings | null | undefined;

/** Staat van de laatste laadpoging uit de database. */
let dbState: { loaded: boolean; error: string | null; fromFile: boolean } = {
  loaded: false,
  error: null,
  fromFile: false,
};

/** Wat er in het bestand staat (verbindingsgegevens, en vóór de migratie meer). */
function readFile(): StoredSettings | null {
  if (!existsSync(config.setupFile)) return null;
  try {
    return JSON.parse(readFileSync(config.setupFile, "utf8")) as StoredSettings;
  } catch {
    console.warn(`[settings] ${config.setupFile} kon niet gelezen worden — genegeerd.`);
    return null;
  }
}

function writeFile(next: StoredSettings): void {
  mkdirSync(path.dirname(config.setupFile), { recursive: true });
  // Het bestand kan het databasewachtwoord bevatten: alleen voor de eigenaar.
  writeFileSync(config.setupFile, JSON.stringify(next, null, 2) + "\n", {
    encoding: "utf8",
    mode: 0o600,
  });
}

function readStored(): StoredSettings | null {
  if (cached !== undefined) return cached;
  // Nog niet uit de database geladen: het bestand is de beste gok. Dit gebeurt
  // alleen vóór loadSettings(), bijvoorbeeld bij het openen van de database.
  cached = readFile();
  return cached;
}

/** Onderdelen die in de database horen (de rest blijft in het bestand). */
const DB_KEYS = ["roster", "rotation", "mail", "timezone", "adminToken", "savedAt"] as const;

function pickDbKeys(source: StoredSettings): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of DB_KEYS) {
    if (source[key] !== undefined) out[key] = source[key];
  }
  return out;
}

/**
 * Leest de instellingen uit de database en zet ze in de cache. Staat er nog
 * niets in, maar wél in het bestand, dan verhuizen die eenmalig mee.
 * Lukt de database niet (onbereikbaar, of geen rechten om de tabel te maken),
 * dan werkt de app door met het bestand en wordt dat gemeld.
 */
export async function loadSettings(): Promise<void> {
  const file = readFile() ?? {};

  try {
    const stored = (await readSettingsTable(config.settingsTable)) ?? {};

    const hasInDb = DB_KEYS.some((key) => stored[key] !== undefined);
    const hasInFile = DB_KEYS.some((key) => file[key] !== undefined);

    if (!hasInDb && hasInFile) {
      // Eenmalige verhuizing van bestand naar database.
      const moving = pickDbKeys(file);
      await writeSettingsTable(config.settingsTable, moving);
      Object.assign(stored, moving);

      // Het bestand houdt alleen nog de verbindingsgegevens over, zodat er
      // maar één bron van waarheid is.
      writeFile({ database: file.database });
      console.log(
        `[settings] Instellingen verhuisd naar de tabel "${config.settingsTable}"; ` +
          `${config.setupFile} bevat nu alleen nog de databasegegevens.`
      );
    } else if (hasInFile) {
      // De database is leidend, maar het bestand bevat nog oude kopieën
      // (inclusief wachtwoorden). Die horen daar niet meer te staan.
      writeFile({ database: file.database });
      console.log(`[settings] Oude kopie in ${config.setupFile} opgeruimd.`);
    }

    cached = { ...stored, database: file.database } as StoredSettings;
    dbState = { loaded: true, error: null, fromFile: false };
  } catch (err) {
    const reason = describeDbError(err);
    cached = file;
    dbState = { loaded: true, error: reason, fromFile: true };
    console.warn(
      `[settings] Instellingen konden niet uit de database gelezen worden ` +
        `(${reason}). De app gebruikt ${config.setupFile}.`
    );
  }
}

/** Zijn de instellingen geladen, en waar kwamen ze vandaan? */
export function settingsStatus() {
  return { ...dbState };
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
  if (envRoster !== null) return true;
  const stored = readStored();
  // Een rooster is het bewijs dat de setup is doorlopen; de losse
  // databasegegevens in het bestand zeggen daar niets over.
  return Array.isArray(stored?.roster) && stored.roster.length > 0;
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
export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = readStored() ?? {};
  const next: StoredSettings = {
    ...current,
    ...patch,
    savedAt: new Date().toISOString(),
  };

  // De verbindingsgegevens gaan naar het bestand: die kunnen niet in de
  // database staan waartoe ze zelf de toegang zijn.
  if (next.database !== undefined) {
    writeFile({ database: next.database });
  }

  if (dbState.fromFile) {
    // De database was niet bruikbaar; dan gaat alles (zoals vroeger) naar het
    // bestand, zodat instellingen niet stilletjes verdwijnen.
    writeFile(next);
    cached = next;
    console.warn(`[settings] Opgeslagen in ${config.setupFile} (database niet beschikbaar).`);
    return getSettings();
  }

  await writeSettingsTable(config.settingsTable, pickDbKeys(next));
  cached = next;
  console.log(`[settings] Opgeslagen in de tabel "${config.settingsTable}".`);
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
export async function deleteSettings(): Promise<void> {
  // De verbindingsgegevens blijven staan: zonder die gegevens kan de app de
  // database niet meer bereiken om de setup opnieuw te doen.
  const file = readFile();
  await clearSettingsTable(config.settingsTable).catch((err) =>
    console.warn(`[settings] Tabel legen mislukt: ${(err as Error).message}`)
  );

  if (file?.database) {
    writeFile({ database: file.database });
  } else {
    rmSync(config.setupFile, { force: true });
  }
  rmSync(config.mailStateFile, { force: true });

  cached = undefined;
  console.log("[settings] Instellingen gewist. De app is weer ongeconfigureerd.");
}
