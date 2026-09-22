import express from "express";
import cors from "cors";
import cron from "node-cron";
import { existsSync } from "node:fs";
import path from "node:path";
import { config, type RosterPerson } from "./config";
import { reopenDb, testConnection } from "./db/index";
import type { DbConfig, DbDriverName } from "./db/types";
import { sendDueNotifications, sendMail, verifyMail, buildMessage, fillTemplate } from "./mail";
import { isValidTimezone, serverTimezone } from "./timezone";
import {
  DEFAULT_MAIL,
  deleteSettings,
  getAdminToken,
  getTimezone,
  getTimezoneSetting,
  isTimezoneFromEnv,
  getDbConfig,
  getMail,
  getRoster,
  getRotation,
  getSettings,
  isConfigured,
  isDbFromEnv,
  loadSettings,
  saveSettings,
  settingsStatus,
  type MailSettings,
  type RotationSettings,
  type Settings,
} from "./settings";
import {
  deleteAllAssignments,
  ensureAssignments,
  exportAssignments,
  getById,
  getCurrent,
  getUpcoming,
  importAssignments,
  updateAssignment,
  type AssignmentRow,
} from "./rotation";

// Beschermt beheer-acties met een token (indien ingesteld).
function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  // Een onbereikbare database mag de beveiliging niet stilzwijgend uitzetten:
  // is het token daar niet uit te lezen, dan gaat beheer op slot. Met
  // ADMIN_TOKEN in de omgeving blijft beheer in dat geval wél werken.
  const status = settingsStatus();
  if (!status.loaded) {
    return res.status(503).json({ error: "Instellingen zijn nog niet geladen" });
  }
  const token = getAdminToken();
  if (status.fromFile && !token) {
    return res.status(503).json({
      error:
        "De instellingen konden niet uit de database gelezen worden, dus het " +
        "admin-token is onbekend. Herstel de database, of zet ADMIN_TOKEN in de omgeving.",
    });
  }
  if (token && req.header("x-admin-token") !== token) {
    return res.status(401).json({ error: "Niet geautoriseerd" });
  }
  next();
}

class ValidationError extends Error {}

const fail = (message: string): never => {
  throw new ValidationError(message);
};

// --- Validatie van wat er binnenkomt ---

function parseRoster(input: unknown): RosterPerson[] {
  if (!Array.isArray(input) || input.length === 0) {
    fail("Voeg minstens één persoon toe");
  }
  return (input as Record<string, unknown>[]).map((raw) => {
    const name = String(raw?.name ?? "").trim();
    const phone = String(raw?.phone ?? "").trim();
    const email = String(raw?.email ?? "").trim();
    if (!name || name.length > 45) fail("Naam is verplicht (max 45 tekens)");
    if (!/^[0-9+ ]{3,15}$/.test(phone)) fail(`Ongeldig telefoonnummer bij ${name}`);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(`Ongeldig e-mailadres bij ${name}`);
    return email ? { name, phone, email } : { name, phone };
  });
}

function parseRotation(input: unknown, fallback: RotationSettings): RotationSettings {
  const raw = (input ?? {}) as Record<string, unknown>;
  const anchorDate = String(raw.anchorDate ?? fallback.anchorDate);
  const startTime = String(raw.startTime ?? fallback.startTime);
  const endTime = String(raw.endTime ?? fallback.endTime);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(anchorDate)) fail("Ongeldige startdatum (jjjj-mm-dd)");
  if (new Date(`${anchorDate}T00:00:00Z`).getUTCDay() !== 1) {
    fail("De startdatum moet een maandag zijn");
  }
  for (const time of [startTime, endTime]) {
    if (!/^\d{2}:\d{2}:\d{2}$/.test(time)) fail("Ongeldig tijdstip (uu:mm:ss)");
  }

  const weeksAhead = Math.max(
    1,
    Math.min(52, Number(raw.weeksAhead) || fallback.weeksAhead)
  );
  return { anchorDate, startTime, endTime, weeksAhead };
}

const DRIVERS: DbDriverName[] = ["sqlite", "mysql", "postgres"];

