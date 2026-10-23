# Ausflugsideen mit Kindern

Interaktive Karte mit unseren Ausflugsideen für die Familie: Schweiz und Umgebung.

**Live:** https://xpliarmus.github.io/ausflugskarte/

## So funktioniert es

- **Karte:** OpenStreetMap oder auf Wunsch die Landeskarte von swisstopo (nur Schweiz).
- **Liste:** Filtern nach Kategorie, Suche nach Ort oder Titel, „nur offene“.
- **Erledigt-Haken:** Jede Besucherin und jeder Besucher hakt für sich selbst ab. Die Haken werden nur im eigenen Browser gespeichert. Es gibt kein Konto, und nichts wird an einen Server geschickt.

## Dateien

| Datei | Inhalt |
|---|---|
| `index.html` | Seitengerüst |
| `style.css` | Gestaltung (hell und dunkel, Desktop und Mobile) |
| `app.js` | Karte, Liste, Filter und Haken |
| `ausfluege.json` | Die Ausflugsziele. Wird später automatisch aus Microsoft To Do erzeugt. |
| `leaflet.js`, `leaflet.css` | Kartenbibliothek [Leaflet](https://leafletjs.com) 1.9.4 |
| `fraunces.woff2`, `karla.woff2` | Schriften, lokal eingebunden (keine Anfragen an Google) |
| `LIZENZEN.txt` | Lizenzen von Leaflet und den Schriften |

## Quellen und Lizenzen

- Kartendaten © [OpenStreetMap](https://www.openstreetmap.org/copyright)-Mitwirkende, Kartenkacheln vom OpenStreetMap-Tileserver
- Landeskarte © [swisstopo](https://www.swisstopo.admin.ch/)
- Leaflet (BSD-2-Clause), Fraunces und Karla (SIL Open Font License 1.1): siehe `LIZENZEN.txt`
