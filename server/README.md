# On Duty Helper — backend

Kleine Node-backend die de **vaste wekelijkse rotatie** uitrekent en de
planning **in de bestaande piket-tabel** schrijft die 3CX al uitleest.

## Bestaande tabel

Wordt NIET aangemaakt of gewijzigd door deze app — er worden alleen nieuwe
rijen voor komende weken toegevoegd. Kolommen:

| kolom            | gebruik                                  |
|------------------|------------------------------------------|
| `pc_id`          | auto-increment (door MySQL)              |
| `pc_startterm`   | start, maandag `12:00:00`                |
| `pc_endterm`     | einde, volgende maandag `11:59:00`       |
| `pc_period`      | vaste waarde (`ROTATION_PERIOD_VALUE`, default 0) |
| `pc_description` | voornaam (Quinten / Younes / Lucas)      |
| `pc_telnum`      | lokaal nummer, bv. `0612345678`          |

> 3CX leest deze tabel zelf uit voor de doorschakelbestemming. De
> "nu bereikbaar" rij is simpelweg waar `NOW()` tussen `pc_startterm` en
> `pc_endterm` valt.

## Instellen

Kopieer `.env.example` naar `.env`, vul de databasegegevens + `DB_TABLE` in
(de echte tabelnaam!), en controleer de rotatie-instellingen.

## Draaien

```
npm run server          # productie (vult bij start aan + cron)
npm run server:dev      # met auto-reload
npm run server:fill     # eenmalig planning vooruit vullen, dan stoppen
```

API:
- `GET /api/oncall/current`  — wie nu bereikbaar is
- `GET /api/oncall/schedule?weeks=8` — komende weken
- `GET /api/health`

De server vult de planning bij **opstarten** aan en daarna volgens
`CRON_SCHEDULE` (standaard maandag 00:05). Bestaande rijen worden nooit
overschreven of gedupliceerd (controle op `pc_startterm`).

## Docker

```
docker compose up -d --build
```

Bouwt de frontend én draait de backend (serveert de frontend mee op poort 3001).
De `DB_*`-instellingen verwijzen naar jullie **bestaande** MySQL/MariaDB.

## Rotatie aanpassen

De volgorde en nummers staan in `server/config.ts` (`roster`). Pas die lijst
aan om personen toe te voegen/wijzigen of de volgorde te veranderen. Ankerdatum
en wisseltijden staan in `.env`.
