# BuildPM

Bouwdashboard bovenop een Obsidian-vault. De vault blijft de enige bron van waarheid: BuildPM leest de notities live en schrijft wijzigingen terug in precies de formats die de notities al gebruiken. Niets wordt dubbel bijgehouden; wat je in Obsidian, via een agent of in het dashboard aanpast, is overal meteen zichtbaar.

> Deze repo bevat alleen code en een fictieve demo-vault. Projectgegevens staan nooit in de repo, alleen in de vault.

## Wat het doet

| Onderdeel | Bron in de vault | Wat je er kunt doen |
|---|---|---|
| **Start** | Dashboard, Kanban | Huidige fase, de doorsnede-tekening van de bouw, één volgende stap, de tekeningenlijst |
| **Taken** | `Kanban_Bord.md` (Obsidian Kanban) | Afvinken, verplaatsen, toevoegen, tekst aanpassen, "nagevraagd" stempelen |
| **Bouwfasen** | tabel `## Bouwfasen` in `Dashboard.md` | Status per fase; de tekening kleurt mee |
| **Hoofdstukken** | tabel `## Status per hoofdstuk` | Per hoofdstuk alle taken, vragen, besluiten en notities bij elkaar |
| **Besluiten** | `Besluitenlog.md` | Zoeken, filteren per hoofdstuk, nieuw besluit vastleggen |
| **Vragen & blokkades** | centrale vragenlijst, secties "Vragen voor …", `Blokkades_En_Vragen.md` | Beantwoorden (wordt ook een besluit) of laten vervallen |
| **Werkpakketten** | notities in `03_Projectmanagement` | Voortgang uit gekoppelde taken en afvinklijsten, "klaar als"-criteria |
| **Kennisbank** | alle notities | Lezen met werkende wikilinks, afvinken, "klopt nog" (zet `reviewed`) |
| **Ontwerp** | renders, foto's, ruimteboek | Galerij, ruimte per kamer |
| **Logboek** | `Bouwlogboek.md` + alles met een datum | Eén tijdlijn; regel + foto's vastleggen vanaf de telefoon |
| **Voorraad & kosten** | `Voorraad_En_Inkoop.md` | Status per item, totalen |
| **Rondje bouw** | alles hierboven | Wekelijkse ronde van drie minuten die het dashboard actueel houdt |

## Slim, zonder werk om het werk

- **Volgende stap per context.** Taken worden automatisch ingedeeld in *regelen* (bellen, mailen), *doen* (op de bouw) of *uitzoeken* (achter de laptop). Overdag op werkdagen stelt het dashboard regelwerk voor, in het weekend werk op de bouw en 's avonds uitzoekwerk. Met `#doen`, `#regelen` of `#uitzoeken` in een kaart stuur je het zelf.
- **Wachttellers.** Bij alles wat bij een ander ligt zie je hoeveel dagen het al wacht. Eén tik op "nagevraagd" zet de datum in de kaart.
- **Eén antwoord, twee plekken.** Een beantwoorde vraag wordt in haar notitie gemarkeerd en komt als besluit in het besluitenlog.
- **Rondje bouw.** Eén keer per week: klopt *Nu* nog, nieuws van buiten, één vraag, één logregel, peildatum bevestigen.
- **Versheid.** Notities met een oude `reviewed`-datum krijgen een markering; "klopt nog" werkt die bij.
- **Werkkaarten met invulvakjes.** `____` in een notitie wordt een invulvak. Wat je op de bouw invult, komt als `**waarde**` op die plek in de notitie. Een vak gevolgd door een eenheid of verwachting (`cm`, `×`, `(+0,5)`, `· verwacht 6`) krijgt een cijfertoetsenbord. Invulvakjes werken ook in tabellen.
- **Foto's vanaf de bouw.** De cameraknop bovenin opent direct de camera van de telefoon. `[📷 Foto maken](buildpm:foto)` in een notitie maakt een knop voor die sectie. De foto komt in het logboek met `→ [[Notitie#Kop]]` en verschijnt daarna onder die sectie.
- **Ongedaan maken.** Elke wijziging kan direct terug. Vorige versies blijven bewaard in `.data/history` (buiten de vault).
- **Live.** Wijzigingen in de vault (Obsidian, agents) verschijnen meteen in elk open dashboard.
- **Vault-hygiëne.** Na een wijziging draait het manifest-script van de vault automatisch (als het bestaat).

## Starten

Vereist Node 22 of nieuwer.

```bash
npm install
cp .env.example .env   # VAULT_PATH en PROJECT_DIR invullen
npm run build
npm start              # http://localhost:3080
```

Ontwikkelen met hot reload:

```bash
npm run dev            # gebruikt .env
npm run demo           # fictieve demo-vault in ./demo-vault
npm test
```

Altijd aan via pm2:

```bash
npm run build && pm2 start ecosystem.config.cjs && pm2 save
```

Na een update: `git pull && npm install && npm run build && pm2 restart buildpm`.

Op de telefoon: open het adres (thuisnetwerk of Tailscale) en kies "Toevoegen aan startscherm". Het dashboard werkt dan als app en toont offline de laatst bekende stand.

## Instellingen (`.env`)

| Variabele | Standaard | Betekenis |
|---|---|---|
| `VAULT_PATH` | `./demo-vault` | Map van de Obsidian-vault |
| `PROJECT_DIR` | `project` | Projectmap binnen de vault; alleen deze map is bereikbaar |
| `PORT` / `HOST` | `3080` / `0.0.0.0` | Waar de server luistert |
| `BUILDPM_PIN` | leeg | Pincode om het dashboard af te schermen |
| `MANIFEST_SCRIPT` | `_system/scripts/build_manifest.py` | Script dat na wijzigingen draait; leeg = uit |
| `DATA_DIR` | `.data` | Versiegeschiedenis en miniaturen |
| `OWNER_NAME` | `Eigenaar` | Naam als bron bij besluiten vanuit het dashboard |
| `QUESTIONS_FILE` | `01_Research/99_Vragen.md` | De centrale vragenlijst |

Bestandsnamen, de indeling van de hoofdstukken en de werkpakketten staan in `server/config.js`.

## Hoe het werkt

- `server/md/`: parsers en schrijfacties per format (Kanban, tabellen, checkboxes, vragen, frontmatter, rendering). Elke schrijfactie zoekt zijn doel op inhoud (hash), niet alleen op regelnummer. Is de notitie intussen veranderd, dan weigert de actie in plaats van iets te overschrijven.
- `server/vault.js`: atomair schrijven, versiegeschiedenis, ongedaan maken en de watcher.
- `server/domain.js`: alle overzichten, elke keer afgeleid uit de notities.
- `src/`: React-app (Vite), zonder externe UI-bibliotheek. De stijl "beton & markeerverf" leent van bouwtekeningen: maatlijnen, genummerde labels en een stempel.

Afspraken voor agents die de vault bijwerken staan in de `CLAUDE.md` van het vaultproject (sectie BuildPM).
