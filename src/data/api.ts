import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { OnCallEntry } from "./onCallSchedule";

export interface Person {
  index: number;
  name: string;
  phone: string;
}

// Vorm zoals de backend hem teruggeeft (zie server/rotation.ts).
interface ApiAssignment {
  id: number;
  week_start: string;
  week_end: string;
  person_id: number | null;
  name: string;
  phone: string;
}

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

/**
 * Fout met de HTTP-status erbij, zodat een pagina "token vereist" (401) kan
 * onderscheiden van "server onbereikbaar" (status 0) en daar iets anders over
 * kan zeggen dan "er ging iets mis".
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// DB geeft DATETIME als "2026-03-02 12:00:00"; maak er ISO van zodat
// date-fns parseISO het begrijpt.
const toIso = (s: string) => s.replace(" ", "T");

function toEntry(a: ApiAssignment): OnCallEntry {
  return {
    id: String(a.id),
    name: a.name,
    phone: a.phone,
    startDate: toIso(a.week_start),
    endDate: toIso(a.week_end),
  };
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`Request mislukt: ${res.status}`);
  return res.json() as Promise<T>;
}

export function useCurrentOnCall() {
  return useQuery({
    queryKey: ["oncall", "current"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/oncall/current`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Request mislukt: ${res.status}`);
      return toEntry(await res.json());
    },
  });
}

export function useOnCallSchedule(weeks = 8) {
  return useQuery({
    queryKey: ["oncall", "schedule", weeks],
    queryFn: async () => {
      const data = await fetchJson<ApiAssignment[]>(`/api/oncall/schedule?weeks=${weeks}`);
      return data.map(toEntry);
    },
  });
}

// --- Gedeelde vormen voor setup + instellingen ---

export type DbDriver = "sqlite" | "mysql" | "postgres";

export interface RosterPerson {
  name: string;
  phone: string;
  email?: string;
}

export interface DatabaseSettings {
  driver: DbDriver;
  file: string;
  url: string;
  host: string;
  port: number;
  user: string;
  /** Alleen meesturen als de gebruiker een nieuw wachtwoord intypt. */
  password?: string;
  database: string;
  table: string;
  /** Alleen in antwoorden: staat er een wachtwoord opgeslagen? */
  passwordSet?: boolean;
}

export interface MailSettings {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password?: string;
  from: string;
  cc: string;
  notifyOnStart: boolean;
  reminderHoursBefore: number;
  attachIcs: boolean;
  subject: string;
  body: string;
  passwordSet?: boolean;
}

export interface RotationSettings {
  anchorDate: string;
  startTime: string;
  endTime: string;
  weeksAhead: number;
}

export interface AppSettings {
  roster: RosterPerson[];
  rotation: RotationSettings;
  /** Lege waarde = de tijdzone van de server volgen. */
  timezone: string;
  /** Welke zone dat op dit moment is. */
  timezoneEffective: string;
  serverTimezone: string;
  timezoneFromEnv: boolean;
  database: DatabaseSettings;
  mail: MailSettings;
  adminTokenSet: boolean;
  /** Database vastgezet via environment variables? Dan is hij niet wijzigbaar. */
  dbFromEnv: boolean;
  savedAt?: string;
}

async function sendJson<T>(path: string, method: "POST" | "PUT", body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-admin-token": getAdminToken(),
    },
    body: JSON.stringify(body),
  });
  if (res.status === 401) {
    throw new ApiError("Niet geautoriseerd. Controleer het admin-token.", 401);
  }
  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    throw new ApiError(payload?.error ?? `Verzoek mislukt (${res.status})`, res.status);
  }
  return res.json() as Promise<T>;
}

// --- Setup (eerste gebruik) ---

export interface SetupStatus {
  configured: boolean;
  defaults: {
    anchorDate: string;
    startTime: string;
    endTime: string;
    weeksAhead: number;
    database: { driver: DbDriver; table: string; port: number };
    timezone: string;
  };
  driver: DbDriver;
  dbFromEnv: boolean;
  serverTimezone: string;
  timezoneFromEnv: boolean;
}

export interface AssignmentRow {
  week_start: string;
  week_end: string;
  period?: number;
  name: string;
  phone: string;
}

/** Vorm van een back-upbestand (zie GET /api/settings/export). */
export interface BackupFile {
  app?: string;
  version?: number;
  exportedAt?: string;
  includesSecrets?: boolean;
  settings: {
    roster: RosterPerson[];
    rotation: RotationSettings;
    timezone?: string;
    database: DatabaseSettings;
    mail: MailSettings;
  };
  assignments: AssignmentRow[];
}

