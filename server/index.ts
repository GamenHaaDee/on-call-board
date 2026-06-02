import express from "express";
import cors from "cors";
import cron from "node-cron";
import { existsSync } from "node:fs";
import path from "node:path";
import { config, roster } from "./config.js";
import {
  ensureAssignments,
  getCurrent,
  getUpcoming,
  getById,
  updateAssignment,
  closePool,
} from "./rotation.js";

const app = express();
app.use(cors());
app.use(express.json());

// Beschermt schrijf-acties met een token (indien ADMIN_TOKEN is ingesteld).
function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (config.adminToken && req.header("x-admin-token") !== config.adminToken) {
    return res.status(401).json({ error: "Niet geautoriseerd" });
  }
  next();
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

// Laat weten of de admin-pagina een token vereist (zonder het token te lekken).
app.get("/api/admin/status", (_req, res) => {
  res.json({ authRequired: Boolean(config.adminToken) });
});

// Het vaste rooster (voor de keuzelijst op de admin-pagina).
app.get("/api/people", (_req, res) => {
  res.json(roster.map((p, index) => ({ index, name: p.name, phone: p.phone })));
});

// Wie is er NU bereikbaar.
app.get("/api/oncall/current", async (_req, res) => {
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
app.get("/api/oncall/schedule", async (req, res) => {
  try {
    const weeks = Number(req.query.weeks ?? 8);
    res.json(await getUpcoming(weeks));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Databasefout" });
  }
});

// Een bestaande week aanpassen (bv. bij vakantie een invaller invullen).
app.put("/api/oncall/:id", requireAdmin, async (req, res) => {
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

// Optioneel: gebouwde frontend (dist) meeserveren in dezelfde container.
const staticDir = path.resolve(config.staticDir);
if (existsSync(staticDir)) {
  app.use(express.static(staticDir));
  app.get("*", (_req, res) => res.sendFile(path.join(staticDir, "index.html")));
  console.log(`[server] Frontend geserveerd vanuit ${staticDir}`);
}

async function start() {
  // Bij opstarten meteen de planning bijwerken…
  await ensureAssignments().catch((err) => console.error("[cron] init mislukt:", err));

  // …en daarna volgens schema (standaard: elke maandag 00:05).
  cron.schedule(config.cronSchedule, () => {
    console.log("[cron] Planning bijwerken…");
    ensureAssignments().catch((err) => console.error("[cron] mislukt:", err));
  });

  app.listen(config.port, () => {
    console.log(`[server] Luistert op poort ${config.port} (cron: "${config.cronSchedule}")`);
  });
}

start();

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, async () => {
    await closePool().catch(() => {});
    process.exit(0);
  });
}
