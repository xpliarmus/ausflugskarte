#!/usr/bin/env python3
"""Microsoft To Do für die Ausflugskarte. Läuft in GitHub Actions, nur Python-Standardbibliothek.

  python3 -u werkzeuge/todo.py anmelden
      Einmalige Anmeldung per Code (microsoft.com/link). Speichert die Anmeldung
      (Refresh-Token) als Secret MS_REFRESH_TOKEN und prüft, ob die Liste da ist.

  python3 -u werkzeuge/todo.py aktualisieren
      Erneuert die Anmeldung (Microsoft liefert bei jedem Abruf eine neue, die alte
      läuft nach 90 Tagen ab), liest id und Titel aller Aufgaben der Liste und baut
      daraus mit daten/ziele.json die Website-Daten ausfluege.json sowie
      daten/offen.json (Aufgaben, zu denen noch keine Angaben vorliegen).
      Notizen und Erledigt-Status aus To Do werden nie gelesen oder ausgegeben.

Umgebung: MS_CLIENT_ID (Anwendungs-ID der App bei Microsoft),
          MS_REFRESH_TOKEN (nur für «aktualisieren»),
          GH_TOKEN (GitHub-Schlüssel, der Secrets dieses Repos schreiben darf),
          GITHUB_REPOSITORY (setzt GitHub selbst),
          PROBELAUF=true (nur prüfen, nichts schreiben), TROTZDEM=true (Sicherheitsgrenze aufheben).

Das Protokoll der Actions ist öffentlich: Tokens werden nie ausgegeben, sondern
sofort maskiert. Aus To Do wird nur gelesen (Berechtigung Tasks.Read).
"""
import json
import os
import subprocess
import sys
import time
import unicodedata
from datetime import datetime
from zoneinfo import ZoneInfo
import urllib.error
import urllib.parse
import urllib.request

LOGIN = 'https://login.microsoftonline.com/consumers/oauth2/v2.0'
GRAPH = 'https://graph.microsoft.com/v1.0'
SCOPE = 'https://graph.microsoft.com/Tasks.Read offline_access'
LISTE = 'Ausflugsideen'
SECRET = 'MS_REFRESH_TOKEN'

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ZIELE = os.path.join(REPO, 'daten', 'ziele.json')      # Angaben zu den Zielen + zugehörige To-Do-Aufgaben + „kein Ausflugsziel“
OFFEN = os.path.join(REPO, 'daten', 'offen.json')      # Aufgaben ohne Angaben (noch zu ergänzen)
WEBSITE = os.path.join(REPO, 'ausfluege.json')         # wird erzeugt, nicht von Hand bearbeiten
GRENZE = 10  # verschwinden mehr Ziele auf einmal, wird zur Sicherheit nichts geändert


class Fehler(Exception):
    pass


def maskieren(wert):
    """Wert im öffentlichen Protokoll unkenntlich machen (GitHub ersetzt ihn durch ***)."""
    if wert:
        print('::add-mask::' + wert, flush=True)


def kurz(text):
    """Microsoft-Fehlertext ohne die angehängten Trace-/Correlation-IDs."""
    return (text or '').split(' Trace ID:')[0].strip()


def post(url, felder):
    daten = urllib.parse.urlencode(felder).encode()
    try:
        with urllib.request.urlopen(urllib.request.Request(url, data=daten), timeout=30) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        try:
            return json.load(e)  # Microsoft liefert Fehler als JSON (error, error_description)
        except ValueError:
            raise Fehler('Microsoft antwortet mit HTTP %s.' % e.code)
    except urllib.error.URLError as e:
        raise Fehler('Keine Verbindung zu Microsoft (%s).' % e.reason)


def graph_get(url, token):
    req = urllib.request.Request(url, headers={'Authorization': 'Bearer ' + token})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        try:
            meldung = json.load(e).get('error', {}).get('message', '')
        except ValueError:
            meldung = ''
        raise Fehler('Microsoft Graph antwortet mit HTTP %s. %s' % (e.code, meldung))
    except urllib.error.URLError as e:
        raise Fehler('Keine Verbindung zu Microsoft Graph (%s).' % e.reason)


def alle(url, token):
    """Alle Seiten einer Graph-Antwort einsammeln."""
    werte = []
    while url:
        d = graph_get(url, token)
        werte += d.get('value', [])
        url = d.get('@odata.nextLink')
    return werte


def liste_finden(token):
    listen = alle(GRAPH + '/me/todo/lists', token)
    treffer = [l for l in listen if (l.get('displayName') or '').strip().casefold() == LISTE.casefold()]
    if not treffer:
        # Die Namen der anderen Listen bewusst nicht ausgeben (öffentliches Protokoll)
        raise Fehler('Die Liste „%s“ wurde nicht gefunden (%d Listen im Konto). Heisst sie genau so?' % (LISTE, len(listen)))
    if len(treffer) > 1:
        raise Fehler('Es gibt %d Listen namens „%s“. Bitte nur eine behalten.' % (len(treffer), LISTE))
    return treffer[0]


