# Ausflugsideen mit Kindern

Interaktive Karte mit unseren Ausflugsideen für die Familie: Schweiz und Umgebung.

**Live:** https://xpliarmus.github.io/ausflugskarte/

## So funktioniert es

- **Karte:** OpenStreetMap oder auf Wunsch die Landeskarte von swisstopo (nur Schweiz).
- **Liste:** Jahreszeit (Alle, Sommer, Winter), Filtern nach Kategorie (auf dem Handy über den Knopf „Filter“), „Regentag“, Suche nach Ort oder Titel, „nur offene“.
- **Fahrzeit:** Im Feld „📍 Von wo?“ einen Ort oder eine Postleitzahl eingeben oder mit 🗺️ einen Punkt auf der Karte wählen. Die Liste zeigt dann die geschätzte Fahrzeit mit dem Auto (ohne Stau), sortiert danach und filtert auf Wunsch nach Umkreis (30 Minuten bis 2 Stunden). Die Fahrzeiten von 181 Orten in der Schweiz sind vorberechnet; die Seite schätzt daraus die Zeit ab dem eigenen Startpunkt. Der Startpunkt bleibt im eigenen Browser und wird nirgends hingeschickt.
- **Woher die Ziele kommen:** Wir sammeln unsere Ideen in einer Microsoft-To-Do-Liste. Jeden Morgen gleicht die Website sich automatisch damit ab. Neue Ideen erscheinen, sobald Ort, Beschreibung und Link ergänzt sind. Aus To Do werden nur die Titel gelesen.
- **Erledigt-Haken:** Jede Besucherin und jeder Besucher hakt für sich selbst ab. Die Haken werden nur im eigenen Browser gespeichert. Es gibt kein Konto, und nichts wird an einen Server geschickt.
- **Erledigte Ziele teilen:** Der Knopf oben erzeugt einen Link mit den eigenen Haken, z.B. fürs eigene Handy oder für die Familie. Wer den Link öffnet, wird zuerst gefragt, ob die erledigten Ziele übernommen werden sollen. Bereits gesetzte Haken bleiben dabei immer erhalten. Die Haken stehen im Teil nach dem `#` und erreichen deshalb nie einen Server.

## Dateien

| Datei | Inhalt |
|---|---|
| `index.html` | Seitengerüst |
| `style.css` | Gestaltung (hell und dunkel, Desktop und Mobile) |
| `app.js` | Karte, Liste, Filter und Haken |
| `ausfluege.json` | Die Ausflugsziele für die Website. Wird automatisch erzeugt. |
| `daten/ziele.json` | Angaben zu allen Zielen (Ort, Koordinaten, Beschreibung, Link) und die zugehörigen To-Do-Aufgaben |
| `daten/offen.json` | Ideen aus To Do, deren Angaben noch fehlen |
| `werkzeuge/todo.py`, `.github/workflows/` | Abruf aus Microsoft To Do (GitHub Actions) |
| `daten/startorte.json`, `fahrzeiten.json`, `werkzeuge/fahrzeiten.py` | Startorte und vorberechnete Fahrzeiten (wird automatisch ergänzt) |
| `orte.json`, `werkzeuge/orte.py` | Schweizer Orte und Postleitzahlen für das Feld „Von wo?“ |
| `leaflet.js`, `leaflet.css` | Kartenbibliothek [Leaflet](https://leafletjs.com) 1.9.4 |
| `fredoka.woff2`, `karla.woff2` | Schriften, lokal eingebunden (keine Anfragen an Google) |
| `LIZENZEN.txt` | Lizenzen von Leaflet, den Schriften und den Daten |

## Quellen und Lizenzen

- Kartendaten © [OpenStreetMap](https://www.openstreetmap.org/copyright)-Mitwirkende, Kartenkacheln vom OpenStreetMap-Tileserver
- Landeskarte © [swisstopo](https://www.swisstopo.admin.ch/)
- Fahrzeiten: [OSRM](https://project-osrm.org) auf dem Routing-Server der FOSSGIS, Strassendaten © OpenStreetMap-Mitwirkende (ODbL)
- Orte und Postleitzahlen: [GeoNames](https://www.geonames.org) (CC BY 4.0)
- Leaflet (BSD-2-Clause), Fredoka und Karla (SIL Open Font License 1.1): siehe `LIZENZEN.txt`
