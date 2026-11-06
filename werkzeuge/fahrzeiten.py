#!/usr/bin/env python3
"""Fahrzeiten mit dem Auto von den Startorten zu allen Zielen der Website. Nur Python-Standardbibliothek.

  python3 -u werkzeuge/fahrzeiten.py

Liest daten/startorte.json und ausfluege.json und ergänzt fahrzeiten.json um das, was fehlt:
neue Ziele, Ziele mit geänderten Koordinaten und neue Startorte. Gerechnet wird mit dem freien
Routenplaner der FOSSGIS (OSRM auf routing.openstreetmap.de, Daten von OpenStreetMap), höchstens
eine Anfrage pro Sekunde. Die Zeiten gelten ohne Stau, gerundet auf Minuten.

Pro Lauf wird höchstens ZEIT Sekunden gerechnet. Was bis dahin fertig ist (ganze Blöcke von Zielen
bzw. Startorten), wird gespeichert; der nächste Lauf rechnet dort weiter. Antwortet der Routenplaner
nicht, gibt es eine Warnung im Protokoll, und das bisher Fertige bleibt ebenfalls gespeichert.

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
WARTEN = 30          # Sekunden, bis eine Anfrage als gescheitert gilt
ZEIT = 240           # höchstens so viele Sekunden pro Lauf rechnen, der Rest folgt beim nächsten Lauf
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
            with urllib.request.urlopen(req, timeout=WARTEN) as r:
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


class Rechner:
    """Fragt die Tabelle blockweise ab, mit Pause, Zeitgrenze und Fortschritt im Protokoll."""

    def __init__(self, gesamt):
        self.anfragen, self.gesamt, self.start = 0, gesamt, time.monotonic()

    def bloecke(self, starts, ziele):
        """Fahrzeiten für alle Paare; Fehler oder Zeitgrenze brechen mit Fehler bzw. Zeitende ab."""
        werte, abstand = {}, {}
        for a in range(0, len(starts), STARTORTE_PRO):
            for b in range(0, len(ziele), ZIELE_PRO):
                if time.monotonic() - self.start > ZEIT:
                    raise Zeitende()
                if self.anfragen:
                    time.sleep(PAUSE)
                self.anfragen += 1
                s, z = starts[a:a + STARTORTE_PRO], ziele[b:b + ZIELE_PRO]
                t = time.monotonic()
                minuten, weg = anfrage(s, z)
                print('  Anfrage %d/%d: %d Startorte × %d Ziele, %.1f s'
                      % (self.anfragen, self.gesamt, len(s), len(z), time.monotonic() - t), flush=True)
                for i, start in enumerate(s):
                    for j, ziel in enumerate(z):
                        werte[(start['name'], ziel['id'])] = minuten[i][j]
                for j, ziel in enumerate(z):
                    abstand[ziel['id']] = weg[j] if j < len(weg) else 0
        return werte, abstand


class Zeitende(Exception):
    pass


def anzahl(n_s, n_z):
    return -(-n_s // STARTORTE_PRO) * -(-n_z // ZIELE_PRO) if n_s and n_z else 0


def berechnen(startorte, ziele, alt):
    """Neue fahrzeiten.json aus den bisherigen Werten und dem, was neu zu rechnen ist.

    Gerechnet wird in ganzen Blöcken: zuerst neue Ziele (je bis 40, gegen alle Startorte), dann neue
    Startorte (je bis 10, gegen alle bisherigen Ziele). Was fertig ist, kommt in die Datei, auch wenn
    danach die Zeit abläuft oder der Dienst ausfällt; der Rest folgt beim nächsten Lauf.
    """
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
    alte_z = [z for z in ziele if z['id'] in gleich_z]
    werte = {(s, i): bisher_z[i]['min'][bisher_s[s]] for s in gleich_s for i in gleich_z}

    rechner = Rechner(anzahl(len(startorte), len(neue_z)) + anzahl(len(neue_s), len(alte_z)))
    fertig_z, fertig_s, abstand, problem = set(), set(), {}, None
    try:
        for b in range(0, len(neue_z), ZIELE_PRO):          # neue Ziele, blockweise gegen alle Startorte
            block = neue_z[b:b + ZIELE_PRO]
            w, a = rechner.bloecke(startorte, block)
            werte.update(w); abstand.update(a); fertig_z.update(z['id'] for z in block)
        for a in range(0, len(neue_s), STARTORTE_PRO):      # neue Startorte gegen alle bisherigen Ziele
            block = neue_s[a:a + STARTORTE_PRO]
            if alte_z:
                w, _ = rechner.bloecke(block, alte_z)
                werte.update(w)
            fertig_s.update(s['name'] for s in block)
    except Zeitende:
        problem = 'zeit'
    except Fehler as e:
        problem = str(e)

    # Ein Startort kommt in die Datei, wenn er für alle gespeicherten Ziele Werte hat
    starts = [s for s in startorte if s['name'] in gleich_s or s['name'] in fertig_s or not alte_z]
    drin = [z for z in ziele if z['id'] in gleich_z or z['id'] in fertig_z]
    neu = {'quelle': QUELLE,
           'startorte': [[s['name'], s['lat'], s['lon']] for s in starts],
           'ziele': {z['id']: {'lat': z['lat'], 'lon': z['lon'], 'min': [werte[(s['name'], z['id'])] for s in starts]}
                     for z in drin}}
    offen = (len(neue_z) - len(fertig_z), len(neue_s) - len(fertig_s))
    dauer = time.monotonic() - rechner.start
    return neu, [z for z in neue_z if z['id'] in fertig_z], (rechner.anfragen, dauer), abstand, problem, offen


def main():
    probelauf = os.environ.get('PROBELAUF') == 'true'
    startorte = (lesen(STARTORTE) or {}).get('startorte', [])
    ziele = [{'id': a['id'], 'titel': a['titel'], 'lat': a['lat'], 'lon': a['lon']}
             for a in (lesen(WEBSITE) or {}).get('ausfluege', [])]
    if not startorte or not ziele:
        print('::warning::Fahrzeiten: keine Startorte oder keine Ziele gefunden, nichts berechnet.', flush=True)
        return 0
    alt = lesen(FAHRZEITEN)
    neu, neue_z, (anfragen, dauer), abstand, problem, offen = berechnen(startorte, ziele, alt)
    print('✓ Fahrzeiten: %d Startorte, %d Ziele (%d Anfragen in %.0f s).'
          % (len(neu['startorte']), len(neu['ziele']), anfragen, dauer), flush=True)
    if problem == 'zeit':
        print('::notice::Fahrzeiten noch nicht fertig: %d Ziele und %d Startorte fehlen. '
              'Der nächste Lauf rechnet weiter.' % offen, flush=True)
    elif problem:
        print('::warning::Fahrzeiten unvollständig: %s Gespeichert ist, was fertig war; '
              'der nächste Lauf versucht den Rest nochmals.' % problem, flush=True)
    titel = {z['id']: z['titel'] for z in ziele}
    for z in neue_z:
        if abstand.get(z['id'], 0) > WEIT_M:
            print('  · %s liegt %.1f km von der nächsten Strasse, gerechnet bis dorthin.'
                  % (z['titel'], abstand[z['id']] / 1000))
    ohne = [(s[0], i) for i, v in neu['ziele'].items() for s, m in zip(neu['startorte'], v['min']) if m is None]
    if ohne:
        print('  · %d Paare ohne Route, z.B. %s → %s.' % (len(ohne), ohne[0][0], titel[ohne[0][1]]))
    # Stichproben zum Nachprüfen
    namen = [s[0] for s in neu['startorte']]
    for start_name in ('Zürich', 'Bern'):
        if start_name in namen:
            si = namen.index(start_name)
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
    if text != vorher and (neu['ziele'] or vorher is not None):
        with open(FAHRZEITEN, 'w', encoding='utf-8') as f:
            f.write(text)
        print('✓ fahrzeiten.json neu geschrieben.', flush=True)
    return 0


if __name__ == '__main__':
    sys.exit(main())