def aufgaben(token, liste):
    return alle(GRAPH + '/me/todo/lists/%s/tasks' % urllib.parse.quote(liste['id'], safe=''), token)


def secret_speichern(wert):
    repo = os.environ.get('GITHUB_REPOSITORY', '')
    r = subprocess.run(['gh', 'secret', 'set', SECRET, '--repo', repo],
                       input=wert, text=True, capture_output=True)
    if r.returncode != 0:
        raise Fehler('Die Anmeldung konnte nicht als Secret %s gespeichert werden: %s' % (SECRET, r.stderr.strip()))


def umgebung():
    client = os.environ.get('MS_CLIENT_ID', '').strip()
    if not client:
        raise Fehler('Das Secret MS_CLIENT_ID fehlt.')
    if not os.environ.get('GH_TOKEN'):
        raise Fehler('Das Secret GH_SECRETS_TOKEN fehlt.')
    return client


def tokens_uebernehmen(t):
    """Antwort von Microsoft: Tokens maskieren, neue Anmeldung speichern, Zugriffs-Token zurückgeben."""
    maskieren(t.get('access_token'))
    maskieren(t.get('refresh_token'))
    if not t.get('refresh_token'):
        raise Fehler('Microsoft hat keine dauerhafte Anmeldung geliefert (offline_access fehlt).')
    secret_speichern(t['refresh_token'])
    return t['access_token']


def anmelden():
    client = umgebung()

    d = post(LOGIN + '/devicecode', {'client_id': client, 'scope': SCOPE})
    if 'error' in d:
        raise Fehler('Microsoft lehnt die Anmeldung ab: %s (%s)' % (kurz(d.get('error_description')), d['error']))
    maskieren(d['device_code'])
    uri, code = d['verification_uri'], d['user_code']
    minuten = int(d.get('expires_in', 900)) // 60
    print('\n' + '=' * 60)
    print('  1. Öffne   %s' % uri)
    print('  2. Gib diesen Code ein:   %s' % code)
    print('  3. Melde dich mit deinem To-Do-Konto an und erlaube den Zugriff.')
    print('  Der Code ist %d Minuten gültig.' % minuten)
    print('=' * 60 + '\n', flush=True)
    print('::notice title=Anmeldecode::Code %s auf %s eingeben' % (code, uri), flush=True)

    intervall = int(d.get('interval', 5))
    ende = time.time() + int(d.get('expires_in', 900))
    while time.time() < ende:
        time.sleep(intervall)
        t = post(LOGIN + '/token', {
            'grant_type': 'urn:ietf:params:oauth:grant-type:device_code',
            'client_id': client,
            'device_code': d['device_code'],
        })
        fehler = t.get('error')
        if fehler == 'authorization_pending':
            continue
        if fehler == 'slow_down':
            intervall += 5
            continue
        if fehler == 'authorization_declined':
            raise Fehler('Der Zugriff wurde bei Microsoft abgelehnt. Bitte die Action nochmals starten und „Ja“ wählen.')
        if fehler == 'expired_token':
            break
        if fehler:
            raise Fehler('Anmeldung fehlgeschlagen: %s (%s)' % (kurz(t.get('error_description')), fehler))

        token = tokens_uebernehmen(t)
        print('✓ Anmeldung gespeichert (Secret %s).' % SECRET, flush=True)
        liste = liste_finden(token)
        print('✓ Liste „%s“ gefunden: %d Aufgaben.' % (LISTE, len(aufgaben(token, liste))), flush=True)
        return
    raise Fehler('Der Code ist abgelaufen. Bitte die Action nochmals starten.')


def erneuern():
    """Mit der gespeicherten Anmeldung ein Zugriffs-Token holen und die neue Anmeldung speichern."""
    client = umgebung()
    alt = os.environ.get('MS_REFRESH_TOKEN', '').strip()
    if not alt:
        raise Fehler('Das Secret %s fehlt. Bitte zuerst die Action „Microsoft-Anmeldung“ starten.' % SECRET)
    maskieren(alt)
    t = post(LOGIN + '/token', {'grant_type': 'refresh_token', 'client_id': client, 'refresh_token': alt, 'scope': SCOPE})
    if t.get('error') == 'invalid_grant':
        raise Fehler('Die Anmeldung bei Microsoft ist nicht mehr gültig. Bitte die Action „Microsoft-Anmeldung“ nochmals starten. (%s)'
                     % kurz(t.get('error_description')))
    if t.get('error'):
        raise Fehler('Anmeldung erneuern fehlgeschlagen: %s (%s)' % (kurz(t.get('error_description')), t['error']))
    return tokens_uebernehmen(t)


def sortierschluessel(text):
    """Umlaute wie Grundbuchstaben einsortieren (Ä bei A)."""
    return unicodedata.normalize('NFKD', text).encode('ascii', 'ignore').decode().casefold()


