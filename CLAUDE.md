# Ausflugsideen-Karte – Notizen für Claude

Diese Datei ist die Übergabe für alle Claude-Sitzungen, die an diesem Repo arbeiten. Sie ersetzt frühere Notizen ausserhalb des Repos. **Das Repo ist ab jetzt die einzige Quelle.**

Die Website zeigt Ausflugsideen für eine Familie mit Kindern (Schweiz und Umgebung) auf einer Karte mit Liste. Sie läuft öffentlich unter https://xpliarmus.github.io/ausflugskarte/ (GitHub Pages, Branch `main`, Ordner `/`).

> Das Repo ist **öffentlich**. Keine privaten Angaben, Zugangsdaten oder Schlüssel committen.

## Arbeitsweise (ausdrücklicher Wunsch des Besitzers, hat Vorrang)

- **Schritt für Schritt, mit OK vor jedem nächsten Schritt.** Erst den Plan in einfachen Worten zeigen und warten. Nach jedem Schritt kurz sagen, was erledigt ist und was als Nächstes käme, dann wieder warten. Nie mehrere Stufen in einem Zug umsetzen.
- **Sprache:** Deutsch, Schweizer Schreibweise („ss“, kein „ß“). Der Besitzer ist kein Entwickler: ohne Fachjargon erklären, kurz halten.
- **Änderungen als Pull Request.** Der Besitzer schaut den PR an und klickt auf „Merge“. Nach dem Merge ist die Seite nach 1–2 Minuten live.
- **Vor dem PR testen** (siehe „Testen“) und im PR in zwei, drei Sätzen beschreiben, was sich für Besucher ändert.

## Aufbau

Die Website selbst ist bewusst flach und ohne Build-Schritt. So lassen sich Dateien notfalls auch von Hand über die GitHub-Weboberfläche hochladen. Nur `ausfluege.json` wird erzeugt (siehe „Microsoft To Do“).

| Datei | Inhalt |
|---|---|
| `index.html` | Seitengerüst. Lädt `style.css?v=N` und `app.js?v=N`. |
| `style.css` | Gestaltung: Farb-Tokens in `:root`, Dark Mode über `prefers-color-scheme`, Mobile-Layout ab `max-width: 880px`. Design siehe „Gestaltung“. |
| `app.js` | Lädt `ausfluege.json` und baut Liste, Filter, Karte und Haken auf (ES5-nah, keine Abhängigkeiten ausser Leaflet). |
| `ausfluege.json` | **Die Website-Daten** (siehe unten). **Wird von der Action „To-Do-Abruf“ erzeugt, nie von Hand bearbeiten**, auch nicht in PRs. |
| `daten/ziele.json` | **Die Angaben zu allen Zielen** plus die zugehörigen To-Do-Aufgaben (`todo`). Hier werden Ziele ergänzt oder korrigiert. |
| `daten/offen.json` | Wird erzeugt: Aufgaben aus To Do, zu denen es noch keine Angaben gibt (`id`, `titel`). |
| `werkzeuge/todo.py` | Anmeldung bei Microsoft, Abruf der Liste und Zusammenbau (nur Python-Standardbibliothek). |
| `daten/startorte.json` | 181 Startorte in der Schweiz (Name, Kanton, Lage) für die Fahrzeiten, siehe „Fahrzeiten“. Hier werden Startorte ergänzt oder entfernt. |
| `fahrzeiten.json` | Wird erzeugt: Fahrzeiten mit dem Auto in Minuten von jedem Startort zu jedem Ziel. **Nie von Hand bearbeiten.** |
| `werkzeuge/fahrzeiten.py` | Berechnet fehlende Fahrzeiten über den Routenplaner der FOSSGIS (nur Python-Standardbibliothek). |
| `.github/workflows/` | `microsoft-anmeldung.yml` (einmalige Anmeldung) und `todo-abruf.yml` (Abruf, Zusammenbau und Fahrzeiten, siehe „Microsoft To Do“ und „Fahrzeiten“). |
| `leaflet.js`, `leaflet.css` | Leaflet 1.9.4, lokal eingebunden (kein CDN). |
| `fredoka.woff2`, `karla.woff2` | Schriften lokal (Fontsource, latin, variable): Fredoka für Titel und Überschriften (`--font-display`), Karla für alles andere. Keine Anfragen an Google Fonts. |
| `README.md`, `LIZENZEN.txt` | Beschreibung für Besucher und Drittanbieter-Lizenzen. |

### Datenformat

`daten/ziele.json` hat dieselben Felder wie unten, zusätzlich pro Ziel `"todo": ["<To-Do-Aufgaben-ID>", …]` und ohne `stand`. Daraus entsteht `ausfluege.json`:

