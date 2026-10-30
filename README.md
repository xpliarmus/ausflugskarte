# Ausflugsideen mit Kindern

Interaktive Karte mit unseren Ausflugsideen für die Familie: Schweiz und Umgebung.

**Live:** https://xpliarmus.github.io/ausflugskarte/

## So funktioniert es

- **Karte:** OpenStreetMap oder auf Wunsch die Landeskarte von swisstopo (nur Schweiz).
- **Liste:** Filtern nach Kategorie (auf dem Handy über den Knopf „Filter“), Suche nach Ort oder Titel, „nur offene“.
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
| `leaflet.js`, `leaflet.css` | Kartenbibliothek [Leaflet](https://leafletjs.com) 1.9.4 |
| `fredoka.woff2`, `karla.woff2` | Schriften, lokal eingebunden (keine Anfragen an Google) |
| `LIZENZEN.txt` | Lizenzen von Leaflet und den Schriften |

## Quellen und Lizenzen

- Kartendaten © [OpenStreetMap](https://www.openstreetmap.org/copyright)-Mitwirkende, Kartenkacheln vom OpenStreetMap-Tileserver
- Landeskarte © [swisstopo](https://www.swisstopo.admin.ch/)
- Leaflet (BSD-2-Clause), Fredoka und Karla (SIL Open Font License 1.1): siehe `LIZENZEN.txt`
