// Koppeling met Zabbix.
//
// Zabbix stuurt zijn meldingen naar een gebruiker, niet naar een nummer. De
// opzet is daarom: één vaste gebruiker (bijvoorbeeld "Bereikbaarheidsdienst")
// waar alle acties naartoe melden, en wij zetten elke rotatie het mobiele
// nummer van de dienstdoende persoon in de SMS-media van die gebruiker. In
// Zabbix zelf hoeft daarna niets meer gewijzigd te worden.
//
// Net als bij het telefoniesysteem wordt alleen aangeraakt wat van ons is: de
// overige media van die gebruiker (bijvoorbeeld e-mail) blijven staan, en er
// wordt nooit iets verwijderd.
import { getCurrent, type Assignment } from "./rotation";
import { getZabbix, saveSettings, type ZabbixSettings } from "./settings";

/** Zo lang mag één aanroep duren; Zabbix achter een trage proxy mag even. */
const TIMEOUT_MS = 15_000;

export interface ZabbixUser {
  userid: string;
  username: string;
  name?: string;
  surname?: string;
}

export interface ZabbixMediaType {
  mediatypeid: string;
  name: string;
  /** 0 = e-mail, 1 = script, 2 = sms, 4 = webhook. */
  type: string;
}

export interface ZabbixInfo {
  version: string;
  users: ZabbixUser[];
  mediaTypes: ZabbixMediaType[];
}

export interface ZabbixResult {
  /** "update" | "insert" | "unchanged" | "skipped" */
  action: string;
  assignment: Assignment | null;
  /** Wat er nu in Zabbix staat, voor zover wij het weten. */
  sendto: string | null;
}

interface Media {
  mediaid?: string;
  mediatypeid: string;
  sendto: string;
  active?: number | string;
  severity?: number | string;
  period?: string;
}

interface Session {
  url: string;
  version: string;
  /** Token in de Authorization-header (Zabbix 6.4 en nieuwer). */
  bearer?: string;
  /** Token in het verzoek zelf (ouder dan 6.4). */
  auth?: string;
  /** Hebben we zelf ingelogd? Dan ook weer uitloggen. */
  loggedIn: boolean;
}

/** Zabbix luistert op api_jsonrpc.php; een adres zonder dat stuk mag ook. */
export function apiUrl(raw: string): string {
  const url = raw.trim().replace(/\/+$/, "");
  if (!url) throw new Error("Vul het adres van Zabbix in");
  if (!/^https?:\/\//i.test(url)) {
    throw new Error(`Het adres moet met http:// of https:// beginnen: ${url}`);
  }
  return /api_jsonrpc\.php$/i.test(url) ? url : `${url}/api_jsonrpc.php`;
}

function versionParts(version: string): [number, number] {
  const [major, minor] = version.split(".").map((n) => Number(n) || 0);
  return [major ?? 0, minor ?? 0];
}

/** Vanaf 6.4 hoort het token in de Authorization-header. */
function usesHeader(version: string): boolean {
  const [major, minor] = versionParts(version);
  return major > 6 || (major === 6 && minor >= 4);
}

/** "username" heet in versies vóór 5.4 nog "alias". */
function userField(version: string): "username" | "alias" {
  const [major, minor] = versionParts(version);
  return major > 5 || (major === 5 && minor >= 4) ? "username" : "alias";
}

/** De media-lijst heet in versies vóór 5.2 nog "user_medias". */
function mediasField(version: string): "medias" | "user_medias" {
  const [major, minor] = versionParts(version);
  return major > 5 || (major === 5 && minor >= 2) ? "medias" : "user_medias";
}

/** Eén aanroep naar de Zabbix-API. Fouten komen er leesbaar uit. */
async function rpc<T>(
  url: string,
  method: string,
  params: unknown,
  session?: Session
): Promise<T> {
  const body: Record<string, unknown> = { jsonrpc: "2.0", method, params, id: 1 };
  const headers: Record<string, string> = { "Content-Type": "application/json-rpc" };

  if (session?.bearer) headers.Authorization = `Bearer ${session.bearer}`;
  else if (session?.auth) body.auth = session.auth;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const reason = (err as Error).name === "TimeoutError" ? "geen antwoord" : (err as Error).message;
    throw new Error(`Zabbix op ${url} is niet bereikbaar (${reason}).`);
  }

  const text = await response.text();
  let payload: { result?: T; error?: { message: string; data?: string } };
  try {
    payload = JSON.parse(text);
  } catch {
    // Een verkeerd adres levert de inlogpagina op in plaats van JSON.
    throw new Error(
      `Geen JSON-antwoord van ${url} (status ${response.status}). ` +
        `Klopt het adres? Het eindigt meestal op /api_jsonrpc.php.`
    );
  }

  if (payload.error) {
    const detail = payload.error.data ? `: ${payload.error.data}` : "";
    throw new Error(`Zabbix (${method}) ${payload.error.message}${detail}`);
  }
  return payload.result as T;
}

/** Verbinding opzetten: versie opvragen en, als er geen token is, inloggen. */
async function connect(settings: ZabbixSettings): Promise<Session> {
  const url = apiUrl(settings.url);
  // apiinfo.version is het enige dat zonder aanmelden mag; meteen een nette
  // controle of we met een Zabbix-API praten.
  const version = await rpc<string>(url, "apiinfo.version", {});

  if (settings.token) {
    return usesHeader(version)
      ? { url, version, bearer: settings.token, loggedIn: false }
      : { url, version, auth: settings.token, loggedIn: false };
  }

  if (!settings.user) {
    throw new Error("Vul een API-token in, of een gebruikersnaam met wachtwoord.");
  }

  const sessionId = await rpc<string>(url, "user.login", {
    [userField(version)]: settings.user,
    password: settings.password,
  });
  return usesHeader(version)
    ? { url, version, bearer: sessionId, loggedIn: true }
    : { url, version, auth: sessionId, loggedIn: true };
}