def lesen(pfad, ersatz=None):
    try:
        with open(pfad, encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        return ersatz


def schreiben(pfad, daten):
    """Gleiches Format wie die bisherige ausfluege.json: Einzug 1, Umlaute direkt."""
    with open(pfad, 'w', encoding='utf-8') as f:
        f.write(json.dumps(daten, ensure_ascii=False, indent=1))


def ohne_stand(daten):
    return {k: v for k, v in (daten or {}).items() if k != 'stand'}


def titel_schluessel(titel):
    return (titel or '').strip().casefold()


def kein_ziel(quelle, aufgabe):
    """Steht der Titel in „keinAusflugsziel“? Bewusst über den Titel, nicht die id:
    Solche Aufgaben tauchten nach dem Löschen schon mit neuer id wieder auf."""
    return titel_schluessel(aufgabe.get('title')) in {titel_schluessel(t) for t in quelle.get('keinAusflugsziel', [])}


def zusammenbauen(quelle, liste, alt, heute, trotzdem=False):
    """Website-Daten und offene Aufgaben aus den Angaben und der To-Do-Liste (ohne Netz).

    Ein Ziel erscheint, solange mindestens eine seiner Aufgaben in To Do steht. So schadet
    es nicht, wenn bei Duplikaten die eine oder andere Aufgabe gelöscht wird.
    Aufgaben aus „keinAusflugsziel“ erscheinen weder auf der Website noch in den offenen.
    Gibt (neue Website-Daten, offene Aufgaben, verschwundene Ziele) zurück.
    """
    vorhanden = {a['id'] for a in liste}
    zugeordnet = set()
    ausfluege = []
    for z in quelle['ziele']:
        todo = z.get('todo', [])
        zugeordnet.update(todo)
        if any(t in vorhanden for t in todo):
            ausfluege.append({k: v for k, v in z.items() if k != 'todo'})
    offen = sorted(({'id': a['id'], 'titel': (a.get('title') or '').strip()} for a in liste
                    if a['id'] not in zugeordnet and not kein_ziel(quelle, a)),
                   key=lambda a: sortierschluessel(a['titel']))
    sichtbar = {z['id'] for z in ausfluege}
    weg = [z for z in (alt or {}).get('ausfluege', []) if z['id'] not in sichtbar]
    if len(weg) > GRENZE and not trotzdem:
        raise Fehler('Es würden %d Ziele auf einmal von der Website verschwinden (%s …). Zur Sicherheit wurde nichts geändert. '
                     'Falls das so gewollt ist: Action „To-Do-Abruf“ mit dem Häkchen „trotzdem“ starten.'
                     % (len(weg), ', '.join(z['titel'] for z in weg[:5])))
    neu = {'stand': (alt or {}).get('stand', heute), 'kategorien': quelle['kategorien'], 'ausfluege': ausfluege}
    if ohne_stand(neu) != ohne_stand(alt):
        neu['stand'] = heute
    return neu, offen, weg


def aktualisieren():
    probelauf = os.environ.get('PROBELAUF') == 'true'
    trotzdem = os.environ.get('TROTZDEM') == 'true'
    token = erneuern()
    print('✓ Anmeldung erneuert und gespeichert.', flush=True)
    liste = aufgaben(token, liste_finden(token))
    print('✓ %d Aufgaben gelesen.' % len(liste))
    if not liste:
        raise Fehler('Die Liste „%s“ ist leer. Zur Sicherheit wurde nichts geändert.' % LISTE)

    alt = lesen(WEBSITE)
    quelle = lesen(ZIELE)
    heute = datetime.now(ZoneInfo('Europe/Zurich')).date().isoformat()
    neu, offen, weg = zusammenbauen(quelle, liste, alt, heute, trotzdem)
    bisher = {z['id'] for z in (alt or {}).get('ausfluege', [])}
    print('✓ %d Ziele auf der Website.' % len(neu['ausfluege']))
    for z in neu['ausfluege']:
        if z['id'] not in bisher:
            print('  + kommt dazu: %s' % z['titel'])
    for z in weg:
        print('  − verschwindet (Aufgabe in To Do gelöscht): %s' % z['titel'])
    uebergangen = sum(1 for a in liste if kein_ziel(quelle, a))
    if uebergangen:
        print('✓ %d Aufgabe(n) als „kein Ausflugsziel“ übergangen.' % uebergangen)
    print('✓ %d Aufgaben noch ohne Angaben (daten/offen.json):' % len(offen))
    for a in offen:
        print('  · %s' % a['titel'])

    if probelauf:
        print('Probelauf: nichts gespeichert.', flush=True)
        return
    if neu != alt:
        schreiben(WEBSITE, neu)
        print('✓ ausfluege.json neu geschrieben (Stand %s).' % neu['stand'])
    if offen != lesen(OFFEN):
        schreiben(OFFEN, offen)
        print('✓ daten/offen.json neu geschrieben.', flush=True)


def main():
    befehle = {'anmelden': anmelden, 'aktualisieren': aktualisieren}
    if len(sys.argv) != 2 or sys.argv[1] not in befehle:
        print('Aufruf: python3 -u werkzeuge/todo.py %s' % '|'.join(befehle))
        return 2
    try:
        befehle[sys.argv[1]]()
    except Fehler as e:
        print('::error::%s' % e, flush=True)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
