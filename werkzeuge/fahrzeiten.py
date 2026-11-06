#!/usr/bin/env python3
"""Fahrzeiten mit dem Auto von den Startorten zu allen Zielen der Website. Nur Python-Standardbibliothek.

  python3 -u werkzeuge/fahrzeiten.py

Liest daten/startorte.json und ausfluege.json und ergänzt fahrzeiten.json um das, was fehlt:
neue Ziele, Ziele mit geänderten Koordinaten und neue Startorte. Gerechnet wird mit dem freien
Routenplaner der FOSSGIS (OSRM auf routing.openstreetmap.de, Daten von OpenStreetMap), höchstens
eine Anfrage pro Sekunde. Die Zeiten gelten ohne Stau, gerundet auf Minuten.

Antwortet der Routenplaner nicht, gibt es eine Warnung im Protokoll und fahrzeiten.json bleibt,
wie sie war. Der nächste Lauf versucht es nochmals.

Umgebung: PROBELAUF=true (rechnen und berichten, nichts schreiben).
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request

OSRM = 'https://routing.openstreetmap.de/routed-car/table/v1/driving/'
KENNUNG = 'Ausflugskarte (https://github.com/xpliarmus/ausflugskarte)'  # FOSSGIS verlangt eine erkennbare Kennung
PAUSE = 1.1          # FOSSGIS erlaubt höchstens eine Anfrage pro Sekunde
VERSUCHE = 2         # pro Anfrage, mit kurzer Pause dazwischen
STARTORTE_PRO = 10   # Orte pro Anfrage: 10 Startorte × 40 Ziele
ZIELE_PRO = 40
WEIT_M = 3000        # liegt die nächste Strasse weiter weg vom Ziel, steht es im Protokoll
QUELLE = 'Fahrzeiten mit dem Auto ohne Stau: OSRM (routing.openstreetmap.de), Daten © OpenStreetMap-Mitwirkende'

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STARTORTE = os.path.join(REPO, 'daten', 'startorte.json')
WEBSITE = os.path.join(REPO, 'ausfluege.json')
FAHRZEITEN = os.path.join(REPO, 'fahrzeiten.json')   # wird erzeugt, nicht von Hand bearbeiten


class Fehler(Exception):
    pass


def lesen(pfad, ersatz=None):
    try:
        with open(pfad, encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        return ersatz


def als_text(daten):
    """Eine Zeile pro Startort und pro Ziel, damit Änderungen gut lesbar bleiben."""
    z = lambda x: json.dumps(x, ensure_ascii=False, separators=(',', ':'))
    teile = ['{', ' "quelle": %s,' % z(daten['quelle']), ' "startorte": [']
    teile.append(',\n'.join('  ' + z(s) for s in daten['startorte']))
    teile += [' ],', ' "ziele": {']
    teile.append(',\n'.join('  %s: %s' % (z(i), z(v)) for i, v in daten['ziele'].items()))
    teile += [' }', '}']
    return '\n'.join(t for t in teile if t) + '\n'


def anfrage(starts, ziele):
    """Fahrzeiten in Minuten [Startort][Ziel] (None = keine Route) und Abstand Ziel–Strasse in Metern."""
    punkte = starts + ziele
    url = (OSRM + ';'.join('%.5f,%.5f' % (p['lon'], p['lat']) for p in punkte) +
           '?sources=' + ';'.join(str(i) for i in range(len(starts))) +
           '&destinations=' + ';'.join(str(i) for i in range(len(starts), len(punkte))) +
           '&annotations=duration')
    letzter = None
    for versuch in range(VERSUCHE):
        if versuch:
            time.sleep(5)
        try:
            req = urllib.request.Request(url, headers={'User-Agent': KENNUNG})
            with urllib.request.urlopen(req, timeout=60) as r:
                antwort = json.load(r)
            if antwort.get('code') != 'Ok':
                raise Fehler('Antwort „%s“' % antwort.get('code'))
            minuten = [[None if s is None else round(s / 60) for s in zeile] for zeile in antwort['durations']]
            abstand = [w.get('distance', 0) for w in antwort.get('destinations', [])]
            if len(minuten) != len(starts) or any(len(zeile) != len(ziele) for zeile in minuten):
                raise Fehler('unvollständige Antwort')
            return minuten, abstand
        except urllib.error.HTTPError as e:
            letzter = 'HTTP %d' % e.code
        except (urllib.error.URLError, OSError, ValueError, KeyError, TypeError, Fehler) as e:
            letzter = str(getattr(e, 'reason', None) or e)
    raise Fehler('Der Routenplaner antwortet nicht (%s).' % letzter)


def tabelle(starts, ziele, zaehler):
    """Fahrzeiten für alle Paare, in Blöcken abgefragt."""
    werte, abstand = {}, {}
    for a in range(0, len(starts), STARTORTE_PRO):
        for b in range(0, len(ziele), ZIELE_PRO):
            if zaehler[0]:
                time.sleep(PAUSE)
            zaehler[0] += 1
            s, z = starts[a:a + STARTORTE_PRO], ziele[b:b + ZIELE_PRO]
            minuten, weg = anfrage(s, z)
            for i, start in enumerate(s):
                for j, ziel in enumerate(z):
                    werte[(start['name'], ziel['id'])] = minuten[i][j]
            for j, ziel in enumerate(z):
                abstand[ziel['id']] = weg[j] if j < len(weg) else 0
    return werte, abstand


def berechnen(startorte, ziele, alt):
    """Neue fahrzeiten.json aus den bisherigen Werten und dem, was neu zu rechnen ist."""
    alt = alt or {}
    bisher_s = {s[0]: i for i, s in enumerate(alt.get('startorte', []))}
    gleich_s = {s['name'] for s in startorte if s['name'] in bisher_s
                and alt['startorte'][bisher_s[s['name']]][1:] == [s['lat'], s['lon']]}
    bisher_z = alt.get('ziele', {})
    gleich_z = {z['id'] for z in ziele if z['id'] in bisher_z
                and [bisher_z[z['id']]['lat'], bisher_z[z['id']]['lon']] == [z['lat'], z['lon']]
                and len(bisher_z[z['id']]['min']) == len(bisher_s)}
    neue_s = [s for s in startorte if s['name'] not in gleich_s]
    neue_z = [z for z in ziele if z['id'] not in gleich_z]
    werte = {(s, i): bisher_z[i]['min'][bisher_s[s]] for s in gleich_s for i in gleich_z}

    zaehler, abstand = [0], {}
    if neue_z:
        w, a = tabelle(startorte, neue_z, zaehler)
        werte.update(w); abstand.update(a)
    alte_z = [z for z in ziele if z['id'] in gleich_z]
    if neue_s and alte_z:
        w, _ = tabelle(neue_s, alte_z, zaehler)
        werte.update(w)

    neu = {'quelle': QUELLE,
           'startorte': [[s['name'], s['lat'], s['lon']] for s in startorte],
           'ziele': {z['id']: {'lat': z['lat'], 'lon': z['lon'], 'min': [werte[(s['name'], z['id'])] for s in startorte]}
                     for z in ziele}}
    return neu, neue_z, neue_s, zaehler[0], abstand


def main():
    probelauf = os.environ.get('PROBELAUF') == 'true'
    startorte = (lesen(STARTORTE) or {}).get('startorte', [])
    ziele = [{'id': a['id'], 'titel': a['titel'], 'lat': a['lat'], 'lon': a['lon']}
             for a in (lesen(WEBSITE) or {}).get('ausfluege', [])]
    if not startorte or not ziele:
        print('::warning::Fahrzeiten: keine Startorte oder keine Ziele gefunden, nichts berechnet.', flush=True)
        return 0
    alt = lesen(FAHRZEITEN)
    try:
        neu, neue_z, neue_s, anfragen, abstand = berechnen(startorte, ziele, alt)
    except Fehler as e:
        print('::warning::Fahrzeiten nicht aktualisiert: %s Die bisherigen Zeiten bleiben, '
              'der nächste Lauf versucht es nochmals.' % e, flush=True)
        return 0

    print('✓ Fahrzeiten: %d Startorte, %d Ziele; neu gerechnet: %d Ziele, %d Startorte (%d Anfragen).'
          % (len(startorte), len(ziele), len(neue_z), len(neue_s), anfragen), flush=True)
    titel = {z['id']: z['titel'] for z in ziele}
    for z in neue_z:
        if abstand.get(z['id'], 0) > WEIT_M:
            print('  · %s liegt %.1f km von der nächsten Strasse, gerechnet bis dorthin.'
                  % (z['titel'], abstand[z['id']] / 1000))
    ohne = [(s[0], i) for i, v in neu['ziele'].items() for s, m in zip(neu['startorte'], v['min']) if m is None]
    if ohne:
        print('  · %d Paare ohne Route, z.B. %s → %s.' % (len(ohne), ohne[0][0], titel[ohne[0][1]]))
    # Stichproben zum Nachprüfen
    for start_name in ('Zürich', 'Bern'):
        if start_name in [s['name'] for s in startorte]:
            si = [s['name'] for s in startorte].index(start_name)
            for zid in [i for i in ('zoo-basel', 'verkehrshaus-luzern', 'technorama-winterthur') if i in neu['ziele']]:
                m = neu['ziele'][zid]['min'][si]
                print('  %s → %s: %s' % (start_name, titel[zid], '%d Min.' % m if m is not None else 'keine Route'))

    if probelauf:
        print('Probelauf: nichts gespeichert.', flush=True)
        return 0
    text = als_text(neu)
    vorher = None
    if os.path.exists(FAHRZEITEN):
        with open(FAHRZEITEN, encoding='utf-8') as f:
            vorher = f.read()
    if text != vorher:
        with open(FAHRZEITEN, 'w', encoding='utf-8') as f:
            f.write(text)
        print('✓ fahrzeiten.json neu geschrieben.', flush=True)
    return 0


if __name__ == '__main__':
    sys.exit(main())