```json
{
  "stand": "2026-10-21",
  "kategorien": [{ "key": "tier", "label": "Tierpark/Zoo", "farbe": "#E63946", "symbol": "🦁" }],
  "ausfluege": [{
    "id": "affenberg-salem", "titel": "Affenberg Salem",
    "ort": "Salem (Mendlishausen)", "region": "Baden-Württemberg", "land": "Deutschland",
    "lat": 47.767, "lon": 9.2295, "kat": "tier", "saison": "sommer", "regentag": false,
    "beschreibung": "…", "hinweis": "… (optional)", "website": "https://… (optional)",
    "ungefaehr": true
  }]
}
```

- **Kategorien (10):** `tier, kugel, sonst, wandern, wasser, berg, museum, spiel, park, schnee`. `schnee` = «Schnee & Eis» (Gletscherblau `#7FB8E6`, 🛷) für Schlitteln, Eisbahnen, Kinder-Skigebiete und Winterwege, seit November 2026. `symbol` ist das Emoji im Filter-Fenster auf dem Handy (optional, fehlt es, bleibt der Platz leer). Auf der Seite stehen die Kategorien alphabetisch nach `label`, „Sonstiges“ (`sonst`) immer zuletzt (`katReihenfolge()` in `app.js`); die Reihenfolge in der Datei spielt keine Rolle.
- **`saison`** (Pflicht): `sommer` (ca. April–Oktober), `winter` (ca. November–März) oder `ganzjaehrig`. Ganzjährig heisst: offen und sinnvoll in beiden Jahreshälften. **Regel des Besitzers: Saison = Hauptattraktion.** Wege ohne Bahn oder Anlage mit Winterpause sind ganzjährig, ausser Barfuss- oder Wasserwegen und Höhenwegen ohne Winterweg. Hat die Hauptattraktion eine Winterpause (Bergbahn, Saisonpark, Freibad, Maislabyrinth), gilt `sommer`; einzelne Wintertage gehören dann in den `hinweis`.
- **`regentag`** (Pflicht, `true`/`false`): **Regel des Besitzers: nur `true`, wenn sich der ganze Ausflug drinnen, unterirdisch (Höhlen, Grotten) oder gedeckt lohnt.** Darum z.B. nicht bei der Titlis Eisgrotte (Bergfahrt) oder einem Hotel.
- **Fehlen `saison` oder `regentag`** oder sind sie ungültig, gilt das Ziel als ganzjährig und als nicht regentauglich. Es erscheint also trotzdem, nur nie im Regentag-Filter. Der To-Do-Abruf schreibt dann pro Ziel eine gelbe Warnung (`::warning::`) ins Protokoll und bleibt grün (`fehlende_angaben()` in `werkzeuge/todo.py`).
- **`land`** wird in der Liste nur angezeigt, wenn es nicht „Schweiz“ ist.
- **`ungefaehr: true`** heisst, dass die Koordinaten nur geschätzt sind. In der Liste erscheint dann ein „~“.
- **`id`** ist der Schlüssel für die Erledigt-Haken der Besucher. **Eine bestehende `id` nie ändern**, sonst verlieren die Besucher ihre Haken. Für neue Einträge wird die `id` so gebildet: Titel in Kleinbuchstaben, Unicode-NFKD und auf ASCII reduzieren (ä→a), alles ausser `a-z0-9` durch `-` ersetzen, `-` am Rand entfernen.
- **`stand`** setzt der Zusammenbau automatisch auf das Datum, an dem sich etwas geändert hat.
- **Format von `ausfluege.json`:** `json.dumps(…, ensure_ascii=False, indent=1)` ohne Zeilenumbruch am Ende (`schreiben()` in `werkzeuge/todo.py`). So entstehen keine unnötigen Änderungen.

### Verhalten der Seite

- **Karte:** Grundkarte sind die OpenStreetMap-Kacheln (`tile.openstreetmap.org`). Der Umschalter „Landeskarte CH“ lädt die swisstopo-Karte (`https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/{z}/{x}/{y}.jpeg`, maxNativeZoom 18). Die Quellenangaben (Attribution) müssen bleiben.
- **Startansicht:** alle Einträge im Umkreis von 300 km um den Median-Punkt (`CLUSTER_KM`). Weit entfernte Ziele wie die Steiermark sieht man erst beim Herauszoomen. Der Knopf ⟲ setzt die Ansicht zurück.
- **Jahreszeit und Regentag** (seit November 2026):
  - Schalter «Alle | ☀️ Sommer | ❄️ Winter» (`#saisonWahl` / `.saison-wahl`, Knöpfe mit `data-saison`) ganz oben in der Filterleiste. Ganzjährige Ziele erscheinen in beiden Jahreszeiten. Beim Öffnen steht er auf der aktuellen Jahreszeit nach dem Datum im Browser (November–März Winter, April–Oktober Sommer) und wird nicht gespeichert.
  - Knopf «☔ Regentag» (`#regenKnopf`) zeigt nur Ziele mit `regentag: true`. Er lässt sich mit Jahreszeit, Kategorien, Suche und «nur offene» kombinieren (`passtZeit()` in `app.js`).
  - Knopfzeile `.schalter-zeile` unter dem Suchfeld: «☔ Regentag», «nur offene» (beide `.schalter`, aktiv `.an`) und rechts die Anzahl passender Ziele (`#treffer`).
  - Die Anzahlen bei Chips und im Filter-Fenster richten sich nach Jahreszeit und Regentag (nicht nach Suche). Kategorien ohne Ziel werden blass (`.leer`), bleiben aber wählbar.
  - Hinweise in der grauen Zeile hinter Kategorie und Ort, in der Liste und im Popup (`zeitHinweis()`): «☀️ nur Sommer», «❄️ nur Winter», «☔ auch bei Regen». Ganzjährige Ziele ohne Regentag bekommen keinen.
  - «zurücksetzen» setzt Kategorien, Suche, Regentag und «nur offene» zurück, die Jahreszeit bleibt. Ist die Liste leer und eine Jahreszeit gewählt, rät die Meldung zu «Alle».
  - Haken, Zähler («x von N erledigt») und Mein-Stand-Link zählen weiterhin alle Ziele, auch ausgeblendete.
