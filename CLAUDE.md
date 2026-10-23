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

Bewusst flach und ohne Build-Schritt. So lassen sich Dateien notfalls auch von Hand über die GitHub-Weboberfläche hochladen.

| Datei | Inhalt |
|---|---|
| `index.html` | Seitengerüst. Lädt `style.css?v=N` und `app.js?v=N`. |
| `style.css` | Gestaltung: Farb-Tokens in `:root`, Dark Mode über `prefers-color-scheme`, Mobile-Layout ab `max-width: 880px`. |
| `app.js` | Lädt `ausfluege.json` und baut Liste, Filter, Karte und Haken auf (ES5-nah, keine Abhängigkeiten ausser Leaflet). |
| `ausfluege.json` | **Die Daten** (siehe unten). |
| `leaflet.js`, `leaflet.css` | Leaflet 1.9.4, lokal eingebunden (kein CDN). |
| `fraunces.woff2`, `karla.woff2` | Schriften lokal (Fontsource, latin, variable). Keine Anfragen an Google Fonts. |
| `README.md`, `LIZENZEN.txt` | Beschreibung für Besucher und Drittanbieter-Lizenzen. |

### Datenformat `ausfluege.json`

```json
{
  "stand": "2026-10-21",
  "kategorien": [{ "key": "tier", "label": "Tierpark/Zoo", "farbe": "#ba3636" }],
  "ausfluege": [{
    "id": "affenberg-salem", "titel": "Affenberg Salem",
    "ort": "Salem (Mendlishausen)", "region": "Baden-Württemberg", "land": "Deutschland",
    "lat": 47.767, "lon": 9.2295, "kat": "tier",
    "beschreibung": "…", "hinweis": "… (optional)", "website": "https://… (optional)",
    "ungefaehr": true
  }]
}
```

- **Kategorien (9):** `tier, kugel, sonst, wandern, wasser, berg, museum, spiel, park`.
- **`land`** wird in der Liste nur angezeigt, wenn es nicht „Schweiz“ ist.
- **`ungefaehr: true`** heisst, dass die Koordinaten nur geschätzt sind. In der Liste erscheint dann ein „~“.
- **`id`** ist der Schlüssel für die Erledigt-Haken der Besucher. **Eine bestehende `id` nie ändern**, sonst verlieren die Besucher ihre Haken. Für neue Einträge wird die `id` so gebildet: Titel in Kleinbuchstaben, Unicode-NFKD und auf ASCII reduzieren (ä→a), alles ausser `a-z0-9` durch `-` ersetzen, `-` am Rand entfernen.
- **`stand`** bei jeder Datenänderung auf das aktuelle Datum setzen.

### Verhalten der Seite

- **Karte:** Grundkarte sind die OpenStreetMap-Kacheln (`tile.openstreetmap.org`). Der Umschalter „Landeskarte CH“ lädt die swisstopo-Karte (`https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/{z}/{x}/{y}.jpeg`, maxNativeZoom 18). Die Quellenangaben (Attribution) müssen bleiben.
- **Startansicht:** alle Einträge im Umkreis von 300 km um den Median-Punkt (`CLUSTER_KM`). Weit entfernte Ziele wie die Steiermark sieht man erst beim Herauszoomen. Der Knopf ⟲ setzt die Ansicht zurück.
- **Liste:**
  - Kategorie-Chips mit Anzahl
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
- **Mein-Stand-Link** (Knopf „Mein Stand teilen“ `#teilenKnopf` / `.teilen-knopf` neben dem Zähler):
  - Format: `…/#stand=1.<Codes>`. `1` ist die Formatversion. Danach folgt pro erledigtem Eintrag ein Kurzcode aus 4 Zeichen (`0-9A-Za-z`), sortiert und ohne Trennzeichen.
  - Kurzcode = FNV-1a (32 Bit) über die `id`, reduziert auf 62⁴ Werte (`kurzcode()` in `app.js`). Haben zwei `id`s denselben Code, warnt die Konsole, und der Code wird beim Übernehmen ignoriert. Beim Hinzufügen von Einträgen prüfen, dass alle Codes verschieden sind.
  - Teilen: Auf Touch-Geräten (`pointer: coarse`) öffnet `navigator.share` das Teilen-Menü, sonst wird kopiert (`navigator.clipboard`). Klappt das nicht, erscheint ein Fenster mit dem Link.
  - Öffnen: Vorher fragt `<dialog id="frageFenster">` „Erledigte Ziele übernehmen?“ (ältere Browser: `confirm()`). Kein Knopf ist vorausgewählt. Bei „Übernehmen“ wird vereinigt. In jedem Fall wird das Fragment entfernt, und die Meldung `#meldung` / `.meldung` zeigt die Anzahl. Sind alle Haken schon da, erscheint keine Frage, nur ein Hinweis.
  - Unbekannte Codes werden übergangen. Andere Fragmente (`#irgendwas`) bleiben unangetastet. Bei einer unbekannten Formatversion bleibt das Fragment stehen, und die Seite bittet ums Neuladen.
  - Auch ein in einem offenen Tab eingefügter Link wirkt (`hashchange`).
- **Nach-oben-Knopf:** `#hochKnopf` / `.hochknopf` / `.sichtbar`. Auf dem Desktop scrollt er die Liste (`.sidebar`), mobil die ganze Seite.
- `<meta name="robots" content="noindex, nofollow">`: Die Seite soll nicht in Suchmaschinen erscheinen.

### Stolperfallen

