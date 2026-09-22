# RotaCall — design direction

Deze richting is **afgeleid uit de bestaande app** (`src/index.css`,
`tailwind.config.ts` en de bestaande pagina's), niet verzonnen. Het is een
beschrijving van wat er al is, plus de contrastmetingen die eerder ontbraken.
Wijzig je de identiteit, pas dan eerst dit bestand aan.

## Identiteit

RotaCall is een **intern hulpmiddel**, geen product dat zichzelf moet verkopen.
Wie de pagina opent heeft één vraag: *wie is er nu bereikbaar, en klopt dat?*
Alles wat die vraag trager beantwoordt, hoort er niet.

Toon: rustig, feitelijk, Nederlands waar de gebruiker Nederlands spreekt (de app
is in 8 talen vertaald, zie `src/i18n.ts`). Geen marketingtaal, geen uitroepen.

## Motief

Het herkenningspunt is **groen = er is iemand bereikbaar**. Groen wordt nergens
anders voor gebruikt: geen groene knoppen, geen groene accenten als versiering.
Blauw is de bedieningskleur (knoppen, links, focus). Dat onderscheid is de hele
visuele taal van de app en moet zo blijven.

## Kleur

Tokens staan in `src/index.css` als HSL. Actief palet: 2 kernkleuren + 1 accent,
plus neutralen.

| Rol | HSL | Hex | Gebruik |
|---|---|---|---|
| Primary (blauw) | `215 80% 48%` | `#186ADC` | knoppen, links, focus-ring |
| On-call (groen) | `150 60% 40%` | `#29A366` | uitsluitend: dienst is actief |
| Destructive (rood) | `0 72% 51%` | `#DC2828` | verwijderen, resetten, fouten |
| Warning (amber) | `38 92% 50%` | `#F59F0A` | let-op-melding, geen fout |
| Achtergrond | `220 20% 97%` | `#F6F7F9` | pagina |
| Kaart | `0 0% 100%` | `#FFFFFF` | inhoudsvlakken |
| Tekst | `220 25% 10%` | `#131720` | 17.9:1 op kaart |
| Gedempte tekst | `220 10% 46%` | `#6A7181` | 4.89:1 op kaart, 4.56:1 op pagina |
| Veldrand | `220 12% 55%` | `#7E889A` | 3.57:1 op kaart (WCAG 1.4.11) |
| Scheidingslijn | `220 15% 88%` | `#DCDFE5` | alleen decoratief, draagt geen informatie |

Gemeten met `contrast-check.py`. Twee regels die uit die metingen volgen:

- **Groen draagt nooit normale tekst.** `#29A366` haalt 3.22:1 op wit: genoeg
  voor grote tekst en voor een statusrand, te weinig voor een label of zin.
- **Veldranden zijn donkerder dan scheidingslijnen.** Een invoerveld is een
  bedienbaar element en heeft 3:1 nodig; een lijn tussen twee blokken niet.

## Vorm

- Radius `0.75rem` (`--radius`), afgeleide maten voor kleinere elementen.
  Niet alles is een pil: knoppen en velden delen de radius, ronde vormen zijn
  voorbehouden aan avatars en statusstippen.
- Eén schaduw (`.shadow-soft`) en die markeert hoogte, dus alleen op vlakken die
  boven de pagina liggen. Geen schaduw op velden, knoppen of secties.
- De achtergrond heeft twee zeer zwakke radiale vlakken (blauw, groen, 6%). Dat
  is de enige decoratie in de app en blijft onder de inhoud.

## Typografie

Systeemfont (Tailwind default). Bewust: een intern hulpmiddel hoeft geen
webfont te laden, en de systeemletter leest op elk apparaat vertrouwd. Hiërarchie
komt uit grootte en gewicht, niet uit een tweede lettertype. Geen monospace als
sfeer, geen uppercase met wijde tracking.

## Dials

`ENERGY 2 / RHYTHM 2 / MOTION 1`

- **ENERGY 2**: rustig maar niet kaal. De "nu bereikbaar"-kaart mag opvallen,
  de rest ondersteunt.
- **RHYTHM 2**: één consistente kaartvorm, met bewuste uitzonderingen waar de
  inhoud dat vraagt (de actieve dienst, en de onomkeerbare acties).
- **MOTION 1**: hover- en focus-toestanden, en een laadindicator terwijl er echt
  iets laadt. Geen scroll-animaties, geen pulserende elementen.

## Toestanden

Elke weergave die gegevens toont, toont ook wat er aan de hand is als die er niet
zijn: leeg, laden, fout. Een foutmelding noemt de oorzaak en de volgende stap,
niet alleen dat er iets misging. Kleur is nooit het enige signaal: er staat altijd
tekst of een pictogram bij.