- **Liste:**
  - Kategorie-Chips mit Anzahl, leicht in ihrer Kategorie-Farbe getönt
  - **Handy (bis 880 px):** statt der Chips ein Knopf „Filter“ (`#filterKnopf` / `.filter-knopf`), der die Auswahl zeigt („Alle Kategorien“, bis zu zwei Kurznamen wie „Tierpark, Wanderung“, sonst „3 Kategorien“). Er öffnet das Fenster von unten `<dialog id="filterBlatt">` (`.filterblatt`) mit allen Kategorien (Symbol, Name, Anzahl, Haken), „Zurücksetzen“ (nur Kategorien) und „Fertig“. Die Zeile „Kategorie filtern / zurücksetzen“ ist auf dem Handy ausgeblendet (Wunsch des Besitzers: doppelt mit „Zurücksetzen“ im Fenster; die Suche leert das ✕ im Suchfeld). Antippen filtert sofort; Escape, „Fertig“ und Tippen daneben schliessen. Bewusst kompakt, damit es auch auf dem iPhone SE ohne Scrollen passt; auf niedrigen Bildschirmen (`max-height: 620px`) rücken die Zeilen noch enger zusammen, damit alle 10 Kategorien Platz haben. Ohne `<dialog>`-Unterstützung bleiben die Chips (Klasse `.mit-filterblatt` an `.filterbar` fehlt dann).
  - Jeder Eintrag hat links einen Streifen in seiner Kategorie-Farbe (`--kat-farbe`, gesetzt in `buildCards()`)
  - Suche, die Umlaute ignoriert („zurich“ findet „Zürich“)
  - „nur offene“
  - „Auf der Karte“ fliegt zum Pin; mobil wird zuerst zur Karte gescrollt
- **Pins:**
  - Klick öffnet ein Popup mit eigenem Erledigt-Haken, der mit der Liste abgeglichen bleibt.
  - Auf dem Desktop blinkt dazu der passende Listeneintrag.
  - Fährt die Maus über einen Listeneintrag, erscheint ein Ring um den Pin. Der Ring wandert mit, wenn die Liste scrollt.
- **localStorage** (nur im Browser des Besuchers):
  - `ausflugsideen.erledigt.v1`: JSON-Array mit den `id`s der erledigten Einträge
  - `ausflugsideen.karte`: zuletzt gewählte Karte (`osm` oder `swisstopo`)
- **Mein-Stand-Link** (Knopf „Erledigte Ziele teilen“ `#teilenKnopf` / `.teilen-knopf` neben dem Zähler):
  - Der Knopf hiess bis Oktober 2026 „Mein Stand teilen“. Umbenannt, weil Besucher dachten, es werde der Standort geteilt. „Mein-Stand-Link“ bleibt nur der interne Name, und das Link-Format `#stand=1.` bleibt, damit verschickte Links gültig bleiben. In sichtbaren Texten nicht mehr „Stand“ für die Haken verwenden.
  - Format: `…/#stand=1.<Codes>`. `1` ist die Formatversion. Danach folgt pro erledigtem Eintrag ein Kurzcode aus 4 Zeichen (`0-9A-Za-z`), sortiert und ohne Trennzeichen.
  - Kurzcode = FNV-1a (32 Bit) über die `id`, reduziert auf 62⁴ Werte (`kurzcode()` in `app.js`). Haben zwei `id`s denselben Code, warnt die Konsole, und der Code wird beim Übernehmen ignoriert. Beim Hinzufügen von Einträgen prüfen, dass alle Codes verschieden sind.
  - Teilen: Auf Touch-Geräten (`pointer: coarse`) öffnet `navigator.share` das Teilen-Menü, sonst wird kopiert (`navigator.clipboard`). Klappt das nicht, erscheint ein Fenster mit dem Link.
  - Öffnen: Vorher fragt `<dialog id="frageFenster">` „Erledigte Ziele übernehmen?“ (ältere Browser: `confirm()`). Kein Knopf ist vorausgewählt. Bei „Übernehmen“ wird vereinigt. In jedem Fall wird das Fragment entfernt, und die Meldung `#meldung` / `.meldung` zeigt die Anzahl. Sind alle Haken schon da, erscheint keine Frage, nur ein Hinweis.
  - Unbekannte Codes werden übergangen. Andere Fragmente (`#irgendwas`) bleiben unangetastet. Bei einer unbekannten Formatversion bleibt das Fragment stehen, und die Seite bittet ums Neuladen.
  - Auch ein in einem offenen Tab eingefügter Link wirkt (`hashchange`).
