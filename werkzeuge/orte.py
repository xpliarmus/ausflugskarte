#!/usr/bin/env python3
"""Ortsliste für das Feld «Von wo?» auf der Website. Nur Python-Standardbibliothek.

  python3 werkzeuge/orte.py CH.zip        (oder die entpackte CH.txt)

CH.zip sind die Schweizer Postleitzahlen von GeoNames (https://download.geonames.org/export/zip/CH.zip,
CC BY 4.0). Daraus entsteht orte.json: ein Eintrag pro Ort und Kanton mit allen Postleitzahlen und
einer Lage. Postfach-Einträge (Namen mit Ziffern wie «Bern 1») fallen weg. Hat ein Ort mehrere
Einträge, gilt der Eintrag, der ihrer mittleren Lage am nächsten liegt (wie bei den Startorten).

Nur selten nötig, z.B. wenn Orte fehlen. Die Website liest orte.json erst, wenn jemand das Feld benutzt.
"""
import io
import json
import os
import re
import sys
import unicodedata
import zipfile

QUELLE = 'Orte und Postleitzahlen: GeoNames (geonames.org), CC BY 4.0'
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ZIEL = os.path.join(REPO, 'orte.json')


def zeilen(pfad):
    """Zeilen der GeoNames-Datei (Tabulator-getrennt), auch direkt aus CH.zip."""
    if pfad.lower().endswith('.zip'):
        with zipfile.ZipFile(pfad) as z:
            text = z.read('CH.txt').decode('utf-8')
    else:
        with io.open(pfad, encoding='utf-8') as f:
            text = f.read()
    for zeile in text.splitlines():
        teile = zeile.split('\t')
        if len(teile) >= 11 and teile[0] == 'CH':
            yield teile


def median(werte):
    s = sorted(werte)
    return s[len(s) // 2]


def sortierschluessel(name):
    return unicodedata.normalize('NFKD', name).encode('ascii', 'ignore').decode().lower()


def orte(pfad):
    gruppen = {}
    for t in zeilen(pfad):
        plz, name, kanton = t[1].strip(), t[2].strip(), t[4].strip()
        if not re.fullmatch(r'\d{4}', plz) or not name or re.search(r'\d', name):
            continue  # Postfächer («Bern 1», «Aarau 1») und unvollständige Zeilen
        try:
            lat, lon = round(float(t[9]), 4), round(float(t[10]), 4)
        except ValueError:
            continue
        g = gruppen.setdefault((name, kanton), {'plz': set(), 'lage': []})
        g['plz'].add(plz)
        g['lage'].append((lat, lon))
    liste = []
    for (name, kanton), g in gruppen.items():
        mlat = median(p[0] for p in g['lage'])
        mlon = median(p[1] for p in g['lage'])
        lat, lon = min(g['lage'], key=lambda p: (p[0] - mlat) ** 2 + (p[1] - mlon) ** 2)
        liste.append([name, kanton, lat, lon, ' '.join(sorted(g['plz']))])
    liste.sort(key=lambda o: (sortierschluessel(o[0]), o[1]))
    return liste


def als_text(liste):
    zeilen_ = [json.dumps(o, ensure_ascii=False, separators=(',', ':')) for o in liste]
    return '{\n "quelle": %s,\n "orte": [\n  %s\n ]\n}\n' % (json.dumps(QUELLE, ensure_ascii=False), ',\n  '.join(zeilen_))


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    liste = orte(sys.argv[1])
    if len(liste) < 1000:
        sys.exit('Nur %d Orte gefunden, das ist zu wenig. Ist es die Datei CH.zip von GeoNames?' % len(liste))
    with io.open(ZIEL, 'w', encoding='utf-8', newline='\n') as f:
        f.write(als_text(liste))
    print('✓ %d Orte in orte.json geschrieben.' % len(liste))


if __name__ == '__main__':
    main()
