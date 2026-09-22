// Tijdzone-hulpjes. De planning staat als "wandklok"-tijd in de database
// ("2026-03-02 12:00:00"), zonder zone. Welke zone daarbij hoort is instelbaar;
// leeg betekent: de tijdzone van de server zelf (de TZ-omgevingsvariabele).
//
// Alles hieronder gebruikt Intl, dus zonder extra dependency.

/** Controleert of een IANA-naam als "Europe/Amsterdam" bestaat. */
export function isValidTimezone(zone: string): boolean {
  if (!zone) return true; // leeg = servertijdzone
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** De tijdzone die de server zelf gebruikt (fallback als er niets is ingesteld). */
export function serverTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
}

const FORMATTERS = new Map<string, Intl.DateTimeFormat>();

function formatter(zone: string): Intl.DateTimeFormat {
  const key = zone || serverTimezone();
  let found = FORMATTERS.get(key);
  if (!found) {
    found = new Intl.DateTimeFormat("en-CA", {
      timeZone: key,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    FORMATTERS.set(key, found);
  }
  return found;
}

/** Een moment als "2026-03-02 12:00:00" in de opgegeven zone. */
export function formatInZone(date: Date, zone: string): string {
  const parts = formatter(zone).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "00";
  // en-CA geeft 24-uurs notatie, maar middernacht soms als "24".
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")} ${hour}:${get("minute")}:${get("second")}`;
}

/** Hoe nu laat het is in de opgegeven zone, als "jjjj-mm-dd uu:mm:ss". */
export function nowInZone(zone: string, now = new Date()): string {
  return formatInZone(now, zone);
}

/** Verschil tussen de zone en UTC op dat moment, in milliseconden. */
function offsetMs(date: Date, zone: string): number {
  return Date.parse(`${formatInZone(date, zone).replace(" ", "T")}Z`) - date.getTime();
}

/**
 * Zet een wandklok-tijd uit de database om naar het echte moment (UTC).
 * Twee rondes, zodat het ook klopt vlak rond een zomertijdwissel.
 */
export function zonedToUtc(local: string, zone: string): Date {
  const asIfUtc = Date.parse(`${local.trim().replace(" ", "T")}Z`);
  if (Number.isNaN(asIfUtc)) {
    throw new Error(`Ongeldige datum/tijd: ${local}`);
  }
  let moment = new Date(asIfUtc);
  for (let i = 0; i < 2; i++) {
    moment = new Date(asIfUtc - offsetMs(moment, zone));
  }
  return moment;
}

/** Lijst met beschikbare zones, voor de keuzelijst in de instellingen. */
export function availableTimezones(): string[] {
  const supported = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] })
    .supportedValuesOf;
  try {
    return supported ? supported("timeZone") : [];
  } catch {
    return [];
  }
}