function parseDatabase(input: unknown, fallback: DbConfig): DbConfig {
  const raw = (input ?? {}) as Record<string, unknown>;
  const driver = String(raw.driver ?? fallback.driver) as DbDriverName;
  if (!DRIVERS.includes(driver)) fail(`Onbekende database: ${driver}`);

  const table = String(raw.table ?? fallback.table).trim();
  if (!/^[A-Za-z0-9_]+$/.test(table)) fail("Ongeldige tabelnaam (letters, cijfers, _)");

  const next: DbConfig = {
    driver,
    table,
    file: String(raw.file ?? fallback.file).trim() || config.db.defaultFile,
    url: String(raw.url ?? fallback.url).trim(),
    host: String(raw.host ?? fallback.host).trim(),
    port: Number(raw.port ?? fallback.port) || (driver === "postgres" ? 5432 : 3306),
    user: String(raw.user ?? fallback.user).trim(),
    database: String(raw.database ?? fallback.database).trim(),
    // Leeg/afwezig wachtwoord betekent: laat het opgeslagen wachtwoord staan.
    password: raw.password === undefined ? fallback.password : String(raw.password),
  };

  if (driver !== "sqlite" && !next.url) {
    if (!next.host) fail("Vul de databaseserver (host) in");
    if (!next.database) fail("Vul de databasenaam in");
    if (!next.user) fail("Vul de databasegebruiker in");
  }
  return next;
}

function parseMail(input: unknown, fallback: MailSettings): MailSettings {
  const raw = (input ?? {}) as Record<string, unknown>;
  const bool = (value: unknown, previous: boolean) =>
    value === undefined ? previous : Boolean(value);

  const next: MailSettings = {
    enabled: bool(raw.enabled, fallback.enabled),
    host: String(raw.host ?? fallback.host).trim(),
    port: Number(raw.port ?? fallback.port) || DEFAULT_MAIL.port,
    secure: bool(raw.secure, fallback.secure),
    user: String(raw.user ?? fallback.user).trim(),
    password: raw.password === undefined ? fallback.password : String(raw.password),
    from: String(raw.from ?? fallback.from).trim(),
    cc: String(raw.cc ?? fallback.cc).trim(),
    notifyOnStart: bool(raw.notifyOnStart, fallback.notifyOnStart),
    reminderHoursBefore: Math.max(
      0,
      Math.min(168, Number(raw.reminderHoursBefore ?? fallback.reminderHoursBefore) || 0)
    ),
    attachIcs: bool(raw.attachIcs, fallback.attachIcs),
    subject: String(raw.subject ?? fallback.subject).trim() || DEFAULT_MAIL.subject,
    body: String(raw.body ?? fallback.body) || DEFAULT_MAIL.body,
  };

  if (next.enabled) {
    if (!next.host) fail("Vul de SMTP-server in");
    if (!next.from && !next.user) fail("Vul een afzender in");
  }
  for (const address of [next.from, next.cc].filter(Boolean)) {
    if (!/@/.test(address)) fail(`Ongeldig e-mailadres: ${address}`);
  }
  return next;
}

function parseTimezone(input: unknown): string {
  const zone = String(input ?? "").trim();
  if (!isValidTimezone(zone)) fail(`Onbekende tijdzone: ${zone}`);
  return zone;
}

/** Instellingen zoals ze naar de browser gaan: zonder wachtwoorden. */
function publicSettings(settings: Settings) {
  const { password: dbPassword, ...database } = settings.database;
  const { password: mailPassword, ...mail } = settings.mail;
  return {
    roster: settings.roster,
    rotation: settings.rotation,
    timezone: settings.timezone,
    // Wat "volg de server" op dit moment betekent, en of de zone vastligt.
    timezoneEffective: getTimezone(),
    serverTimezone: serverTimezone(),
    timezoneFromEnv: isTimezoneFromEnv(),
    database: { ...database, passwordSet: Boolean(dbPassword) },
    mail: { ...mail, passwordSet: Boolean(mailPassword) },
    adminTokenSet: Boolean(settings.adminToken),
    dbFromEnv: isDbFromEnv(),
    // false = opgeslagen in de database, true = teruggevallen op het bestand.
    settingsInFile: settingsStatus().fromFile,
    savedAt: settings.savedAt,
  };
}

