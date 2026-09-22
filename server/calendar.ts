// Agendabestand (.ics) bij de dienstmail, zodat de dienst in één klik in
// Outlook / Microsoft 365 (of Google Agenda, Apple Agenda) staat.
import { createHash } from "node:crypto";
import type { Assignment } from "./rotation";
import { zonedToUtc } from "./timezone";

/**
 * "2026-03-02 12:00:00" staat in de ingestelde tijdzone; iCalendar wil UTC
 * ("20260302T110000Z"). Zo klopt de afspraak ook als de server in een andere
 * zone draait dan het team.
 */
function toIcsUtc(value: string, zone: string): string {
  return zonedToUtc(value, zone)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

/** Regels mogen niet te lang zijn en speciale tekens moeten ge-escaped. */
function escapeText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

// RFC 5545: regels van maximaal 75 octetten, vervolgregels beginnen met een spatie.
function foldLine(line: string): string {
  if (line.length <= 73) return line;
  const parts: string[] = [];
  let rest = line;
  while (rest.length > 73) {
    parts.push(rest.slice(0, 73));
    rest = rest.slice(73);
  }
  parts.push(rest);
  return parts.join("\r\n ");
}

/** Haalt "rota@example.com" uit 'RotaCall <rota@example.com>'. */
export function emailAddress(value: string): string {
  const match = value.match(/<([^>]+)>/);
  return (match ? match[1] : value).trim();
}

export interface IcsOptions {
  /** Titel van de afspraak; mag dezelfde placeholders gebruiken als de mail. */
  summary: string;
  /** Tijdzone waarin de planning staat. */
  timezone: string;
  description?: string;
  /** Afzender/organisator, bv. "rota@example.com". */
  organizer?: string;
  /** Ontvanger, zodat Outlook de afspraak aan de juiste agenda koppelt. */
  attendee?: string;
}

/**
 * Bouwt een VEVENT voor één dienstweek. METHOD:PUBLISH — Outlook toont dan
 * "Toevoegen aan agenda" in plaats van een uitnodiging met accepteren/
 * weigeren, wat voor een dienstrooster het minst in de weg zit.
 */
export function buildIcs(assignment: Assignment, options: IcsOptions): string {
  // Stabiele UID per week + persoon: een herhaalde mail maakt geen dubbele
  // afspraak, een andere invaller wél een eigen afspraak.
  const fingerprint = createHash("sha1")
    .update(`${assignment.id}:${assignment.name}:${assignment.phone}`)
    .digest("hex")
    .slice(0, 12);

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//RotaCall//On-call rotation//NL",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:rotacall-${assignment.id}-${fingerprint}@rotacall`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`,
    `DTSTART:${toIcsUtc(assignment.week_start, options.timezone)}`,
    `DTEND:${toIcsUtc(assignment.week_end, options.timezone)}`,
    `SUMMARY:${escapeText(options.summary)}`,
    options.description ? `DESCRIPTION:${escapeText(options.description)}` : "",
    options.organizer ? `ORGANIZER:mailto:${options.organizer}` : "",
    options.attendee
      ? `ATTENDEE;CN=${escapeText(assignment.name)};ROLE=REQ-PARTICIPANT:mailto:${options.attendee}`
      : "",
    "STATUS:CONFIRMED",
    "TRANSP:TRANSPARENT",
    "BEGIN:VALARM",
    "TRIGGER:-PT15M",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escapeText(options.summary)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);

  return lines.map(foldLine).join("\r\n") + "\r\n";
}