export interface SetupPayload {
  roster: RosterPerson[];
  anchorDate: string;
  startTime: string;
  endTime: string;
  weeksAhead: number;
  adminToken: string;
  database: DatabaseSettings;
  timezone: string;
  mail?: MailSettings;
  /** Weken uit een back-up die teruggezet moeten worden. */
  assignments?: AssignmentRow[];
}

export function useSetupStatus() {
  return useQuery({
    queryKey: ["setup", "status"],
    queryFn: () => fetchJson<SetupStatus>("/api/setup/status"),
    staleTime: 60_000,
  });
}

export function useSaveSetup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: SetupPayload) =>
      sendJson<{ ok: true; imported: number }>("/api/setup", "POST", payload),
    onSuccess: () => {
      qc.invalidateQueries();
    },
  });
}

/** Verbinding testen zonder op te slaan (setup én instellingen). */
export function useTestDatabase() {
  return useMutation({
    mutationFn: (database: DatabaseSettings) =>
      sendJson<{ ok: true }>("/api/settings/database/test", "POST", database),
  });
}

// --- Instellingen ---

export function useSettings(enabled = true) {
  return useQuery({
    queryKey: ["settings"],
    enabled,
    queryFn: async () => {
      let res: Response;
      try {
        res = await fetch(`${API_BASE}/api/settings`, {
          headers: { "x-admin-token": getAdminToken() },
        });
      } catch {
        // Geen antwoord: server plat, verkeerde poort, of geen netwerk.
        throw new ApiError("De server reageert niet", 0);
      }
      if (!res.ok) throw new ApiError(`Verzoek mislukt (${res.status})`, res.status);
      return res.json() as Promise<AppSettings>;
    },
    retry: false,
  });
}

export interface SettingsPatch {
  roster?: RosterPerson[];
  rotation?: RotationSettings;
  timezone?: string;
  database?: DatabaseSettings;
  mail?: MailSettings;
  adminToken?: string;
}

export function useSaveSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: SettingsPatch) => sendJson<AppSettings>("/api/settings", "PUT", patch),
    onSuccess: (data) => {
      qc.setQueryData(["settings"], data);
      qc.invalidateQueries({ queryKey: ["oncall"] });
      qc.invalidateQueries({ queryKey: ["people"] });
    },
  });
}

/** SMTP controleren (zonder `to`) of een testbericht sturen (met `to`). */
export function useTestMail() {
  return useMutation({
    mutationFn: (vars: { mail: MailSettings; to?: string }) =>
      sendJson<{ ok: true; sent?: boolean; verified?: boolean }>(
        "/api/settings/mail/test",
        "POST",
        vars
      ),
  });
}

/** Back-up downloaden als JSON-bestand. */
export function useExportBackup() {
  return useMutation({
    mutationFn: async (includeSecrets: boolean) => {
      const res = await fetch(
        `${API_BASE}/api/settings/export${includeSecrets ? "?secrets=1" : ""}`,
        { headers: { "x-admin-token": getAdminToken() } }
      );
      if (res.status === 401) throw new ApiError("Niet geautoriseerd. Controleer het admin-token.", 401);
      if (!res.ok) throw new Error(`Export mislukt: ${res.status}`);

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `rotacall-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    },
  });
}

/** Alles terug naar af; de app toont daarna weer de setup-pagina. */
export function useResetApp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (wipeData: boolean) =>
      sendJson<{ ok: true; deleted: number }>("/api/settings/reset", "POST", { wipeData }),
    onSuccess: () => {
      qc.clear();
    },
  });
}

/** De openstaande dienstmelding nu versturen. */
export function useRunMail() {
  return useMutation({
    mutationFn: () =>
      sendJson<{ ok: true; sent: number; recipient: string | null }>(
        "/api/settings/mail/run",
        "POST",
        {}
      ),
  });
}

// --- Admin ---

const TOKEN_KEY = "onduty-admin-token";
export const getAdminToken = () => localStorage.getItem(TOKEN_KEY) ?? "";
export const setAdminToken = (t: string) => localStorage.setItem(TOKEN_KEY, t);

export function useAdminStatus() {
  return useQuery({
    queryKey: ["admin", "status"],
    queryFn: () => fetchJson<{ authRequired: boolean }>("/api/admin/status"),
  });
}

export function usePeople() {
  return useQuery({
    queryKey: ["people"],
    queryFn: () => fetchJson<Person[]>("/api/people"),
  });
}

export function useUpdateAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string; name: string; phone: string }) => {
      const res = await fetch(`${API_BASE}/api/oncall/${vars.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-admin-token": getAdminToken(),
        },
        body: JSON.stringify({ name: vars.name, phone: vars.phone }),
      });
      if (res.status === 401) throw new ApiError("Niet geautoriseerd. Controleer het admin-token.", 401);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Opslaan mislukt: ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["oncall"] });
    },
  });
}
