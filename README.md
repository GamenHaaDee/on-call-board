# RotaCall

A small web app that shows **who is on call this week** and keeps a weekly
rotation in a MySQL/MariaDB table. Your phone system (e.g. 3CX) can read the
same table to route incoming calls to the right person automatically.

- 🔁 **Automatic weekly rotation** from an ordered roster — fills the schedule weeks ahead.
- 🗄️ **Writes to a MySQL/MariaDB table** that any system can read (`SELECT … WHERE NOW() BETWEEN start AND end`).
- 🛠️ **Admin page** to reassign a week (holidays / swaps) without touching the rotation.
- 🌍 **8 languages**: Dutch, English, German, French, Spanish, Italian, Portuguese, Polish.
- 🐳 **Docker-ready** (single container serves frontend + backend).

## How it works

1. The backend computes, from a fixed roster + an anchor date, who is on call each week.
2. It inserts a row per week into the database table (default name `period_config`).
3. The React frontend reads the table via a small API and shows the current + upcoming weeks.
4. Your PBX/telephony reads the same table for the current on-call number.

The automatic rotation **only inserts missing weeks** — it never overwrites
existing rows, so manual overrides (e.g. for holidays) stick.

## Quick start

### 1. Database

```bash
mysql -u <user> -p <database> < sql/period_config.sql
```

### 2. Configuration

```bash
cp .env.example .env
# edit .env: database credentials, table name, rotation settings
```

Define the roster (ordered rotation) in one of:
- `ROSTER` env var (JSON), **or**
- `server/roster.json` (git-ignored — copy from `server/roster.example.json`).

```json
[
  { "name": "Alice", "phone": "0600000001" },
  { "name": "Bob",   "phone": "0600000002" }
]
```

### 3. Run with Docker (recommended)

```bash
docker compose up -d --build
```

App available at `http://localhost:3001` (admin at `/admin`).

### 4. Or run locally for development

```bash
npm install
npm run server:dev     # backend on :3001
npm run dev            # frontend on :8080 (proxies /api to the backend)
```

## Configuration reference

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` | — | Database connection |
| `DB_TABLE` | `period_config` | Table to read/write |
| `ROSTER` | — | Roster as JSON array (overrides the files) |
| `ROTATION_ANCHOR_DATE` | `2026-01-05` | A Monday on which roster[0] is on call |
| `ROTATION_START_TIME` / `ROTATION_END_TIME` | `12:00:00` / `11:59:00` | Handover time of day |
| `ROTATION_WEEKS_AHEAD` | `12` | Weeks pre-filled ahead |
| `CRON_SCHEDULE` | `5 0 * * 1` | When to top up the schedule (default: Mondays 00:05) |
| `ADMIN_TOKEN` | _(empty)_ | Optional password for the admin page |

The DB user needs `SELECT`, `INSERT` and `UPDATE` on the table.

## Database permissions

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

React + Vite + Tailwind + shadcn/ui (frontend), Node/Express + mysql2 +
node-cron (backend), i18next for translations.

## License

MIT
