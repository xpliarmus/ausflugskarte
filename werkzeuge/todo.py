#!/usr/bin/env python3
"""Microsoft To Do für die Ausflugskarte. Läuft in GitHub Actions, nur Python-Standardbibliothek.

  python3 -u werkzeuge/todo.py anmelden
      Einmalige Anmeldung per Code (microsoft.com/link). Speichert die Anmeldung
      (Refresh-Token) als Secret MS_REFRESH_TOKEN und prüft, ob die Liste da ist.

Umgebung: MS_CLIENT_ID (Anwendungs-ID der App bei Microsoft),
          GH_TOKEN (GitHub-Schlüssel, der Secrets dieses Repos schreiben darf),
          GITHUB_REPOSITORY (setzt GitHub selbst).

Das Protokoll der Actions ist öffentlich: Tokens werden nie ausgegeben, sondern
sofort maskiert. Aus To Do wird nur gelesen (Berechtigung Tasks.Read).
"""
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

LOGIN = 'https://login.microsoftonline.com/consumers/oauth2/v2.0'
GRAPH = 'https://graph.microsoft.com/v1.0'
SCOPE = 'https://graph.microsoft.com/Tasks.Read offline_access'
LISTE = 'Ausflugsideen'
SECRET = 'MS_REFRESH_TOKEN'


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


def anmelden():
    client = os.environ.get('MS_CLIENT_ID', '').strip()
    if not client:
        raise Fehler('Das Secret MS_CLIENT_ID fehlt.')
    if not os.environ.get('GH_TOKEN'):
        raise Fehler('Das Secret GH_SECRETS_TOKEN fehlt.')

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
    print('::notice title=Code für %s::%s' % (uri, code), flush=True)

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

        maskieren(t.get('access_token'))
        maskieren(t.get('refresh_token'))
        if not t.get('refresh_token'):
            raise Fehler('Microsoft hat keine dauerhafte Anmeldung geliefert (offline_access fehlt).')
        secret_speichern(t['refresh_token'])
        print('✓ Anmeldung gespeichert (Secret %s).' % SECRET, flush=True)
        liste = liste_finden(t['access_token'])
        print('✓ Liste „%s“ gefunden: %d Aufgaben.' % (LISTE, len(aufgaben(t['access_token'], liste))), flush=True)
        return
    raise Fehler('Der Code ist abgelaufen. Bitte die Action nochmals starten.')


def main():
    befehle = {'anmelden': anmelden}
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