- **Cache:** GitHub Pages liefert Dateien mit `max-age=600`. **Bei jeder Änderung an `style.css` oder `app.js` die Zahl `?v=N` in `index.html` erhöhen** (aktuell `v=3`). Sonst mischt der Browser bis zu 10 Minuten lang alte und neue Dateien.
- **Inhaltsblocker (Safari):** Sie blenden Elemente mit Namen wie `back-to-top`, `scroll-top` oder `to-top` aus. Darum heisst der Knopf `hochknopf`. Teilen-Knöpfe (`share`, `social`) werden ebenfalls oft ausgeblendet, darum `teilen-knopf`. Bei neuen schwebenden Elementen ebenfalls neutrale, deutsche Namen wählen.
- **Mobile:** Die Seite scrollt als Ganzes (keine Höhen-Tricks mit `100vh` in der Liste). Horizontales Scrollen muss ausgeschlossen bleiben (`overflow-x: hidden` auf `html`/`body`), die Chips scrollen horizontal für sich.
- **Leaflet-Stile:** Leaflet setzt eigene Regeln mit höherer Spezifität (z.B. `.leaflet-popup-content p`). Eigene Popup-Regeln darum mit `.leaflet-popup-content …` präfixen.

## Testen

```bash
python3 -m http.server 8899      # im Repo-Ordner
```

- **Mit Playwright** (Chromium) gegen `http://127.0.0.1:8899/` prüfen:
  - Desktop 1440×900, Dark Mode und ein iPhone-Profil
  - 86 Karten und 86 Pins; Filter, Suche und „nur offene“
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

## Fahrplan (jede Stufe einzeln mit OK)

1. ✅ **Website mit echter Karte** (Oktober 2026).
2. ✅ **„Mein-Stand-Link“** (Oktober 2026): Erledigt-Haken zwischen eigenen Geräten übertragen (z.B. Handy ↔ Laptop) oder an Familienmitglieder schicken. Umsetzung siehe „Verhalten der Seite“. Entscheidungen:
   - Der Stand steht im URL-Fragment (`#…`) und erreicht so nie einen Server. Es gibt kein Konto und keine Datenbank.
   - Beim Öffnen wird der Stand mit den vorhandenen Haken **zusammengeführt** (Vereinigung), damit nie ein Haken verloren geht. Dass Abwählen sich dadurch nicht überträgt, ist bewusst in Kauf genommen.
   - Der Link soll kompakt sein, also pro Eintrag ein Kurz-Hash statt der vollen `id`. Kollisionen müssen geprüft werden.
   - Vor dem Übernehmen fragt die Seite „Erledigte Ziele übernehmen?“. Wer einen Link versehentlich öffnet, muss so nichts zurücksetzen (Wunsch des Besitzers).
   - Nach dem Übernehmen wird das Fragment aus der Adresszeile entfernt, und ein kurzer Hinweis zeigt, wie viele Haken neu dazukamen.
   - Familienmitglieder haben keinen automatisch gemeinsamen Stand, sondern gleichen nur über diesen Link ab. Das ist so gewollt.
3. **Microsoft To Do als Quelle der Einträge.**
   - **Abruf:** Microsoft Graph, persönliches Microsoft-Konto, delegierte Berechtigung `Tasks.Read`, Refresh-Token als GitHub-Secret. Eine zeitgesteuerte GitHub Action erzeugt `ausfluege.json` neu. Der Besitzer muss einmalig eine App bei Microsoft registrieren; dafür eine Klick-für-Klick-Anleitung geben.
   - **Was übernommen wird:** To Do liefert **nur die Einträge**, nicht deren Erledigt-Status. Offene und abgeschlossene Aufgaben erscheinen beide. Ein Ziel verschwindet nur, wenn die Aufgabe in To Do gelöscht wird. Veröffentlicht werden nur die nötigen Felder, keine Notizen aus To Do.
   - **Schlüssel:** Ab dann ist die **To-Do-Aufgaben-ID** der Schlüssel. Es braucht eine einmalige Migration der alten Slug-`id` auf die neue ID, im Browser und für bereits erzeugte Links. Dafür alte IDs mitführen, z.B. im Feld `alteIds`. **Bereits geteilte Mein-Stand-Links** enthalten Kurzcodes der alten Slug-`id`s: Beim Aufbau der Code-Tabelle (`buildCodeMap()`) auch die Codes aus `alteIds` auf den neuen Eintrag zeigen lassen. Neue Links enthalten dann die Codes der To-Do-IDs; das Format bleibt `stand=1`.
   - **Noch offen:**
     - 14 Einträge stehen nicht in To Do (4 Maislabyrinthe, 4 Planetenwege, 6 Kugelbahn-Wanderwege). In To Do anlegen oder als Ergänzungsliste im Repo führen?
     - In To Do gibt es Duplikate (Bosch la Bova, Rugelreise Murgtal, Schlaufensteg Baar, Seebodenalp), die beim Einlesen zusammengeführt werden müssen.
     - „Brunni Engelberg Kugelbahnweg“ und „Holzkugelpfad Brunni“ sind vermutlich derselbe Weg (gleiche Website). Klären.
4. **Automatische Anreicherung** neuer Einträge (Ort, Koordinaten, Kategorie, Beschreibung, Website) über die Claude-API. Neue Einträge werden mit „bitte prüfen“ markiert.

## Neue Ideen bis Schritt 3

Der Besitzer nennt neue Ziele im Chat. Dann:

1. Recherchieren: genauer Ort, Koordinaten, passende Kategorie, kurze Beschreibung mit Kinderbezug, offizielle Website.
2. Den Eintrag in `ausfluege.json` ergänzen (`id` nach der Regel oben) und `stand` aktualisieren.
3. Testen und einen PR erstellen.
