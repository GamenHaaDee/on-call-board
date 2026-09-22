# RotaCall

A small web app that shows **who is on call this week** and keeps a weekly
rotation in a database table. Your phone system (e.g. 3CX) can read the
same table to route incoming calls to the right person automatically.

- 🚀 **Setup page on first run** — pick the database, roster and rotation in the browser, no config files needed.
- ⚙️ **Settings page** — change roster, rotation, database, email and the admin token later on.
- ✉️ **Email notifications** — the person on call gets a message when their week starts (plus an optional reminder), with a calendar invite (.ics) for Outlook/Microsoft 365.
- 💾 **Backup & restore** — export everything to one file, reset the app, and import it back on the setup page.
- 🔁 **Automatic weekly rotation** from an ordered roster — fills the schedule weeks ahead.
- 📦 **No database server needed** — runs on a built-in SQLite file by default; MySQL/MariaDB and PostgreSQL are one setting away.
- 🧩 **One process** — the same app serves the API and the frontend (also during `npm run dev`).
- 🗄️ **Writes to a plain table** that any system can read (`SELECT … WHERE now BETWEEN start AND end`).
- 🛠️ **Admin page** to reassign a week (holidays / swaps) without touching the rotation.
- 🌍 **8 languages**: Dutch, English, German, French, Spanish, Italian, Portuguese, Polish.
- 🐳 **Docker-ready** (single container serves frontend + backend).

## How it works

1. The backend computes, from a fixed roster + an anchor date, who is on call each week.
2. It inserts a row per week into the database table (default name `period_config`) —
   in a SQLite file (default) or in your existing MySQL/MariaDB or PostgreSQL.
3. The React frontend reads the table via a small API and shows the current + upcoming weeks.
4. Your PBX/telephony reads the same table for the current on-call number.

The automatic rotation **only inserts missing weeks** — it never overwrites
existing rows, so manual overrides (e.g. for holidays) stick.

## Quick start

### 1. Start it

```bash
npm install
npm start
```

That builds the frontend and starts one process on `http://localhost:3001`
that serves both the app and the API.

Requires Node 22.5 or newer (that is when `node:sqlite` became available).

### 2. Fill in the setup page

The first time you open the app it shows a **setup page**:

1. the people in the rotation (name, phone, optional email),
2. the **database** — SQLite (a file, nothing to install), MySQL/MariaDB or
   PostgreSQL, with a *Test connection* button,
3. the Monday the first person starts, the handover time, the **time zone** and
   how many weeks to fill ahead,
4. optional SMTP settings so the person on call gets an email,
5. an optional admin token for the admin and settings pages.

Restoring instead of starting fresh? Use **Import backup** at the top of the
setup page: it fills in the whole form from an exported file and puts the saved
weeks back (database and SMTP passwords are not in the file unless you asked for
them, so fill those in again).

Saving writes `data/setup.json`, connects to the chosen database and creates
the schedule right away. After that the app goes straight to the normal view.

Everything on that page (and the email settings) can be changed later under
**Settings** (`/settings`); week-by-week swaps stay on the admin page
(`/admin`).

Prefer configuring it without the browser? Set `ROSTER` (JSON) or create
`server/roster.json` (git-ignored — copy from `server/roster.example.json`) plus
the `ROTATION_*`, `DB_*` and `SMTP_*` variables in `.env`; anything set there
wins over the settings page, and the setup page is skipped.

```json
[
  { "name": "Alice", "phone": "0600000001", "email": "alice@example.com" },
  { "name": "Bob",   "phone": "0600000002" }
]
```

During development a single command runs both the frontend and the API:

```bash
npm run dev            # http://localhost:8080
```

### 3. Or run with Docker

```bash
docker compose up -d --build
```

One container, the SQLite file lives in the `rotacall-data` volume.

## Using MySQL/MariaDB or PostgreSQL instead

Pick it on the setup page, or later under **Settings → Database** (the
*Test connection* button checks it before anything is saved).

To fix the database from the outside instead — which also makes it read-only
in the UI — set in `.env` (or in the compose environment):

```bash
DB_DRIVER=mysql          # or: postgres
DB_HOST=…
DB_PORT=3306             # postgres: 5432
DB_USER=…
DB_PASSWORD=…
DB_NAME=…
DB_TABLE=period_config
```

For PostgreSQL you can use a connection string instead of the separate fields:

```bash
DB_DRIVER=postgres
DATABASE_URL=postgres://user:password@localhost:5432/rotacall
```

PostgreSQL creates the table automatically (see `sql/period_config.pgsql` if
you would rather create it yourself). MySQL does not — create it once:

```bash
mysql -u <user> -p <database> < sql/period_config.sql
```

### Moving an existing database to SQLite

With the MySQL/PostgreSQL settings still in `.env`, copy the existing rows into
the SQLite file, then switch `DB_DRIVER` to `sqlite`:

```bash
npm run server:migrate   # existing server -> SQLITE_FILE (skips rows already there)
```

## Email notifications

Turn them on under **Settings → Email notifications**: SMTP host, port, TLS,
credentials and the sender. People only get mail if they have an email address
in the roster.