async function withSession<T>(
  settings: ZabbixSettings,
  fn: (session: Session) => Promise<T>
): Promise<T> {
  const session = await connect(settings);
  try {
    return await fn(session);
  } finally {
    // Alleen opruimen wat we zelf hebben aangemaakt; een API-token blijft.
    if (session.loggedIn) {
      await rpc(session.url, "user.logout", {}, session).catch(() => {});
    }
  }
}

/**
 * Verbinding controleren en meteen ophalen waaruit gekozen kan worden: de
 * gebruikers en de media-types van deze Zabbix.
 */
export async function testZabbix(settings: ZabbixSettings): Promise<ZabbixInfo> {
  return withSession(settings, async (session) => {
    const field = userField(session.version);
    const users = await rpc<Record<string, string>[]>(
      session.url,
      "user.get",
      { output: ["userid", field, "name", "surname"], sortfield: field },
      session
    );
    const mediaTypes = await rpc<ZabbixMediaType[]>(
      session.url,
      "mediatype.get",
      { output: ["mediatypeid", "name", "type"], sortfield: "name" },
      session
    );

    return {
      version: session.version,
      users: users.map((u) => ({
        userid: u.userid,
        username: u[field] ?? u.userid,
        name: u.name,
        surname: u.surname,
      })),
      mediaTypes,
    };
  });
}

/** Alleen de velden die user.update accepteert; de rest geeft een foutmelding. */
function cleanMedia(media: Media): Media {
  const out: Media = { mediatypeid: String(media.mediatypeid), sendto: media.sendto };
  if (media.mediaid !== undefined) out.mediaid = String(media.mediaid);
  if (media.active !== undefined) out.active = Number(media.active);
  if (media.severity !== undefined) out.severity = Number(media.severity);
  if (media.period !== undefined) out.period = media.period;
  return out;
}

/**
 * Zet het nummer van de dienstdoende persoon in de SMS-media van de ingestelde
 * Zabbix-gebruiker. De overige media van die gebruiker blijven zoals ze zijn.
 */
export async function syncZabbix(): Promise<ZabbixResult> {
  const settings = getZabbix();
  if (!settings.enabled) return { action: "skipped", assignment: null, sendto: null };

  if (!settings.userId || !settings.mediaTypeId) {
    throw new Error("Kies eerst de Zabbix-gebruiker en het media-type voor sms.");
  }

  const current = await getCurrent();
  // Niemand ingepland of geen nummer bekend: laten staan wat er staat. Een
  // leeg nummer betekent dat een melding bij niemand aankomt.
  if (!current) return { action: "skipped", assignment: null, sendto: null };
  const phone = current.phone.trim();
  if (!phone) return { action: "skipped", assignment: current, sendto: null };

  return withSession(settings, async (session) => {
    const users = await rpc<{ userid: string; medias?: Media[] }[]>(
      session.url,
      "user.get",
      { output: ["userid"], userids: [settings.userId], selectMedias: "extend" },
      session
    );
    const user = users[0];
    if (!user) {
      throw new Error(`Zabbix-gebruiker ${settings.userId} bestaat niet (meer).`);
    }

    const medias = (user.medias ?? []).map(cleanMedia);
    const ours = medias.filter((m) => m.mediatypeid === settings.mediaTypeId);
    let action: string;

    if (ours.length === 0) {
      // Nog geen sms-media op deze gebruiker: aanmaken, altijd actief, alle
      // ernstniveaus, de hele week. Daarna is het aan Zabbix zelf.
      medias.push({
        mediatypeid: settings.mediaTypeId,
        sendto: phone,
        active: 0,
        severity: 63,
        period: "1-7,00:00-24:00",
      });
      action = "insert";
    } else if (ours.every((m) => m.sendto === phone)) {
      action = "unchanged";
    } else {
      for (const media of ours) media.sendto = phone;
      action = "update";
    }

    if (action !== "unchanged") {
      await rpc(
        session.url,
        "user.update",
        { userid: settings.userId, [mediasField(session.version)]: medias },
        session
      );
      console.log(
        `[zabbix] ${current.name} (${phone}) gezet op gebruiker ${settings.userId}, ` +
          `media-type ${settings.mediaTypeId}.`
      );
    }

    await saveSettings({
      zabbix: { ...settings, lastSyncedAt: new Date().toISOString(), lastValue: phone },
    });

    return { action, assignment: current, sendto: phone };
  });
}

/** Leest terug welk nummer er nu in Zabbix staat, voor de controle in de UI. */
export async function readZabbixMedia(): Promise<string | null> {
  const settings = getZabbix();
  if (!settings.userId || !settings.mediaTypeId) return null;

  return withSession(settings, async (session) => {
    const users = await rpc<{ medias?: Media[] }[]>(
      session.url,
      "user.get",
      { output: ["userid"], userids: [settings.userId], selectMedias: "extend" },
      session
    );
    const media = (users[0]?.medias ?? []).find(
      (m) => String(m.mediatypeid) === settings.mediaTypeId
    );
    return media?.sendto ?? null;
  });
}