- **Nach-oben-Knopf:** `#hochKnopf` / `.hochknopf` / `.sichtbar`. Auf dem Desktop scrollt er die Liste (`.sidebar`), mobil die ganze Seite.
- `<meta name="robots" content="noindex, nofollow">`: Die Seite soll nicht in Suchmaschinen erscheinen.

### Gestaltung (seit Oktober 2026)

Vom Besitzer gewählt aus mehreren Entwürfen („hell und ruhig“ plus „Bergpanorama“ und „Farbtupfer“). Vorher gab es grünen Hintergrund und die Titelschrift Fraunces. Beides gefiel nicht: zu viel Grün, zu dunkel, Titel zu schlicht.

- **Grund:** weiss mit neutralen Grautönen; Akzent Blau `#2B59C3` (dunkel: `#7EA4FF`); Dunkel-Modus in neutralem Anthrazit, nicht grün. Der Dunkel-Modus soll bleiben.
- **Kopfzeile:** zarter Himmelsverlauf mit Bergsilhouette (SVG als Data-URI im CSS, je eine Fassung für hell und dunkel), Pin-Symbol `.logo` und Titel in Fredoka.
- **Farbe kommt aus den Kategorien:** kräftige Kategorie-Farben (in `daten/ziele.json`), getönte Filter-Chips, Farbstreifen an den Einträgen.

### Stolperfallen

- **Cache:** GitHub Pages liefert Dateien mit `max-age=600`. **Bei jeder Änderung an `style.css` oder `app.js` die Zahl `?v=N` in `index.html` erhöhen** (aktuell `v=8`). Sonst mischt der Browser bis zu 10 Minuten lang alte und neue Dateien.
- **Inhaltsblocker (Safari):** Sie blenden Elemente mit Namen wie `back-to-top`, `scroll-top` oder `to-top` aus. Darum heisst der Knopf `hochknopf`. Teilen-Knöpfe (`share`, `social`) werden ebenfalls oft ausgeblendet, darum `teilen-knopf`. Bei neuen schwebenden Elementen ebenfalls neutrale, deutsche Namen wählen.
- **Mobile:** Die Seite scrollt als Ganzes (keine Höhen-Tricks mit `100vh` in der Liste). Horizontales Scrollen muss ausgeschlossen bleiben (`overflow-x: hidden` auf `html`/`body`). Lange Titel brechen notfalls mitten im Wort um (`overflow-wrap: anywhere` an `.card-title`), sonst ragen sie auf 320 px Breite hinaus. Die Chips scrollen horizontal für sich, sind auf dem Handy aber nur noch ohne Filter-Fenster zu sehen.
- **Leaflet-Stile:** Leaflet setzt eigene Regeln mit höherer Spezifität (z.B. `.leaflet-popup-content p`). Eigene Popup-Regeln darum mit `.leaflet-popup-content …` präfixen.

## Testen

```bash
python3 -m http.server 8899      # im Repo-Ordner
```

- **Mit Playwright** (Chromium) gegen `http://127.0.0.1:8899/` prüfen:
  - Desktop 1440×900, Dark Mode und ein iPhone-Profil
  - so viele Karten und Pins wie Einträge in `ausfluege.json` (Anfang November 2026: 154); Filter, Suche und „nur offene“. Achtung: Die Seite startet auf der aktuellen Jahreszeit. Für Zählungen über alle Ziele zuerst «Alle» wählen (auch bei offenem Fenster per `page.evaluate(() => document.querySelector('[data-saison="alle"]').click())`), für die Jahreszeit das Datum mit `page.clock.setFixedTime()` festlegen.
  - Jahreszeit: Startmonat (31.3. Winter, 1.4. Sommer, 31.10. Sommer, 1.11. Winter), Karten und Pins je Jahreszeit, Anzahlen bei Chips und im Filter-Fenster, blasse leere Kategorien
  - Regentag allein und kombiniert mit Jahreszeit, Kategorie, Suche und «nur offene»; «zurücksetzen» lässt die Jahreszeit stehen
  - Hinweise in Liste und Popup; fehlende oder ungültige `saison`/`regentag` (per `page.route` auf `ausfluege.json`): ganzjährig, kein Regentag
  - Handy: Reihenfolge Schalter, Filter-Knopf, Suchfeld, Knopfzeile; Knopfzeile passt auf 320 px
  - Kategorien alphabetisch, „Sonstiges“ zuletzt (Chips und Filter-Fenster)
  - Filter-Fenster auf iPhone 13 und iPhone SE (320×568): passt ohne inneres Scrollen, „Fertig“ im Bild; Antippen, Knopf-Text, „Zurücksetzen“, „Fertig“, Escape, Tippen daneben; Zeile „zurücksetzen“ auf dem Handy unsichtbar; Dunkel-Modus; ohne `showModal` bleiben die Chips
  - Haken bleibt nach Neuladen erhalten; Popup-Haken und Listen-Haken bleiben abgeglichen
  - Hover-Ring; Nach-oben-Knopf
  - Mein-Stand-Link:
    - Link erzeugen: Desktop kopiert (Rechte `clipboard-read`/`clipboard-write`), mobil `navigator.share` per `addInitScript` nachbilden
    - in einem zweiten Kontext mit eigenen Haken öffnen: Frage, „Nicht übernehmen“, Escape, „Übernehmen“ (Vereinigung), Meldung, Fragment entfernt
    - unbekannte Codes; Link in offenem Tab
    - Wichtig: Vor jedem `goto` mit anderem `#` zuerst `about:blank` laden. Sonst gibt es nur einen `hashchange` und kein echtes Neuladen.
  - Mobil kein horizontales Scrollen (`scrollWidth <= innerWidth`)
  - keine JS-Fehler