- **On start** — a message when someone's week begins.
- **Reminder** — optionally X hours before the handover.
- **Calendar file** — a `dienst.ics` attachment (`METHOD:PUBLISH`, with a
  15-minute alarm) so Outlook, Microsoft 365, Google Calendar or Apple Calendar
  put the shift straight into the calendar. Times are sent in UTC, converted
  from the configured time zone. Each week+person gets a stable UID, so a repeated
  mail does not create a duplicate appointment, while a stand-in gets their own.
- Subject and body support `{{name}}`, `{{phone}}`, `{{start}}` and `{{end}}`.
- *Check SMTP* validates the connection; *Send test message* mails an example;
  *Send the on-call notification now* runs the check immediately.

The server checks every 5 minutes (`MAIL_CHECK_SCHEDULE`) whether something is
due and remembers what it already sent in `data/mail-state.json`, so nobody
gets the same message twice. Reassign a week on the admin page and the new
person is notified.

SMTP can also be set through `SMTP_*` environment variables, which win over
the settings page.

## Time zone

The schedule is stored as wall-clock time (`2026-03-02 12:00:00`), so it needs
to know which zone that is. Pick it on the setup page or under **Settings →
Rotation**; the default follows the server's own zone.

It decides when a week starts and ends, who counts as "on call now", when
notifications go out, and the UTC times in the calendar attachment — so a
container running in UTC no longer needs `TZ` to produce correct appointments.
Daylight saving is handled, including the weekend of a switch.

`ROTACALL_TIMEZONE` fixes it from the outside; it is then read-only in the UI.

## Backup, restore and reset

Under **Settings → Backup**, *Download backup* gives you one JSON file with all
settings (roster, rotation, database, email) plus every week in the table.
Passwords are left out unless you tick *Include passwords* — in that case treat
the file as a secret.

To restore it, open the setup page of a fresh (or reset) installation and use
**Import backup**: the form is filled from the file and the saved weeks are
written back. Existing weeks are never overwritten, so a manual stand-in in the
backup survives the automatic rotation.

**Settings → Reset everything** erases `data/setup.json` and the mail state, so
the app returns to the setup page. Tick *Also erase the schedule in the
database* to empty the table as well — careful if your phone system shares that
table. The reset never touches settings that come from environment variables.

## Handy commands

```bash
npm start                # build frontend + run the server (API + frontend)
npm run dev              # development: frontend + API in one process
npm run server           # run the server without rebuilding the frontend
npm run server:fill      # top up the schedule once, then exit
npm run server:inspect   # print the upcoming weeks + who is on call now
npm run server:migrate   # copy MySQL/PostgreSQL rows into the SQLite file
```

## Configuration reference

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_DRIVER` | `sqlite` | `sqlite` (built-in file), `mysql` or `postgres` |
| `SQLITE_FILE` | `./data/rotacall.db` | SQLite database file (driver `sqlite`) |
| `SETUP_FILE` | `./data/setup.json` | Where the settings (roster, rotation, database, mail) are stored |
| `MAIL_STATE_FILE` | `./data/mail-state.json` | Which notifications were already sent |
| `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` | — | Database connection (driver `mysql` / `postgres`) |
| `DATABASE_URL` | — | Connection string, PostgreSQL only |
| `DB_TABLE` | `period_config` | Table to read/write |
| `ROSTER` | — | Roster as JSON array (overrides the setup page and files) |
| `ROTATION_ANCHOR_DATE` | `2026-01-05` | A Monday on which roster[0] is on call |
| `ROTATION_START_TIME` / `ROTATION_END_TIME` | `12:00:00` / `11:59:00` | Handover time of day |
| `ROTATION_WEEKS_AHEAD` | `12` | Weeks pre-filled ahead |
| `CRON_SCHEDULE` | `5 0 * * 1` | When to top up the schedule (default: Mondays 00:05) |
| `ADMIN_TOKEN` | _(empty)_ | Optional password for the admin and settings pages (also settable in the UI) |
| `SMTP_ENABLED` / `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_FROM` | — | Email settings (otherwise set in the UI) |
| `MAIL_CHECK_SCHEDULE` | `*/5 * * * *` | How often to check for notifications to send |
| `ROTACALL_TIMEZONE` | _(server zone)_ | IANA time zone for the schedule, e.g. `Europe/Amsterdam` |

Environment variables win over what the setup and settings pages saved, so an
installation configured through `.env` or Portainer keeps behaving exactly as
before — those fields are then shown as read-only in the UI.

`data/setup.json` holds the database and SMTP passwords in plain text and is
written with owner-only permissions; keep the `data/` directory (or the Docker
volume) as private as the rest of your server.

With MySQL the DB user needs `SELECT`, `INSERT` and `UPDATE` on the table.

## Database permissions (MySQL only)

```sql
GRANT SELECT, INSERT, UPDATE ON <database>.period_config TO '<user>'@'%';
FLUSH PRIVILEGES;
```

## Deploying with Portainer

Use a **Git repository stack** pointing at this repo with compose path
`docker-compose.yml`, and set the environment variables (including `ROSTER`
as JSON) in the stack's *Environment variables* section. See the deploy notes
for details.

## Tech stack

React + Vite + Tailwind + shadcn/ui (frontend), Node/Express + node-cron
(backend), `node:sqlite`, mysql2 or pg for storage, nodemailer for email,
i18next for translations.

## License

MIT
