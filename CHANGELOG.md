# Changelog

## Nog niet uitgebracht

### Koppeling met Zabbix

- Zabbix meldt aan één vaste gebruiker; die gebruiker krijgt elke rotatie het
  mobiele nummer van wie dienst heeft in zijn sms-media. De acties in Zabbix
  blijven zoals ze zijn.
- Instellen onder **Instellingen → Zabbix**: adres, API-token (of gebruikersnaam
  en wachtwoord), en daarna de gebruiker en het media-type kiezen uit lijsten
  die uit Zabbix zelf komen.
- De overige media van die gebruiker, zoals het e-mailadres, blijven staan. Er
  wordt nooit iets verwijderd, en staat het juiste nummer er al, dan gaat er
  niets naar Zabbix.
- Bijwerken gebeurt elke paar minuten, meteen na een wijziging op de
  adminpagina, en met de knop in de instellingen.
- Werkt met Zabbix 5.0 tot en met 7.x: of het token in de header hoort, hoe het
  gebruikersveld heet en hoe de media-lijst heet, wordt bepaald aan de hand van
  de versie die Zabbix zelf teruggeeft.

## 1.1.0 — 8 oktober 2026

Van een webpagina met een losse MySQL-server naar één programma dat je start en
dat verder niets nodig heeft.

### Draaien zonder losse database

- SQLite is de standaard: de hele planning staat in één bestand
  (`data/rotacall.db`), er hoeft geen databaseserver naast.
- MySQL/MariaDB en PostgreSQL kunnen nog steeds, te kiezen bij de installatie of
  later in de instellingen.
- Frontend en API draaien in hetzelfde proces: `npm start` en klaar, poort 3001.
- Bij het verbinden wordt gecontroleerd of de tabel de verwachte kolommen heeft,
  zodat een verkeerde tabelnaam meteen zegt wát er mist.

### Installatie en instellingen

- Bij de eerste start verschijnt een setup-pagina: database kiezen, rooster
  invullen, wisseldag en -tijd bepalen.
- Instellingenpagina met alles bij elkaar: rooster, rotatie, database, e-mail,
  telefoniesysteem, beveiliging, back-up en resetten.
- Instellingen staan in de database en overleven dus een herinstallatie. Is de
  database onbereikbaar, dan valt de app terug op `data/setup.json`.
- Met `SETTINGS_IN_FILE=true` blijft alles in het bestand, voor als de planning
  in een database van een ander systeem staat.
- Export maakt één JSON-bestand van instellingen plus alle weken; dat bestand
  kun je bij de setup weer importeren. Resetten zet de app helemaal leeg.

### E-mail en agenda

- De persoon die aan de beurt is krijgt een mailtje, via je eigen SMTP-server.
- Daarbij zit een agendabestand (`.ics`) dat Microsoft 365, Outlook, Google
  Agenda en Apple Agenda begrijpen, zodat de dienst in de agenda komt te staan.
- Tijdzone instelbaar, inclusief zomertijd — ook in het weekend van de wissel.

### Koppeling met het telefoniesysteem

- De week die op dit moment geldt wordt doorgezet naar de tabel die het
  telefoniesysteem (bijvoorbeeld 3CX) uitleest: naam, nummer, begin en eind.
- De app beheert daar precies één rij en onthoudt het id. Andere rijen blijven
  onaangeroerd, er wordt nooit `DELETE` of `ALTER` gedaan, en is onze rij
  weggehaald dan komt er een nieuwe.
- Heeft niemand dienst, dan blijft de laatste rij staan: een leeg
  doorschakelnummer is erger dan een verouderd.
- Doorzetten gebeurt elke paar minuten, meteen na een wijziging op de
  adminpagina, en met een knop in de instellingen.

### Uiterlijk

- Startpagina opnieuw ingedeeld: wie nu dienst heeft staat groot bovenaan, de
  komende weken eronder, en de pagina past op één scherm zonder scrollen.
- Het Circlelink-logo zit in de code zelf, met "Mogelijk gemaakt door Circlelink"
  onderaan en in de titel van het tabblad.
- Contrast, focusrand en aanraakvlakken nagelopen en gemeten (WCAG AA).
- Acht talen: Nederlands, Engels, Duits, Frans, Spaans, Italiaans, Portugees en
  Pools.

### Opgelost

- Dubbele weken wanneer je het wisselmoment aanpaste.
- "Missing credentials for PLAIN" bij het instellen van een mailaccount.
- Lege foutmelding als de database niet bereikbaar was.
- Postgres bleef op poort 3306 staan na het wisselen van databasesoort.
- De server gaf een HTML-pagina met status 200 terug voor bestanden die niet
  bestonden.

## 1.0.0

Eerste versie: weekrooster met adminpagina, MySQL en Docker.
