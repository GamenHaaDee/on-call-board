# RotaCall — backend

Kleine Node-backend die de **vaste wekelijkse rotatie** uitrekent, de planning
in de piket-tabel schrijft (die bv. 3CX uitleest) en de gebouwde frontend
meeserveert. Eén proces, geen aparte databaseserver nodig.

## Databases

`DB_DRIVER` bepaalt waar de planning staat:

| waarde     | opslag                          | tabel aanmaken            |
|------------|---------------------------------|---------------------------|
| `sqlite`   | bestand (`SQLITE_FILE`)         | automatisch               |
| `mysql`    | MySQL/MariaDB-server            | zelf: `sql/period_config.sql`   |
| `postgres` | PostgreSQL-server               | automatisch (of `sql/period_config.pgsql`) |

De drivers zitten in `db/` en delen dezelfde kleine interface (`db/types.ts`),
zodat de rest van de code dialect-onafhankelijk blijft.

## Tabel

Bestaande rijen worden nooit overschreven — er komen alleen weken bij.

| kolom            | gebruik                                  |
|------------------|------------------------------------------|
| `pc_id`          | auto-increment                           |
| `pc_startterm`   | start, maandag `12:00:00`                |
| `pc_endterm`     | einde, volgende maandag `11:59:00`       |
| `pc_period`      | vaste waarde (`ROTATION_PERIOD_VALUE`, default 0) |
| `pc_description` | voornaam van de bereikbare persoon       |
| `pc_telnum`      | lokaal nummer, bv. `0612345678`          |

> "Nu bereikbaar" is simpelweg de rij waar het huidige tijdstip tussen
> `pc_startterm` en `pc_endterm` valt.

## Instellen

Bij het eerste gebruik toont de app een **setup-pagina** (database, rooster,
rotatie, admin-token); daarna is `/settings` de plek om alles te wijzigen,
inclusief de e-mailmeldingen. Alles landt in `SETUP_FILE` (standaard
`data/setup.json`, geschreven met rechten 0600 omdat er wachtwoorden in staan).

Environment variables (`ROSTER`, `DB_*`, `ROTATION_*`, `SMTP_*`, `ADMIN_TOKEN`)
gaan per veld altijd vóór; die velden zijn in de UI alleen-lezen. Zie
`settings.ts` voor die voorrangsregels.

## Tijdzone

De planning staat als wandklok-tijd in de tabel, dus de app moet weten bij welke
zone die hoort. `timezone.ts` regelt dat met `Intl` (geen extra dependency):
`nowInZone()` levert "nu" als vergelijkbare tekst voor de queries — daarom staat
er in `rotation.ts` geen `NOW()` meer, want dat zou de zone van de *database*
gebruiken — en `zonedToUtc()` zet een wandklok-tijd om naar het echte moment,
voor de herinneringsmail en het agendabestand. Zomertijd gaat automatisch goed.

Instelbaar in de setup-/instellingenpagina; leeg = de zone van de server.
`ROTACALL_TIMEZONE` zet hem vast.

## E-mail

`mail.ts` verstuurt via nodemailer een bericht aan de persoon die dienst heeft
(op naam gematcht met het rooster, dus alleen als daar een e-mailadres bij
staat). Een cron (`MAIL_CHECK_SCHEDULE`, standaard elke 5 minuten) kijkt of er
iets openstaat: de lopende week en/of een herinnering X uur voor de wissel.
Verstuurde meldingen staan in `MAIL_STATE_FILE`, zodat niemand dubbel mail
krijgt; wijzigt de admin de persoon van een week, dan verandert de sleutel en
gaat er alsnog bericht naar de nieuwe persoon.

`calendar.ts` maakt daarbij een `.ics`-bijlage (VEVENT, `METHOD:PUBLISH`, alarm
15 minuten vooraf) zodat de dienst in Outlook/Microsoft 365 in de agenda komt.
Tijden gaan als UTC mee, omgerekend vanuit de ingestelde tijdzone; de UID is
stabiel per week + persoon, dus een herhaalde mail levert geen dubbele afspraak
op en een invaller krijgt zijn eigen afspraak.

## Draaien

```
npm start               # frontend bouwen + server starten
npm run server          # alleen de server
npm run server:dev      # met auto-reload
npm run server:fill     # eenmalig planning vooruit vullen, dan stoppen
npm run server:inspect  # komende weken tonen
npm run server:migrate  # MySQL/Postgres -> sqlite kopiëren
```

API:
- `GET /api/health` — status + gebruikte driver
- `GET /api/setup/status` — is de app al ingericht?
- `POST /api/setup` — eenmalig rooster + rotatie vastleggen
- `GET /api/people` — het rooster
- `GET /api/oncall/current` — wie nu bereikbaar is
- `GET /api/oncall/schedule?weeks=8` — komende weken
- `PUT /api/oncall/:id` — één week omzetten (admin-token vereist indien ingesteld)
- `GET/PUT /api/settings` — alle instellingen lezen/opslaan (zonder wachtwoorden in het antwoord)
- `POST /api/settings/database/test` — verbinding testen zonder op te slaan
- `POST /api/settings/mail/test` — SMTP controleren of een testbericht sturen
- `POST /api/settings/mail/run` — openstaande dienstmelding nu versturen
- `GET /api/settings/export` — back-up van instellingen + planning (`?secrets=1` incl. wachtwoorden)
- `POST /api/settings/reset` — instellingen wissen (`{"wipeData":true}` wist ook de tabel)

`POST /api/setup` accepteert naast de instellingen een `assignments`-array: zo
zet de setup-pagina een geïmporteerde back-up terug. Bestaande weken blijven
staan, dus importeren overschrijft nooit iets.

De server vult de planning bij **opstarten** aan en daarna volgens
`CRON_SCHEDULE` (standaard maandag 00:05).

## Docker

```
docker compose up -d --build
```

Bouwt de frontend én draait de backend op poort 3001. Het sqlite-bestand,
`setup.json` en `mail-state.json` staan in `/app/data` (volume `rotacall-data`).