/** Alleen de API-routes — bruikbaar als losse server én als vite-middleware. */
export function createApiRouter(): express.Router {
  const api = express.Router();
  api.use(express.json());

  api.get("/health", (_req, res) => {
    res.json({ ok: true, driver: getDbConfig().driver, configured: isConfigured() });
  });

  // Laat weten of de admin-/instellingenpagina een token vereist.
  api.get("/admin/status", (_req, res) => {
    res.json({ authRequired: Boolean(getAdminToken()) });
  });

  // Het rooster voor de keuzelijst op de admin-pagina (zonder e-mailadressen).
  api.get("/people", (_req, res) => {
    res.json(getRoster().map((p, index) => ({ index, name: p.name, phone: p.phone })));
  });

  // Wie is er NU bereikbaar.
  api.get("/oncall/current", async (_req, res) => {
    try {
      const current = await getCurrent();
      if (!current) return res.status(404).json({ error: "Geen actieve bereikbaarheid gevonden" });
      res.json(current);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Databasefout" });
    }
  });

  // Komende weken (voor de planning-lijst).
  api.get("/oncall/schedule", async (req, res) => {
    try {
      const weeks = Number(req.query.weeks ?? 8);
      res.json(await getUpcoming(weeks));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Databasefout" });
    }
  });

  // Een bestaande week aanpassen (bv. bij vakantie een invaller invullen).
  api.put("/oncall/:id", requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: "Ongeldig id" });
      }
      const name = String(req.body?.name ?? "").trim();
      const phone = String(req.body?.phone ?? "").trim();
      if (!name || name.length > 45) {
        return res.status(400).json({ error: "Naam is verplicht (max 45 tekens)" });
      }
      if (!/^[0-9+ ]{3,15}$/.test(phone)) {
        return res.status(400).json({ error: "Ongeldig telefoonnummer (max 15 tekens, cijfers/+)" });
      }

      const ok = await updateAssignment(id, name, phone);
      if (!ok) return res.status(404).json({ error: "Week niet gevonden" });
      res.json(await getById(id));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Databasefout" });
    }
  });

  // --- Eerste gebruik: setup-pagina ---

  api.get("/setup/status", (_req, res) => {
    const rotation = getRotation();
    const database = getDbConfig();
    res.json({
      configured: isConfigured(),
      // Voorgevulde waarden voor het formulier.
      defaults: {
        anchorDate: rotation.anchorDate,
        startTime: rotation.startTime,
        endTime: rotation.endTime,
        weeksAhead: rotation.weeksAhead,
        database: { driver: database.driver, table: database.table, port: database.port },
        timezone: getTimezoneSetting(),
      },
      driver: database.driver,
      dbFromEnv: isDbFromEnv(),
      serverTimezone: serverTimezone(),
      timezoneFromEnv: isTimezoneFromEnv(),
    });
  });

  // Eenmalig: database, rooster en rotatie vastleggen. Werkt alleen zolang de
  // app nog niet is ingericht — daarna is de instellingenpagina de plek.
  api.post("/setup", async (req, res) => {
    try {
      if (isConfigured()) {
        return res.status(409).json({ error: "De app is al ingericht" });
      }

      const body = req.body ?? {};
      const roster = parseRoster(body.roster);
      const rotation = parseRotation(body, getRotation());
      const database = parseDatabase(body.database, getDbConfig());
      const mail = body.mail ? parseMail(body.mail, getMail()) : getMail();
      const assignments: AssignmentRow[] = Array.isArray(body.assignments) ? body.assignments : [];

      // Eerst verbinden: een verkeerde database melden we vóór het opslaan.
      await testConnection(database).catch((err) => {
        fail(`Verbinden met de database mislukt: ${(err as Error).message}`);
      });

      // Eerst verbinden met de gekozen database: daar gaan de instellingen in.
      await reopenDb();
      await saveSettings({
        roster,
        rotation,
        database,
        mail,
        timezone: parseTimezone(body.timezone),
        adminToken: String(body.adminToken ?? "").trim(),
      });
      // Eerst een eventuele back-up terugzetten, daarna de rotatie aanvullen:
      // zo blijven herstelde (handmatig aangepaste) weken staan.
      const imported = assignments.length > 0 ? await importAssignments(assignments) : 0;
      await ensureAssignments();
      res.status(201).json({ ok: true, imported });
    } catch (err) {
      if (err instanceof ValidationError) {
        return res.status(400).json({ error: err.message });
      }
      console.error(err);
      res.status(500).json({ error: "Opslaan van de setup is mislukt" });
    }
  });

  // --- Instellingen (beheer) ---

  api.get("/settings", requireAdmin, (_req, res) => {
    res.json(publicSettings(getSettings()));
  });

  api.put("/settings", requireAdmin, async (req, res) => {
    try {
      const body = req.body ?? {};
      const current = getSettings();
      const patch: Partial<Settings> = {};

      if (body.roster !== undefined) patch.roster = parseRoster(body.roster);
      if (body.rotation !== undefined) {
        patch.rotation = parseRotation(body.rotation, current.rotation);
      }
      if (body.mail !== undefined) patch.mail = parseMail(body.mail, current.mail);
      if (body.timezone !== undefined) {
        if (isTimezoneFromEnv()) {
          fail("De tijdzone staat vast via environment variables (ROTACALL_TIMEZONE)");
        }
        patch.timezone = parseTimezone(body.timezone);
      }
      if (body.adminToken !== undefined) patch.adminToken = String(body.adminToken).trim();

      let databaseChanged = false;
      if (body.database !== undefined) {
        if (isDbFromEnv()) {
          fail("De database staat vast via environment variables (DB_DRIVER)");
        }
        const database = parseDatabase(body.database, current.database);
        await testConnection(database).catch((err) => {
          fail(`Verbinden met de database mislukt: ${(err as Error).message}`);
        });
        patch.database = database;
        databaseChanged = JSON.stringify(database) !== JSON.stringify(current.database);
      }

      if (databaseChanged) {
        // Naar de nieuwe database, en de instellingen daar neerzetten.
        await saveSettings({ database: patch.database });
        await reopenDb();
        await loadSettings();
      }
      const saved = await saveSettings(patch);
      // Rooster of rotatie gewijzigd? Dan meteen de ontbrekende weken bijvullen.
      await ensureAssignments().catch((err) => console.error("[settings] aanvullen:", err));

      res.json(publicSettings(saved));
    } catch (err) {
      if (err instanceof ValidationError) {
        return res.status(400).json({ error: err.message });
      }
      console.error(err);
      res.status(500).json({ error: "Opslaan van de instellingen is mislukt" });
    }
  });

  // Verbinding testen zonder iets op te slaan. Tijdens de setup mag dit zonder
  // token (er ís nog geen token); daarna alleen als beheerder.
  api.post("/settings/database/test", (req, res, next) => {
    if (!isConfigured()) return next();
    return requireAdmin(req, res, next);
  }, async (req, res) => {
    try {
      const database = parseDatabase(req.body, getDbConfig());
      await testConnection(database);
      res.json({ ok: true });
    } catch (err) {
      const message = err instanceof ValidationError ? err.message : (err as Error).message;
      res.status(400).json({ error: message });
    }
  });

  // SMTP-instellingen controleren, of een testbericht sturen.
  api.post("/settings/mail/test", requireAdmin, async (req, res) => {
    try {
      const mail = parseMail(req.body?.mail, getMail());
      const to = String(req.body?.to ?? "").trim();

      if (!to) {
        await verifyMail(mail);
        return res.json({ ok: true, verified: true });
      }

      const current = await getCurrent();
      const example = current ?? {
        id: 0,
        week_start: "2026-01-05 12:00:00",
        week_end: "2026-01-12 11:59:00",
        name: getRoster()[0]?.name ?? "RotaCall",
        phone: getRoster()[0]?.phone ?? "0600000000",
      };
      await sendMail(
        {
          to,
          subject: `[test] ${fillTemplate(mail.subject, example)}`,
          text: fillTemplate(mail.body, example),
        },
        mail
      );
      res.json({ ok: true, sent: true });
    } catch (err) {
      const message = err instanceof ValidationError ? err.message : (err as Error).message;
      res.status(400).json({ error: message });
    }
  });

  // Nu meteen de dienstmelding(en) versturen die openstaan.
  api.post("/settings/mail/run", requireAdmin, async (_req, res) => {
    try {
      const sent = await sendDueNotifications();
      const current = await getCurrent();
      const mail = getMail();
      res.json({
        ok: true,
        sent,
        // Handig in de UI: wie zou er nu bericht krijgen?
        recipient: current ? (buildMessage(current, mail)?.to ?? null) : null,
      });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // --- Back-up: exporteren en resetten ---

  // Alles in één JSON-bestand: instellingen + alle weken uit de tabel.
  // Met ?secrets=1 gaan ook de database- en SMTP-wachtwoorden mee.
  api.get("/settings/export", requireAdmin, async (req, res) => {
    try {
      const withSecrets = ["1", "true", "yes"].includes(String(req.query.secrets ?? ""));
      const settings = getSettings();
      const assignments = await exportAssignments().catch((err) => {
        console.warn("[export] Weken ophalen mislukt:", (err as Error).message);
        return [] as AssignmentRow[];
      });

      const payload = {
        app: "rotacall",
        version: 1,
        exportedAt: new Date().toISOString(),
        includesSecrets: withSecrets,
        settings: {
          roster: settings.roster,
          timezone: settings.timezone,
          rotation: settings.rotation,
          database: withSecrets
            ? settings.database
            : { ...settings.database, password: "" },
          mail: withSecrets ? settings.mail : { ...settings.mail, password: "" },
        },
        assignments,
      };

      const stamp = new Date().toISOString().slice(0, 10);
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="rotacall-backup-${stamp}.json"`);
      res.send(JSON.stringify(payload, null, 2));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Exporteren is mislukt" });
    }
  });

  // Alles terug naar af: de app toont daarna weer de setup-pagina. Met
  // wipeData worden ook de weken in de tabel verwijderd — let op bij een
  // tabel die door het telefoonsysteem gedeeld wordt.
  api.post("/settings/reset", requireAdmin, async (req, res) => {
    try {
      const wipeData = Boolean(req.body?.wipeData);
      let deleted = 0;
      if (wipeData) {
        deleted = await deleteAllAssignments();
      }

      await deleteSettings();
      await reopenDb().catch(() => {
        // Zonder instellingen kan verbinden mislukken; dat mag hier.
      });

      res.json({ ok: true, deleted });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Resetten is mislukt" });
    }
  });

  return api;
}

/**
 * Express-app met alleen de API op /api. Gebruikt door de vite-devserver,
 * zodat `npm run dev` één proces is (frontend + API).
 */
export function createApiApp(): express.Express {
  const app = express();
  app.use(cors());
  app.use("/api", createApiRouter());
  return app;
}

export interface AppOptions {
  /** Gebouwde frontend (dist/) meeserveren. Uit tijdens `npm run dev`. */
  serveStatic?: boolean;
}

export function createApp({ serveStatic = true }: AppOptions = {}): express.Express {
  const app = express();
  app.use(cors());
  app.use("/api", createApiRouter());

  if (serveStatic) {
    const staticDir = path.resolve(config.staticDir);
    if (existsSync(staticDir)) {
      app.use(express.static(staticDir));

      // De frontend regelt zijn eigen routes, dus onbekende paden krijgen de
      // pagina terug. Een pad met een bestandsextensie (/logo.svg, /iets.js)
      // is echter een bestand dat er niet is: daar hoort een 404 bij, anders
      // krijgt de browser HTML waar hij een afbeelding verwacht.
      app.get("*", (req, res) => {
        if (path.extname(req.path)) {
          return res.status(404).json({ error: "Niet gevonden" });
        }
        res.sendFile(path.join(staticDir, "index.html"));
      });
      console.log(`[server] Frontend geserveerd vanuit ${staticDir}`);
    } else {
      console.warn(
        `[server] Geen gebouwde frontend gevonden in ${staticDir} — draai eerst 'npm run build'.`
      );
    }
  }

  return app;
}

/**
 * Planning bij opstarten aanvullen en daarna volgens CRON_SCHEDULE, plus de
 * controle op te versturen dienstmeldingen. Geeft een stop-functie terug.
 */
export async function startScheduler(): Promise<() => void> {
  // Zonder instellingen weet de app niets: eerst laden, dan plannen.
  await loadSettings().catch((err) =>
    console.error("[settings] laden mislukt:", (err as Error).message)
  );
  await ensureAssignments().catch((err) => console.error("[cron] init mislukt:", err));

  const planning = cron.schedule(config.cronSchedule, () => {
    console.log("[cron] Planning bijwerken…");
    ensureAssignments().catch((err) => console.error("[cron] mislukt:", err));
  });

  const mailer = cron.schedule(config.mailCheckSchedule, () => {
    sendDueNotifications().catch((err) => console.error("[mail] controle mislukt:", err));
  });

  return () => {
    planning.stop();
    mailer.stop();
  };
}
