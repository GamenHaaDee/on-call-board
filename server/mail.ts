// Dienstmeldingen per e-mail: wie er aan de beurt is krijgt bericht zodra zijn
// week begint, en desgewenst een herinnering een aantal uur daarvoor.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import nodemailer from "nodemailer";
import { config } from "./config";
import { buildIcs, emailAddress } from "./calendar";
import { getMail, getRoster, getTimezone, type MailSettings } from "./settings";
import { zonedToUtc } from "./timezone";
import { getCurrent, getUpcoming, type Assignment } from "./rotation";

export interface MailMessage {
  to: string;
  cc?: string;
  subject: string;
  text: string;
  /** Agendabestand (.ics) dat als bijlage meegaat. */
  calendar?: string;
}

function createTransport(mail: MailSettings) {
  if (!mail.host) throw new Error("Geen SMTP-server ingesteld");
  return nodemailer.createTransport({
    host: mail.host,
    port: mail.port,
    secure: mail.secure,
    auth: mail.user ? { user: mail.user, pass: mail.password } : undefined,
  });
}

/** Verstuurt één bericht met de opgegeven (of ingestelde) SMTP-gegevens. */
export async function sendMail(message: MailMessage, settings?: MailSettings): Promise<void> {
  const mail = settings ?? getMail();
  const transport = createTransport(mail);
  await transport.sendMail({
    from: mail.from || mail.user,
    to: message.to,
    cc: message.cc || undefined,
    subject: message.subject,
    text: message.text,
    attachments: message.calendar
      ? [
          {
            filename: "dienst.ics",
            // Dit content-type laat Outlook/MS365 de afspraak herkennen in
            // plaats van hem als los bestand te tonen.
            contentType: "text/calendar; charset=utf-8; method=PUBLISH",
            content: message.calendar,
          },
        ]
      : undefined,
  });
}

/** Controleert de SMTP-instellingen zonder een bericht te versturen. */
export async function verifyMail(settings: MailSettings): Promise<void> {
  await createTransport(settings).verify();
}

// "2026-03-02 12:00:00" -> "maandag 2 maart 2026 12:00" is leuk, maar de
// server kent de taal van de ontvanger niet; daarom een neutrale notatie.
const prettyDate = (value: string) => value.slice(0, 16).replace("T", " ");

export function fillTemplate(template: string, assignment: Assignment): string {
  return template
    .replaceAll("{{name}}", assignment.name)
    .replaceAll("{{phone}}", assignment.phone)
    .replaceAll("{{start}}", prettyDate(assignment.week_start))
    .replaceAll("{{end}}", prettyDate(assignment.week_end));
}

/** Het e-mailadres van de dienstdoende, op naam gezocht in het rooster. */
export function emailFor(assignment: Assignment): string | null {
  const person = getRoster().find(
    (p) => p.name.toLowerCase() === assignment.name.trim().toLowerCase()
  );
  return person?.email?.trim() || null;
}

export function buildMessage(
  assignment: Assignment,
  mail: MailSettings,
  reminder = false
): MailMessage | null {
  const to = emailFor(assignment);
  if (!to) return null;
  const subject = reminder ? `${mail.subject} (herinnering)` : mail.subject;
  const text = fillTemplate(mail.body, assignment);
  return {
    to,
    cc: mail.cc,
    subject: fillTemplate(subject, assignment),
    text,
    calendar: mail.attachIcs
      ? buildIcs(assignment, {
          timezone: getTimezone(),
          summary: fillTemplate(mail.subject, assignment),
          description: text,
          organizer: mail.from ? emailAddress(mail.from) : undefined,
          attendee: to,
        })
      : undefined,
  };
}

// --- Bijhouden wat al verstuurd is (zodat niemand dubbel mail krijgt) ---

interface MailState {
  sent: string[]; // sleutels: "start:<id>" of "reminder:<id>"
}

function readState(): MailState {
  if (existsSync(config.mailStateFile)) {
    try {
      const parsed = JSON.parse(readFileSync(config.mailStateFile, "utf8")) as MailState;
      if (Array.isArray(parsed.sent)) return parsed;
    } catch {
      console.warn("[mail] mail-state.json kon niet gelezen worden — opnieuw beginnen.");
    }
  }
  return { sent: [] };
}

function writeState(state: MailState): void {
  mkdirSync(path.dirname(config.mailStateFile), { recursive: true });
  // Alleen de laatste 200 sleutels bewaren; ouder is niet meer interessant.
  const trimmed: MailState = { sent: state.sent.slice(-200) };
  writeFileSync(config.mailStateFile, JSON.stringify(trimmed, null, 2) + "\n", "utf8");
}

/**
 * Stuurt de meldingen die op dit moment aan de beurt zijn:
 *   - "start": de week die nu loopt (één keer per week/persoon)
 *   - "reminder": X uur voor de volgende wissel
 * Draait via cron; per sleutel wordt maar één keer gemaild. Wijzigt de admin
 * de persoon van een week, dan verandert de sleutel mee en gaat er opnieuw
 * een bericht uit naar de nieuwe persoon.
 */
export async function sendDueNotifications(now = new Date()): Promise<number> {
  const mail = getMail();
  if (!mail.enabled) return 0;

  const state = readState();
  const alreadySent = new Set(state.sent);
  const queue: { key: string; message: MailMessage }[] = [];

  const keyFor = (kind: string, a: Assignment) => `${kind}:${a.id}:${a.name}:${a.phone}`;

  if (mail.notifyOnStart) {
    const current = await getCurrent();
    if (current) {
      const key = keyFor("start", current);
      const message = buildMessage(current, mail);
      if (message && !alreadySent.has(key)) queue.push({ key, message });
    }
  }

  if (mail.reminderHoursBefore > 0) {
    const upcoming = await getUpcoming(3);
    const horizon = new Date(now.getTime() + mail.reminderHoursBefore * 60 * 60 * 1000);
    for (const assignment of upcoming) {
      const start = zonedToUtc(assignment.week_start, getTimezone());
      if (start <= now || start > horizon) continue;
      const key = keyFor("reminder", assignment);
      const message = buildMessage(assignment, mail, true);
      if (message && !alreadySent.has(key)) queue.push({ key, message });
    }
  }

  let sent = 0;
  for (const item of queue) {
    try {
      await sendMail(item.message, mail);
      state.sent.push(item.key);
      sent++;
      console.log(`[mail] Verstuurd naar ${item.message.to} (${item.key}).`);
    } catch (err) {
      console.error(`[mail] Versturen mislukt (${item.key}):`, (err as Error).message);
    }
  }

  if (sent > 0) writeState(state);
  return sent;
}