- **Kachelserver** sind aus Sandboxes oft nicht erreichbar. Anfragen dann mit `page.route` abfangen und mit einem Platzhalter-PNG beantworten.
- **`werkzeuge/todo.py`** gegen einen nachgebildeten Microsoft-Dienst (`http.server`, `todo.LOGIN`/`todo.GRAPH` umbiegen) und ein nachgebildetes `gh` im `PATH` testen:
  - Tokens, Notizen und Status erscheinen nie im Protokoll, ausser in `::add-mask::`-Zeilen.
  - Probelauf schreibt nichts; Sicherheitsgrenze; zweiter Lauf ohne Änderung lässt die Dateien Zeichen für Zeichen gleich.
  - `todo.zusammenbauen()` mit den echten `daten/ziele.json` prüfen.
- **`werkzeuge/fahrzeiten.py`** gegen einen nachgebildeten Routenplaner (`http.server`, `fahrzeiten.OSRM` umbiegen, `time.sleep` ersetzen; Achtung: Pfad mit `urllib.parse.urlsplit` lesen, `urlparse` schneidet bei `;` ab):
  - Anzahl und Grösse der Anfragen, Kennung, Pause ≥ 1 s; Probelauf schreibt nichts
  - zweiter Lauf ohne Anfrage und Zeichen für Zeichen gleich; neues Ziel, geänderte Koordinaten, entferntes Ziel, neuer und entfernter Startort
  - Dienst antwortet nicht oder «TooBig»: Warnung, Datei unverändert; «keine Route» wird als `null` gespeichert

## Fahrplan (jede Stufe einzeln mit OK)

1. ✅ **Website mit echter Karte** (Oktober 2026).
2. ✅ **„Mein-Stand-Link“** (Oktober 2026): Erledigt-Haken zwischen eigenen Geräten übertragen (z.B. Handy ↔ Laptop) oder an Familienmitglieder schicken. Umsetzung siehe „Verhalten der Seite“. Entscheidungen:
   - Der Stand steht im URL-Fragment (`#…`) und erreicht so nie einen Server. Es gibt kein Konto und keine Datenbank.
   - Beim Öffnen wird der Stand mit den vorhandenen Haken **zusammengeführt** (Vereinigung), damit nie ein Haken verloren geht. Dass Abwählen sich dadurch nicht überträgt, ist bewusst in Kauf genommen.
   - Der Link soll kompakt sein, also pro Eintrag ein Kurz-Hash statt der vollen `id`. Kollisionen müssen geprüft werden.
   - Vor dem Übernehmen fragt die Seite „Erledigte Ziele übernehmen?“. Wer einen Link versehentlich öffnet, muss so nichts zurücksetzen (Wunsch des Besitzers).
   - Nach dem Übernehmen wird das Fragment aus der Adresszeile entfernt, und ein kurzer Hinweis zeigt, wie viele Haken neu dazukamen.
   - Familienmitglieder haben keinen automatisch gemeinsamen Stand, sondern gleichen nur über diesen Link ab. Das ist so gewollt.
3. ✅ **Microsoft To Do als Quelle der Einträge** (Oktober 2026). Umsetzung siehe „Microsoft To Do“. Die 22 Ideen, die beim Umstieg noch fehlten, sind Ende Oktober 2026 ergänzt worden. Entscheidungen des Besitzers:
   - To Do liefert **nur die Einträge** (id und Titel), nicht deren Erledigt-Status. Notizen werden nie gelesen oder veröffentlicht.
   - **Schlüssel bleibt die Slug-`id`.** Die To-Do-Aufgaben-IDs stehen nur in `todo`. Keine Migration von Haken oder Links nötig.
   - **Neue Aufgaben erscheinen erst, wenn die Angaben ergänzt sind**, nicht vorher ohne Pin.
   - **Schöne Titel nur auf der Website** (Variante A): In To Do bleibt alles, wie es eingetippt wurde. Die App darf nur lesen.
   - Die Titel der Liste „Ausflugsideen“ sind öffentlich (Repo und Protokolle). Der Besitzer weiss das.
   - **Regel „kein Ausflugsziel“:** Aufgaben, die keine Ziele sind (z.B. „Interaktive Karte (Link)“), stehen in `keinAusflugsziel` in `daten/ziele.json` und erscheinen nirgends.
4. **Automatische Anreicherung** neuer Einträge (vom Besitzer vorerst zurückgestellt) (Ort, Koordinaten, Kategorie, Beschreibung, Website) über die Claude-API. Neue Einträge werden mit „bitte prüfen“ markiert. Dabei auch auf Duplikate prüfen (siehe „Neue Ziele ergänzen“).

5. ✅ **Jahreszeit, Regentag und «Schnee & Eis»** (November 2026), in zwei Schritten mit je einem PR:
   - Schritt 1 (Daten): Kategorie `schnee`, `saison` und `regentag` für alle Ziele, Warnung im To-Do-Abruf. Schlittelweg Rotenflue–Rätigs und Skigebiet Arvenbüel Amden sind von `berg` zu `schnee` gewechselt. Die Einordnung hat der Besitzer in Cowork geprüft und korrigiert; daraus stammen die zwei Regeln unter „Datenformat“.
   - Schritt 2 (Website), November 2026. Umsetzung siehe „Verhalten der Seite“. Entscheidungen des Besitzers:
     - Schalter «Alle | ☀️ Sommer | ❄️ Winter», gut sichtbar über dem Filter. Ganzjährige Ziele erscheinen in beiden Jahreszeiten. Beim Öffnen steht er auf der aktuellen Jahreszeit (November–März Winter, April–Oktober Sommer) und wird nicht gespeichert.
     - Filter «☔ Regentag», kombinierbar mit Jahreszeit, Kategorien, Suche und «nur offene».
     - Handy: Schalter, dann Filter-Knopf, Suchfeld (volle Breite) und eine Zeile mit «☔ Regentag», «nur offene» und der Anzahl passender Ziele. Die Anzahlen bei den Kategorien richten sich nach Jahreszeit und Regentag, leere Kategorien werden blass.
     - Hinweise in den Einträgen in der grauen Zeile hinter Kategorie und Ort («☀️ nur Sommer», «❄️ nur Winter», «☔ auch bei Regen»), Variante A. Ganzjährige Ziele ohne Regentag bekommen keinen Hinweis.
     - «zurücksetzen» lässt die Jahreszeit stehen.

6. **Umkreis nach Fahrzeit** (November 2026), in zwei Schritten mit je einem PR. Entscheidungen des Besitzers:
   - Variante «vorberechnet»: Fahrzeiten von festen Startorten werden im Voraus berechnet, die Website schätzt daraus die Zeit ab dem eingegebenen Ort. Kein Live-Routenplaner im Browser (Schlüssel wären öffentlich, Standort ginge an fremde Dienste).
   - Nur Auto, nur Startorte in der Schweiz. «Mein Standort» per Handy ist vorerst nicht nötig.
   - OpenRouteService war beim Start nicht erreichbar (Website abgeschaltet). Darum der freie Routenplaner der FOSSGIS, ohne Konto und ohne Schlüssel.
   - Schritt 1 (Daten): `daten/startorte.json`, `werkzeuge/fahrzeiten.py`, `fahrzeiten.json` aus dem To-Do-Abruf. Auf der Website noch unsichtbar.
   - Schritt 2 (Website), noch offen:
     - Feld «📍 Von wo?» mit Vorschlägen beim Tippen (Ort oder Postleitzahl, Ortsliste von GeoNames lokal auf der Website, nichts wird verschickt), zusätzlich Startpunkt per Antippen der Karte. Gespeichert nur im Browser.
     - Schätzung: die drei nächsten Startorte; je Fahrzeit Startort → Ziel plus Zuschlag für die Strecke Startpunkt → Startort aus der Luftlinie mit Umwegfaktor; der kleinste Wert zählt. Ganz nahe Ziele direkt über die Luftlinie.
     - Umkreis «bis 30 Min | 1 h | 1½ h | 2 h | alle», kombinierbar mit Jahreszeit, Regentag und Kategorien; Liste nach Fahrzeit sortiert, in den Einträgen «🚗 ca. 50 Min.». Ohne Startpunkt bleibt alles wie heute.
     - Quellenangabe für die Fahrzeiten (OpenStreetMap/OSRM) auf der Website.

## Microsoft To Do

- **Quelle:** Liste „Ausflugsideen“ im persönlichen Microsoft-Konto des Besitzers. Auch seine Frau trägt dort Ideen ein.
- **App bei Microsoft:** „Ausflugskarte“ im Azure-Konto des Besitzers. Kontotyp „Nur persönliche Microsoft-Konten“, öffentliche Clientflows erlaubt, Berechtigungen `Tasks.Read` und `offline_access`. Anmeldung per Device-Code über `/consumers`.
- **Secrets im Repo:**
  - `MS_CLIENT_ID`: Anwendungs-ID der App
  - `MS_REFRESH_TOKEN`: die Anmeldung. Microsoft liefert bei jedem Abruf eine neue, die alte läuft nach 90 Tagen ab. Darum schreibt jeder Abruf sie mit `gh secret set` zurück.
  - `GH_SECRETS_TOKEN`: Fine-grained Token des Besitzers, nur für dieses Repo, nur „Secrets: Read and write“, **ohne Ablaufdatum**. Wird er einmal ungültig: neuen Token gleich anlegen und das Secret ersetzen.
- **Action „Microsoft-Anmeldung“** (`microsoft-anmeldung.yml`, nur von Hand): Sie zeigt im Protokoll einen Code für microsoft.com/link und schreibt `MS_REFRESH_TOKEN`. Nur nötig, wenn der Abruf meldet, dass die Anmeldung ungültig ist.
- **Action „To-Do-Abruf“** (`todo-abruf.yml`):
  - Ablauf: Anmeldung erneuern, Liste lesen, `todo.py aktualisieren` baut `ausfluege.json` und `daten/offen.json`. Bei Änderungen committet die Action direkt auf `main` (`GITHUB_TOKEN`, `contents: write`) und fordert eine Pages-Veröffentlichung an (`POST /pages/builds`).
  - Startet in drei Fällen:
    - täglich um `47 3 * * *` UTC, also 4:47 Uhr Winterzeit bzw. 5:47 Uhr Sommerzeit. Bewusst ohne das neue `timezone`-Feld, dessen Schreibweise nicht geprüft werden konnte.
    - bei jeder Änderung an `daten/ziele.json` auf `main` (`push` mit `paths`), also direkt nach dem Merge eines Ziele-PRs
    - von Hand, mit den Optionen „Probelauf“ (nichts speichern) und „trotzdem“
  - **Zeitplan aktiv halten:** Bei öffentlichen Repos schaltet GitHub Zeitpläne nach 60 Tagen ohne Betrieb ab. Darum ruft jeder Lauf `PUT …/actions/workflows/todo-abruf.yml/enable` auf (`actions: write`). Fällt der Zeitplan trotzdem aus, läuft nach 90 Tagen auch die Microsoft-Anmeldung ab.
  - **Fehler:** Ein roter Lauf öffnet das Issue „To-Do-Abruf fehlgeschlagen“, das den Besitzer erwähnt, und löst so eine E-Mail aus. Weitere Fehler kommen als Kommentar dazu. Der nächste erfolgreiche Lauf schliesst das Issue. Grund: GitHub schickt Fehler-Mails zu Zeitplänen an den, der den Zeitplan zuletzt geändert hat, und das war ein Claude-Commit.
  - **Pages:** Schon der Push durch `GITHUB_TOKEN` löst die Veröffentlichung aus. Die zusätzliche Anforderung ersetzt diese nur durch eine gleichwertige. Sie ist harmlos und bleibt als Rückfallebene.
  - Anmeldung und Abruf teilen sich die `concurrency`-Gruppe `microsoft-todo`.
- **Regeln beim Zusammenbau:**
  - Ein Ziel erscheint, solange **mindestens eine** Aufgabe aus seinem `todo` in To Do steht.
  - Aufgaben ohne Ziel landen in `daten/offen.json`, ausser ihr Titel steht in `keinAusflugsziel`. Der Vergleich läuft über den Titel, Gross-/Kleinschreibung zählt nicht. Über den Titel deshalb, weil die Aufgabe „Interaktive Karte (Link)“ nach dem Löschen mit neuer id wieder auftauchte.
  - **Saison und Regentag:** Fehlen sie bei einem Ziel, warnt der Lauf (gelb) und baut trotzdem; siehe „Datenformat“.
  - **Sicherheitsgrenze:** Ist die Liste leer oder würden mehr als 10 Ziele auf einmal verschwinden, ändert die Action nichts, und der Lauf wird rot. War es Absicht, „Run workflow“ mit „trotzdem“ starten.
- **Öffentliches Protokoll:** Nie Tokens, Notizen, Status oder die Namen anderer Listen ausgeben. Titel und Aufgaben-IDs dürfen erscheinen.
- **Für Claude:** Läufe lassen sich über GitHub-MCP starten (`actions_run_trigger`, z.B. mit `inputs: {probelauf: true}`), Protokolle liest `get_job_logs`. Ein direkter Download aus der Sandbox ist nicht möglich.

## Fahrzeiten

- **Quelle:** Routenplaner der FOSSGIS, OSRM-Tabelle auf `https://routing.openstreetmap.de/routed-car/table/v1/driving/` (Strassendaten von OpenStreetMap, täglich aktualisiert). Kein Konto, kein Schlüssel. Nutzungsbedingungen: höchstens eine Anfrage pro Sekunde (`PAUSE = 1.1`), erkennbare Kennung im User-Agent (`KENNUNG`), Quellenangabe. FOSSGIS darf den Dienst jederzeit einstellen; die gespeicherten Zeiten bleiben dann erhalten, nur neue fehlen. Ausweichmöglichkeit: OpenRouteService (braucht Konto und Schlüssel als Secret).
- **Startorte** (`daten/startorte.json`): Kantonshauptorte, grössere Orte und Talorte (Bergell, Goms, Val Müstair, Vallée de Joux …), dazu auf Wunsch des Besitzers dichter im Raum Aargau, Zürich, Schaffhausen, St. Gallen und Thurgau, wo die meisten Besucher erwartet werden. Lage aus GeoNames (CC BY 4.0, siehe `LIZENZEN.txt`): bei Orten mit mehreren Postleitzahlen die mittlere Lage der Einträge derselben Gemeinde (der erste Eintrag liegt oft daneben, z.B. «Zürich» beim Flughafen). Abstand jeder Schweizer Postleitzahl zum nächsten Startort: Median 5 km, höchstens 18 km; in AG/ZH/SH/SG/TG Median 4 km, höchstens 13 km. Feld `name` ist der Schlüssel; Namen nicht doppelt.
- **Ablauf** (`werkzeuge/fahrzeiten.py`, Schritt „Fahrzeiten berechnen“ im To-Do-Abruf nach dem Zusammenbau): liest `daten/startorte.json` und `ausfluege.json` und rechnet nur, was fehlt: neue Ziele und Ziele mit geänderten Koordinaten (gegen alle Startorte), neue Startorte (gegen alle übrigen Ziele). Anfragen in Blöcken zu 10 Startorten × 40 Zielen. Beim ersten Mal 76 Anfragen (knapp 1½ Minuten), danach meist keine. Entfernte Ziele und Startorte fallen weg.
- **Format von `fahrzeiten.json`:** `quelle`, `startorte` als `[name, lat, lon]` und `ziele` als `{id: {lat, lon, min: [Minuten je Startort in derselben Reihenfolge]}}`, eine Zeile pro Startort und pro Ziel (`als_text()`). `null` heisst „keine Route“. Ohne Änderung bleibt die Datei Zeichen für Zeichen gleich.
- **Fehler:** Antwortet der Dienst nicht (nach zwei Versuchen pro Anfrage), schreibt der Lauf eine gelbe Warnung und lässt `fahrzeiten.json`, wie sie war (alles oder nichts); der Rest des To-Do-Abrufs läuft normal, der nächste Lauf versucht es wieder.
- **Protokoll:** Anzahl gerechneter Ziele, Startorte und Anfragen, Ziele mehr als 3 km von der nächsten Strasse (dort wird bis zur Strasse gerechnet, z.B. Gipfel mit Bergbahn), Paare ohne Route und Stichproben (Zürich/Bern → Zoo Basel, Verkehrshaus, Technorama).

## Neue Ziele ergänzen

1. `daten/offen.json` vom aktuellen `main` lesen. Falls nötig, vorher den „To-Do-Abruf“ laufen lassen.
2. Pro Aufgabe recherchieren: genauer Ort, Koordinaten, passende Kategorie, **Saison und Regentag** (siehe „Datenformat“), kurze Beschreibung mit Kinderbezug, offizielle Website und ein schöner Titel im Stil der bestehenden.
3. **Duplikat?** Gibt es das Ziel schon (gleicher Ort oder gleiche Website), kein neues Ziel anlegen. Stattdessen die Aufgaben-ID im `todo` des bestehenden Ziels ergänzen und im PR erwähnen: „X ist doppelt zu Y, eine davon kann in To Do gelöscht werden.“ Welche gelöscht wird, spielt keine Rolle.
4. Neues Ziel in `daten/ziele.json` ergänzen: `id` nach der Regel oben, `saison` und `regentag` direkt nach `kat`, `"todo": ["<id aus offen.json>"]`. Im PR Saison und Regentag pro Ziel nennen, unsichere Fälle markieren. Prüfen, dass alle Kurzcodes verschieden bleiben.
5. **`ausfluege.json` nicht anfassen.** Zum Testen eine Kopie lokal erzeugen, z.B. mit `todo.zusammenbauen()` und allen `todo`-IDs als Liste, und nicht committen.
6. PR erstellen. Nach dem Merge startet der „To-Do-Abruf“ von selbst und baut die Website-Daten neu. Das Ziel ist nach 1–2 Minuten live.
7. Ist eine Aufgabe kein Ausflugsziel, ihren Titel in `keinAusflugsziel` eintragen und im PR erwähnen.
