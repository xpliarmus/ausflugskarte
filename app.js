/* Ausflugsideen – Karte und Liste
 * Daten: ausfluege.json (Schritt 3: wird automatisch aus Microsoft To Do erzeugt)
 * Haken: nur im Browser des jeweiligen Geräts (localStorage),
 *        übertragbar per Mein-Stand-Link (#stand=1.<Kurzcodes>, erreicht nie einen Server)
 */
(function () {
  'use strict';

  var DATA_URL = 'ausfluege.json';
  var ORTE_URL = 'orte.json', FAHRZEITEN_URL = 'fahrzeiten.json'; // erst geladen, wenn sie gebraucht werden
  var STORE_DONE = 'ausflugsideen.erledigt.v1';
  var STORE_LAYER = 'ausflugsideen.karte';
  var STORE_START = 'ausflugsideen.start', STORE_UMKREIS = 'ausflugsideen.umkreis';
  var UMKREISE = ['30', '60', '90', '120', 'alle']; // Minuten
  var WEIT_KM = 25; // so weit weg vom nächsten Startort ist die Schätzung sehr ungenau
  var DEUTSCH = { genf: 'Genève', neuenburg: 'Neuchâtel', freiburg: 'Fribourg', sitten: 'Sion', siders: 'Sierre', delsberg: 'Delémont', pruntrut: 'Porrentruy' };
  var CLUSTER_KM = 300; // Einträge weiter weg vom Median zählen nicht zur Startansicht
  var CODE_ZEICHEN = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  var CODE_LAENGE = 4; // 62^4 ≈ 14,8 Mio. mögliche Kurzcodes

  var $ = function (id) { return document.getElementById(id); };
  var listEl = $('list'), listMsg = $('listMsg'), chipRow = $('chipRow');
  var searchInput = $('searchInput'), hideDoneToggle = $('hideDoneToggle');
  var sidebar = document.querySelector('.sidebar'), mapwrap = document.querySelector('.mapwrap');
  var mqDesktop = window.matchMedia('(min-width: 881px)');
  var mqHover = window.matchMedia('(hover: hover)');
  var mqTouch = window.matchMedia('(pointer: coarse)');
  var frageBox = $('frageFenster'), frageCb = null, meldungTimer = null;
  var filterBlatt = $('filterBlatt');

  var items = [], byId = {}, cats = {}, catOrder = [], katZahl = {};
  var cards = {}, markers = {}, hay = {}, codeMap = Object.create(null);
  var done = new Set(), activeCats = new Set(), query = '', hideDone = false;
  // Jahreszeit: startet auf der aktuellen (November–März Winter, April–Oktober Sommer), wird nicht gespeichert
  var monat = new Date().getMonth() + 1;
  var saison = monat >= 4 && monat <= 10 ? 'sommer' : 'winter', regen = false, katZeit = {};
  var map, markerLayer, mainBounds, hlHalo, hlRing, hlId = null;
  // Fahrzeit: Startpunkt und Umkreis bleiben nur im Browser gespeichert, nichts wird verschickt
  var startpunkt = null, umkreis = 'alle', fz = null, fzLaden = null, fzFehler = false, fahrzeit = {}, weit = false;
  var ortListe = null, orteLaden = null, startMarker = null, waehlen = false, vorschlaege = [], vsAktiv = -1;

  // ---------- Hilfsfunktionen ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function norm(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }
  function host(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return 'Website'; }
  }
  function place(a) {
    return a.ort + ', ' + a.region + (a.land !== 'Schweiz' ? ' (' + a.land + ')' : '');
  }
  // Hinweis hinter Kategorie und Ort; ganzjährige Ziele ohne Regentag bekommen keinen
  function zeitHinweis(a) {
    return (a.saison === 'sommer' ? ' · ☀️ nur Sommer' : a.saison === 'winter' ? ' · ❄️ nur Winter' : '') +
      (a.regentag ? ' · ☔ auch bei Regen' : '');
  }
  function passtZeit(a) {
    return (saison === 'alle' || a.saison === 'ganzjaehrig' || a.saison === saison) && (!regen || a.regentag);
  }
  // Umkreis nach Fahrzeit; solange die Fahrzeiten laden, passt alles
  function passtUmkreis(a) {
    return !startpunkt || !fz || umkreis === 'alle' || (fahrzeit[a.id] != null && fahrzeit[a.id] <= +umkreis);
  }
  function passtRahmen(a) { return passtZeit(a) && passtUmkreis(a); }
  function dauer(m) {
    if (m < 60) return 'ca. ' + m + ' Min.';
    return 'ca. ' + Math.floor(m / 60) + ' h' + (m % 60 ? ' ' + (m % 60) + ' Min.' : '');
  }
  function fahrzeitText(a) { return fahrzeit[a.id] != null ? ' · 🚗 ' + dauer(fahrzeit[a.id]) : ''; }
  function gmaps(a) {
    return 'https://www.google.com/maps/search/?api=1&query=' + a.lat.toFixed(5) + ',' + a.lon.toFixed(5);
  }
  function km(lat1, lon1, lat2, lon2) {
    var r = Math.PI / 180, dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r;
    var h = Math.pow(Math.sin(dLat / 2), 2) + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.pow(Math.sin(dLon / 2), 2);
    return 12742 * Math.asin(Math.sqrt(h));
  }
  function median(arr) {
    var s = arr.slice().sort(function (x, y) { return x - y; });
    return s[Math.floor(s.length / 2)];
  }
  function store(key, val) {
    try { if (val == null) localStorage.removeItem(key); else localStorage.setItem(key, val); } catch (e) { /* privates Fenster o. ä. */ }
  }
  function load(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }

  // ---------- Haken ----------
  function loadDone() {
    try {
      var arr = JSON.parse(load(STORE_DONE) || '[]');
      if (Array.isArray(arr)) arr.forEach(function (k) { done.add(String(k)); });
    } catch (e) { /* kaputter Eintrag: ignorieren */ }
  }
  function saveDone() { store(STORE_DONE, JSON.stringify(Array.from(done))); }

  function setDone(id, on) {
    if (!byId[id]) return;
    if (on) done.add(id); else done.delete(id);
    saveDone();
    paintDone(id);
    var pop = document.querySelector('.pop-done[data-id="' + id + '"]');
    if (pop) pop.checked = on;
    updateStats();
    if (hideDone) applyFilters();
  }

  function paintDone(id) {
    var on = done.has(id), card = cards[id], m = markers[id];
    card.classList.toggle('is-done', on);
    card.querySelector('.done-check').checked = on;
    m.setStyle({ fillOpacity: on ? 0.3 : 1, opacity: on ? 0.45 : 1 });
    if (map && markerLayer.hasLayer(m)) { if (on) m.bringToBack(); else m.bringToFront(); }
  }

  function updateStats() {
    var n = 0;
    items.forEach(function (a) { if (done.has(a.id)) n++; });
    $('doneCount').textContent = n;
    $('totalCount').textContent = items.length;
    $('progressFill').style.width = (items.length ? Math.round(n / items.length * 100) : 0) + '%';
  }

  // ---------- Mein-Stand-Link ----------
  // Kurzcode pro id: FNV-1a (32 Bit), auf 4 Zeichen aus 0-9A-Za-z reduziert
  function kurzcode(id) {
    var h = 0x811c9dc5, i, s = '';
    for (i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193) >>> 0;
    for (i = 0; i < CODE_LAENGE; i++) { s = CODE_ZEICHEN.charAt(h % 62) + s; h = Math.floor(h / 62); }
    return s;
  }
  function buildCodeMap() {
    items.forEach(function (a) {
      var c = kurzcode(a.id);
      if (c in codeMap) {
        if (window.console) console.warn('Kurzcode doppelt, wird nicht übernommen:', c, codeMap[c], a.id);
        codeMap[c] = null; // mehrdeutig: lieber nichts übernehmen als den falschen Haken
      } else codeMap[c] = a.id;
    });
  }
  function ziele(n) { return n + (n === 1 ? ' erledigtes Ziel' : ' erledigte Ziele'); }

  function meldung(text) {
    var el = $('meldung');
    el.textContent = text;
    el.classList.add('sichtbar');
    clearTimeout(meldungTimer);
    meldungTimer = setTimeout(function () { el.classList.remove('sichtbar'); }, 4500);
  }

  // Kleines Fenster mit Frage oder Link. cb(true), wenn „ja“ gewählt wurde.
  function frage(o, cb) {
    if (!frageBox || typeof frageBox.showModal !== 'function') { // ältere Browser
      if (o.link) { window.prompt(o.text, o.link); cb(false); } else cb(window.confirm(o.titel + '\n\n' + o.text));
      return;
    }
    var feld = $('frageLink'), ja = $('frageJa');
    $('frageTitel').textContent = o.titel;
    $('frageText').textContent = o.text;
    feld.hidden = !o.link;
    feld.value = o.link || '';
    ja.hidden = !o.ja;
    ja.textContent = o.ja || '';
    $('frageNein').textContent = o.nein;
    frageCb = cb;
    frageBox.returnValue = '';
    frageBox.showModal();
    if (o.link) { feld.focus(); feld.select(); } else frageBox.focus(); // kein Knopf vorausgewählt
  }

  function cleanHash() {
    if (history.replaceState) history.replaceState(null, '', location.pathname + location.search);
    else location.hash = '';
  }

  function readLink() {
    var m = /^#stand=(\d+)\.([0-9A-Za-z]*)/.exec(location.hash);
    if (!m || (frageBox && frageBox.open)) return;
    if (m[1] !== '1') { meldung('Dieser Link ist neuer als die Seite. Bitte die Seite neu laden.'); return; }
    var ids = [], seen = new Set();
    for (var i = 0; i + CODE_LAENGE <= m[2].length; i += CODE_LAENGE) {
      var id = codeMap[m[2].substr(i, CODE_LAENGE)];
      if (id && !seen.has(id)) { seen.add(id); ids.push(id); }
    }
    var neu = ids.filter(function (id) { return !done.has(id); });
    if (!ids.length) { cleanHash(); meldung('Der Link enthält keine bekannten Ziele.'); return; }
    if (!neu.length) { cleanHash(); meldung('Alle Ziele aus dem Link sind bei dir schon abgehakt.'); return; }
    frage({
      titel: 'Erledigte Ziele übernehmen?',
      text: 'Der Link enthält ' + ziele(ids.length) +
        (neu.length < ids.length ? ', davon ' + neu.length + (neu.length === 1 ? ' neues' : ' neue') + ' für dich' : '') +
        '. Deine bisherigen Haken bleiben erhalten.',
      ja: 'Übernehmen',
      nein: 'Nicht übernehmen'
    }, function (ok) {
      cleanHash();
      if (!ok) return;
      neu.forEach(function (id) { setDone(id, true); });
      meldung(ziele(neu.length) + ' übernommen.');
    });
  }

  function copyLink(url) {
    function manual() {
      frage({ titel: 'Link kopieren', text: 'Kopiere diesen Link und öffne ihn auf dem anderen Gerät:', link: url, nein: 'Schliessen' }, function () {});
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () { meldung('Link kopiert. Öffne ihn auf dem anderen Gerät.'); }, manual);
    } else manual();
  }

  function shareStand() {
    var codes = items.filter(function (a) { return done.has(a.id); }).map(function (a) { return kurzcode(a.id); }).sort();
    if (!codes.length) { meldung('Du hast noch keine Ziele abgehakt.'); return; }
    var url = location.href.split('#')[0] + '#stand=1.' + codes.join('');
    // Handy: Teilen-Menü (WhatsApp, Mail …); Laptop: Link kopieren
    if (navigator.share && mqTouch.matches) {
      navigator.share({ title: 'Ausflugsideen', text: 'Erledigte Ausflugsziele (' + codes.length + ' von ' + items.length + ')', url: url })
        .catch(function (e) { if (!e || e.name !== 'AbortError') copyLink(url); });
    } else copyLink(url);
  }

  // ---------- Liste ----------
  function linksHtml(a, withMapLink) {
    var h = '';
    if (withMapLink) h += '<button type="button" class="show-on-map" data-id="' + esc(a.id) + '">🗺️ Auf der Karte</button>';
    h += '<a href="' + esc(gmaps(a)) + '" target="_blank" rel="noopener">📍 Google Maps</a>';
    if (a.website) h += '<a href="' + esc(a.website) + '" target="_blank" rel="noopener">🌐 ' + esc(host(a.website)) + '</a>';
    return h;
  }

  function buildCards() {
    var frag = document.createDocumentFragment();
    items.forEach(function (a) {
      var c = cats[a.kat];
      var el = document.createElement('article');
      el.className = 'card';
      el.dataset.id = a.id;
      el.style.setProperty('--kat-farbe', c.farbe); // Farbstreifen in der Liste
      el.innerHTML =
        '<label class="card-check"><input type="checkbox" class="done-check" data-id="' + esc(a.id) + '">' +
        '<span class="card-title">' + esc(a.titel) +
        (a.ungefaehr ? ' <span class="approx" title="Koordinaten ungefähr">~</span>' : '') + '</span></label>' +
        '<div class="card-meta"><span class="cat-dot" style="background:' + esc(c.farbe) + '"></span><span>' +
        esc(c.label) + ' · ' + esc(place(a)) + esc(zeitHinweis(a)) + '<span class="fahrzeit"></span></span></div>' +
        '<p class="card-desc">' + esc(a.beschreibung) + '</p>' +
        (a.hinweis ? '<p class="card-note">' + esc(a.hinweis) + '</p>' : '') +
        '<div class="card-links">' + linksHtml(a, true) + '</div>';
      cards[a.id] = el;
      frag.appendChild(el);
    });
    listEl.appendChild(frag);
  }

  // Kategorien mit Einträgen, alphabetisch; «Sonstiges» zuletzt
  function katReihenfolge() {
    return catOrder.filter(function (k) { return katZahl[k]; }).sort(function (a, b) {
      if (a === 'sonst') return 1;
      if (b === 'sonst') return -1;
      return cats[a].label.localeCompare(cats[b].label, 'de');
    });
  }
  function kurzname(label) { return String(label).split(/[\/(]/)[0].trim(); } // «Wanderung/Themenweg» → «Wanderung»

  function buildChips() {
    items.forEach(function (a) { katZahl[a.kat] = (katZahl[a.kat] || 0) + 1; });
    chipRow.innerHTML = katReihenfolge().map(function (k) {
      return '<button type="button" class="filter-chip" data-cat="' + esc(k) + '" style="--chip-color:' + esc(cats[k].farbe) + '">' +
        '<span class="chip-dot"></span>' + esc(cats[k].label) + ' <span class="chip-n">' + katZahl[k] + '</span></button>';
    }).join('');
  }

  function toggleKat(k) {
    if (activeCats.has(k)) activeCats.delete(k); else activeCats.add(k);
    updateChips();
    applyFilters();
  }

  function updateChips() {
    var any = activeCats.size > 0;
    chipRow.querySelectorAll('.filter-chip').forEach(function (chip) {
      var on = activeCats.has(chip.dataset.cat);
      chip.classList.toggle('active', on);
      chip.classList.toggle('dimmed', any && !on);
      chip.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    // Handy: Knopf «Filter» zeigt die Auswahl, das offene Fenster wird nachgeführt
    var namen = katReihenfolge().filter(function (k) { return activeCats.has(k); }).map(function (k) { return kurzname(cats[k].label); });
    $('filterWert').textContent = namen.length === 0 ? 'Alle Kategorien' : namen.length <= 2 ? namen.join(', ') : namen.length + ' Kategorien';
    $('filterKnopf').classList.toggle('hat-wahl', namen.length > 0);
    if (filterBlatt && filterBlatt.open) filterListe();
  }

  // ---------- Filter auf dem Handy: Fenster von unten ----------
  function filterListe() {
    $('filterListe').innerHTML = katReihenfolge().map(function (k) {
      var c = cats[k], on = activeCats.has(k);
      return '<button type="button" class="fb-zeile' + (on ? ' an' : '') + (katZeit[k] ? '' : ' leer') + '" data-cat="' + esc(k) + '" aria-pressed="' + on + '" style="--chip-color:' + esc(c.farbe) + '">' +
        '<span class="fb-sym" aria-hidden="true">' + esc(c.symbol || '') + '</span><span class="fb-name">' + esc(c.label) + '</span>' +
        '<span class="fb-n">' + (katZeit[k] || 0) + '</span><span class="fb-haken" aria-hidden="true"></span></button>';
    }).join('');
  }

  function applyFilters() {
    var q = norm(query.trim()), shown = 0;
    items.forEach(function (a) {
      var vis = passtRahmen(a) && (activeCats.size === 0 || activeCats.has(a.kat)) &&
        (!q || hay[a.id].indexOf(q) !== -1) &&
        !(hideDone && done.has(a.id));
      cards[a.id].hidden = !vis;
      var m = markers[a.id];
      if (vis && !markerLayer.hasLayer(m)) markerLayer.addLayer(m);
      if (!vis && markerLayer.hasLayer(m)) markerLayer.removeLayer(m);
      if (vis) shown++;
    });
    items.forEach(function (a) { if (done.has(a.id) && markerLayer.hasLayer(markers[a.id])) markers[a.id].bringToBack(); });
    if (hlId && !markerLayer.hasLayer(markers[hlId])) setHighlight(null);
    // Anzahlen bei den Kategorien richten sich nach Jahreszeit, Regentag und Umkreis
    katZeit = {};
    items.forEach(function (a) { if (passtRahmen(a)) katZeit[a.kat] = (katZeit[a.kat] || 0) + 1; });
    chipRow.querySelectorAll('.filter-chip').forEach(function (chip) {
      var n = katZeit[chip.dataset.cat] || 0;
      chip.querySelector('.chip-n').textContent = n;
      chip.classList.toggle('leer', !n);
    });
    if (filterBlatt && filterBlatt.open) filterListe();
    $('treffer').textContent = shown === 1 ? '1 Ziel' : shown + ' Ziele';
    listMsg.hidden = shown > 0;
    listMsg.textContent = 'Keine Einträge passen zu Suche und Filter.' +
      (startpunkt && fz && umkreis !== 'alle' ? ' Tipp: Wähle einen grösseren Umkreis.' : '') +
      (saison !== 'alle' ? ' Tipp: «Alle» zeigt alle Jahreszeiten.' : '');
  }

  function flashCard(id) {
    var card = cards[id];
    if (!card || card.hidden) return;
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.remove('flash');
    void card.offsetWidth; // Animation neu starten
    card.classList.add('flash');
  }

  // ---------- Karte ----------
  function popupHtml(a) {
    var c = cats[a.kat];
    return '<div class="pop">' +
      '<p class="pop-title">' + esc(a.titel) + (a.ungefaehr ? ' <span class="approx" title="Koordinaten ungefähr">~</span>' : '') + '</p>' +
      '<p class="pop-meta">' + esc(c.label) + ' · ' + esc(place(a)) + esc(zeitHinweis(a)) +
      (fahrzeit[a.id] != null ? '<span class="fahrzeit">' + esc(fahrzeitText(a)) + '</span>' : '') + '</p>' +
      '<p class="pop-desc">' + esc(a.beschreibung) + '</p>' +
      '<label class="pop-check"><input type="checkbox" class="pop-done" data-id="' + esc(a.id) + '"' + (done.has(a.id) ? ' checked' : '') + '> erledigt</label>' +
      '<div class="pop-links">' + linksHtml(a, false) + '</div></div>';
  }

  function setHighlight(id) {
    hlId = id && markers[id] && markerLayer.hasLayer(markers[id]) ? id : null;
    if (!hlId) { hlHalo.remove(); hlRing.remove(); return; }
    var ll = markers[hlId].getLatLng();
    hlHalo.setLatLng(ll).addTo(map);
    hlRing.setLatLng(ll).addTo(map);
    hlHalo.bringToBack();
    markers[hlId].bringToFront();
  }

  function fitMain(animate) {
    map.fitBounds(mainBounds, { padding: [28, 28], maxZoom: 11, animate: animate !== false });
  }

  function showOnMap(id) {
    var a = byId[id], m = markers[id];
    if (!a || !m) return;
    if (!mqDesktop.matches) {
      window.scrollTo({ top: mapwrap.getBoundingClientRect().top + window.scrollY - 8, behavior: 'smooth' });
    }
    var opened = false;
    var open = function () { if (!opened) { opened = true; m.openPopup(); } };
    map.once('moveend', open);
    map.flyTo([a.lat, a.lon], Math.max(map.getZoom(), 12), { duration: 0.9 });
    setTimeout(open, 1300);
  }

  function initMap() {
    map = L.map('map', { zoomControl: true, zoomSnap: 0.25, minZoom: 4, maxZoom: 19 });
    map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');

    var layers = {
      osm: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>-Mitwirkende'
      }),
      swisstopo: L.tileLayer('https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/{z}/{x}/{y}.jpeg', {
        maxNativeZoom: 18, maxZoom: 19,
        attribution: '© <a href="https://www.swisstopo.admin.ch/" target="_blank" rel="noopener">swisstopo</a>'
      })
    };
    var current = layers[load(STORE_LAYER)] ? load(STORE_LAYER) : 'osm';
    layers[current].addTo(map);

    var LayerSwitch = L.Control.extend({
      options: { position: 'topright' },
      onAdd: function () {
        var box = L.DomUtil.create('div', 'leaflet-bar layer-switch');
        [['osm', 'Karte'], ['swisstopo', 'Landeskarte CH']].forEach(function (p) {
          var b = L.DomUtil.create('button', '', box);
          b.type = 'button';
          b.textContent = p[1];
          b.dataset.layer = p[0];
          b.setAttribute('aria-pressed', p[0] === current ? 'true' : 'false');
          b.title = p[0] === 'osm' ? 'OpenStreetMap (ganze Region)' : 'Landeskarte von swisstopo (nur Schweiz)';
        });
        L.DomEvent.disableClickPropagation(box);
        L.DomEvent.on(box, 'click', function (e) {
          var k = e.target.dataset && e.target.dataset.layer;
          if (!k || k === current) return;
          map.removeLayer(layers[current]);
          current = k;
          layers[current].addTo(map);
          store(STORE_LAYER, current);
          box.querySelectorAll('button').forEach(function (b) {
            b.setAttribute('aria-pressed', b.dataset.layer === current ? 'true' : 'false');
          });
        });
        return box;
      }
    });
    new LayerSwitch().addTo(map);

    var ResetView = L.Control.extend({
      options: { position: 'topleft' },
      onAdd: function () {
        var box = L.DomUtil.create('div', 'leaflet-bar');
        var b = L.DomUtil.create('button', 'reset-view', box);
        b.type = 'button';
        b.textContent = '⟲';
        b.title = 'Ansicht zurücksetzen';
        b.setAttribute('aria-label', 'Ansicht zurücksetzen');
        L.DomEvent.disableClickPropagation(box);
        L.DomEvent.on(b, 'click', function () { fitMain(true); });
        return box;
      }
    });
    new ResetView().addTo(map);

    markerLayer = L.layerGroup().addTo(map);
    hlHalo = L.circleMarker([0, 0], { radius: 19, stroke: false, fillOpacity: 1, interactive: false, className: 'hl-halo' });
    hlRing = L.circleMarker([0, 0], { radius: 12.5, weight: 2.8, fillOpacity: 1, interactive: false, className: 'hl-ring' });

    items.forEach(function (a) {
      var m = L.circleMarker([a.lat, a.lon], {
        radius: 7, weight: 1.6, fillColor: cats[a.kat].farbe, fillOpacity: 1, className: 'pin'
      });
      m.bindTooltip(a.titel, { direction: 'top', offset: [0, -7] });
      m.bindPopup(function () { return popupHtml(a); }, { maxWidth: 290, autoPanPaddingTopLeft: [12, 60], autoPanPaddingBottomRight: [12, 30] });
      m.on('mouseover', function () { m.setRadius(9.5); });
      m.on('mouseout', function () { m.setRadius(7); });
      m.on('click', function (e) {
        if (waehlen) startVonKarte(e.latlng); // Startpunkt wählen: der Pin zählt wie die Karte
        else if (mqDesktop.matches) flashCard(a.id);
      });
      markers[a.id] = m;
    });

    // Startansicht: Hauptgebiet ohne einzelne weit entfernte Ziele
    var mLat = median(items.map(function (a) { return a.lat; }));
    var mLon = median(items.map(function (a) { return a.lon; }));
    var core = items.filter(function (a) { return km(mLat, mLon, a.lat, a.lon) <= CLUSTER_KM; });
    mainBounds = L.latLngBounds((core.length ? core : items).map(function (a) { return [a.lat, a.lon]; }));
    fitMain(false);

    // Haken im Popup
    $('map').addEventListener('change', function (e) {
      var t = e.target;
      if (t.classList && t.classList.contains('pop-done')) setDone(t.dataset.id, t.checked);
    });
  }

  // ---------- Fahrzeit ab dem eigenen Startpunkt ----------
  // Vorberechnet sind die Fahrzeiten von festen Startorten (fahrzeiten.json). Für den eigenen Startpunkt
  // nimmt die Seite die drei nächsten Startorte: je Fahrzeit Startort → Ziel, korrigiert um den Unterschied
  // der Luftlinie zum Ziel (1 Min. pro km), gewichtet mit 1/Abstand² zum Startort. Ganz nahe Ziele auch direkt
  // aus der Luftlinie. Gerundet auf 5 Minuten.
  function schaetzen() {
    fahrzeit = {};
    weit = false;
    if (!startpunkt || !fz) return;
    var S = fz.startorte;
    var naechste = S.map(function (s, i) { return { i: i, d: km(startpunkt.lat, startpunkt.lon, s[1], s[2]) }; })
      .sort(function (x, y) { return x.d - y.d; });
    weit = !naechste.length || naechste[0].d > WEIT_KM;
    items.forEach(function (a) {
      var z = fz.ziele[a.id];
      if (!z || !z.min || km(z.lat, z.lon, a.lat, a.lon) > 1) return; // noch nicht (neu) berechnet
      var dz = km(startpunkt.lat, startpunkt.lon, a.lat, a.lon), summe = 0, gewicht = 0, n = 0;
      for (var j = 0; j < naechste.length && n < 3; j++) {
        var s = S[naechste[j].i], t = z.min[naechste[j].i];
        if (typeof t !== 'number') continue; // keine Route von diesem Startort
        var w = 1 / Math.pow(Math.max(naechste[j].d, 0.5), 2);
        summe += w * (t + dz - km(s[1], s[2], a.lat, a.lon));
        gewicht += w;
        n++;
      }
      if (!n) return;
      var m = summe / gewicht;
      if (dz <= 8) m = Math.min(m, 2 + 1.8 * dz);
      m = Math.max(m, 0.6 * dz);
      fahrzeit[a.id] = Math.max(5, Math.round(m / 5) * 5);
    });
  }

  function ladeFahrzeiten() {
    if (!fzLaden) {
      fzFehler = false;
      fzLaden = fetch(FAHRZEITEN_URL, { cache: 'no-cache' })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function (d) {
          if (!d || !Array.isArray(d.startorte) || !d.ziele) throw new Error('unbekanntes Format');
          fz = d;
        })
        .catch(function (e) {
          fzFehler = true;
          fzLaden = null; // beim nächsten Startpunkt neu versuchen
          if (window.console) console.error(e);
        });
    }
    return fzLaden;
  }

  function ladeOrte() {
    if (!orteLaden) {
      orteLaden = fetch(ORTE_URL)
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function (d) {
          var alias = {};
          Object.keys(DEUTSCH).forEach(function (k) { alias[DEUTSCH[k]] = k; });
          ortListe = (d.orte || []).map(function (o) {
            var name = String(o[0]), kt = String(o[1]);
            return {
              name: name, kt: kt, lat: +o[2], lon: +o[3], plz: String(o[4] || '').split(' '),
              key: norm(name).replace(/[^a-z0-9]+/g, ' ').trim(), alias: alias[name] || '',
              text: name + (name.slice(-kt.length - 1) === ' ' + kt ? '' : ' ' + kt) // «Buchs SG» steht schon so da
            };
          });
        })
        .catch(function (e) {
          orteLaden = null;
          if (window.console) console.error(e);
        });
    }
    return orteLaden;
  }

  // Vorschläge: Postleitzahl (auch nur die ersten Ziffern) und/oder Ortsname; grössere Orte zuerst
  function ortSuche(q) {
    var t = norm(q).replace(/[^a-z0-9]+/g, ' ').trim();
    if (!t || !ortListe) return [];
    var m = /^(\d{1,4})\s*(.*)$/.exec(t), plz = m ? m[1] : '', wort = m ? m[2] : t, treffer = [];
    ortListe.forEach(function (o) {
      var p = '', rang = 0, i;
      if (plz) {
        for (i = 0; i < o.plz.length; i++) if (o.plz[i].indexOf(plz) === 0) { p = o.plz[i]; break; }
        if (!p) return;
      }
      if (wort) {
        if (o.key.indexOf(wort) === 0) rang = o.key === wort ? 0 : 1;
        else if (o.alias && o.alias.indexOf(wort) === 0) rang = 1;
        else if ((' ' + o.key).indexOf(' ' + wort) !== -1) rang = 2;
        else return;
      }
      treffer.push({ o: o, plz: p || o.plz[0], rang: rang, mitPlz: !!plz });
    });
    treffer.sort(function (x, y) {
      return x.rang - y.rang || (plz ? (x.plz < y.plz ? -1 : x.plz > y.plz ? 1 : 0) : y.o.plz.length - x.o.plz.length) ||
        x.o.key.length - y.o.key.length || x.o.key.localeCompare(y.o.key);
    });
    return treffer.slice(0, 7);
  }

  function naechsterOrt(lat, lon) {
    var best = null, bd = Infinity;
    (ortListe || []).forEach(function (o) {
      var d = km(lat, lon, o.lat, o.lon);
      if (d < bd) { bd = d; best = o; }
    });
    return best;
  }

  function sortieren() {
    var reihe = items.slice();
    if (startpunkt && fz) {
      reihe.sort(function (x, y) { // ohne Fahrzeit zuletzt, sonst bleibt die Reihenfolge nach Titel
        var a = fahrzeit[x.id], b = fahrzeit[y.id];
        return (a == null ? 1e9 : a) - (b == null ? 1e9 : b);
      });
    }
    var frag = document.createDocumentFragment();
    reihe.forEach(function (a) { frag.appendChild(cards[a.id]); });
    listEl.appendChild(frag);
  }

  function malStart() {
    var feld = $('startFeld'), box = $('umkreisBox'), info = $('umkreisInfo');
    if (document.activeElement !== feld) feld.value = startpunkt ? startpunkt.name : '';
    $('startWeg').hidden = !startpunkt;
    box.hidden = !startpunkt;
    $('umkreisWahl').querySelectorAll('button').forEach(function (b) {
      var on = b.dataset.umkreis === umkreis;
      b.classList.toggle('an', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    if (startpunkt && fz) {
      info.innerHTML = '🚗 Geschätzt, Auto ohne Stau' +
        (weit ? ' · <strong>Startpunkt weit weg: Zeiten sehr ungenau</strong>' : '') +
        ' · Daten © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
    } else info.textContent = fzFehler ? 'Die Fahrzeiten konnten nicht geladen werden. Bitte Seite neu laden.' : 'Fahrzeiten werden geladen …';
    // Startpunkt auf der Karte
    if (startpunkt) {
      if (!startMarker) {
        startMarker = L.marker([startpunkt.lat, startpunkt.lon], {
          keyboard: false, zIndexOffset: 1000,
          icon: L.divIcon({
            className: 'start-pin', iconSize: [28, 34], iconAnchor: [14, 33], tooltipAnchor: [0, -30],
            html: '<svg viewBox="0 0 32 38" aria-hidden="true"><path d="M16 1.5C9.4 1.5 4.5 6.5 4.5 12.9 4.5 21.3 16 36 16 36s11.5-14.7 11.5-23.1C27.5 6.5 22.6 1.5 16 1.5z"/><circle cx="16" cy="13" r="4.6"/></svg>'
          })
        });
        startMarker.bindTooltip('', { direction: 'top' });
      }
      startMarker.setLatLng([startpunkt.lat, startpunkt.lon]).addTo(map);
      startMarker.setTooltipContent('Startpunkt: ' + esc(startpunkt.name));
    } else if (startMarker) startMarker.remove();
  }

  function zeigeUmkreis() { // Karte auf Startpunkt und passende Ziele
    if (!startpunkt || !fz || umkreis === 'alle') return;
    var pts = [[startpunkt.lat, startpunkt.lon]];
    items.forEach(function (a) { if (markerLayer.hasLayer(markers[a.id])) pts.push([a.lat, a.lon]); });
    map.fitBounds(L.latLngBounds(pts), { padding: [28, 28], maxZoom: 11 });
  }

  function neuRechnen() {
    schaetzen();
    items.forEach(function (a) { cards[a.id].querySelector('.fahrzeit').textContent = fahrzeitText(a); });
    sortieren();
    malStart();
    applyFilters();
  }

  function setStart(s) {
    if (!startpunkt) umkreis = 'alle'; // nach dem ersten Wählen: alle Ziele, nach Fahrzeit sortiert
    startpunkt = s;
    store(STORE_START, JSON.stringify(s));
    store(STORE_UMKREIS, umkreis);
    neuRechnen();
    ladeFahrzeiten().then(neuRechnen);
  }

  function startWeg() {
    startpunkt = null;
    umkreis = 'alle';
    store(STORE_START, null);
    store(STORE_UMKREIS, null);
    neuRechnen();
  }

  function waehlenAn(on) {
    waehlen = on;
    var b = $('startKarte');
    b.classList.toggle('an', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    map.getContainer().classList.toggle('waehlen', on);
    if (!on) return;
    ladeOrte();
    if (!mqDesktop.matches) window.scrollTo({ top: mapwrap.getBoundingClientRect().top + window.scrollY - 8, behavior: 'smooth' });
    meldung('Tippe auf die Karte, wo du losfährst.');
  }

  // Startpunkt per Tipp auf die Karte (auch auf einen Pin), benannt nach dem nächsten Ort
  function startVonKarte(ll) {
    waehlenAn(false);
    map.closePopup();
    var s = { lat: Math.round(ll.lat * 1e4) / 1e4, lon: Math.round(ll.lng * 1e4) / 1e4, name: 'Punkt auf der Karte' };
    setStart(s);
    ladeOrte().then(function () {
      var o = naechsterOrt(s.lat, s.lon);
      if (o && startpunkt === s) {
        s.name = 'Punkt bei ' + o.text;
        store(STORE_START, JSON.stringify(s));
        malStart();
      }
    });
  }

  function vorschlagListe() {
    var ul = $('startVorschlaege'), feld = $('startFeld');
    ul.innerHTML = vorschlaege.map(function (v, i) {
      return '<li role="option" id="vs-' + i + '" data-i="' + i + '" aria-selected="' + (i === vsAktiv) + '"' + (i === vsAktiv ? ' class="an"' : '') + '>' +
        '<span class="vs-plz">' + esc(v.plz) + '</span> ' + esc(v.o.text) + '</li>';
    }).join('');
    ul.hidden = !vorschlaege.length;
    feld.setAttribute('aria-expanded', vorschlaege.length ? 'true' : 'false');
    if (vsAktiv >= 0) feld.setAttribute('aria-activedescendant', 'vs-' + vsAktiv); else feld.removeAttribute('aria-activedescendant');
  }
  function vorschlagZu() { vorschlaege = []; vsAktiv = -1; vorschlagListe(); }
  function vorschlagNehmen(v) {
    vorschlagZu();
    setStart({ lat: v.o.lat, lon: v.o.lon, name: (v.mitPlz ? v.plz + ' ' : '') + v.o.text }); // PLZ nur, wenn danach gesucht
    $('startFeld').value = startpunkt.name;
  }

  function wireStart() {
    var feld = $('startFeld'), ul = $('startVorschlaege');
    function suchen() {
      var q = feld.value;
      if (!ortListe) { // erst laden; klappt es nicht, bleibt die Liste leer
        ladeOrte().then(function () { if (ortListe && feld.value === q && document.activeElement === feld) suchen(); });
        return;
      }
      vorschlaege = ortSuche(q);
      vsAktiv = vorschlaege.length ? 0 : -1;
      vorschlagListe();
    }
    feld.addEventListener('focus', function () { ladeOrte(); feld.select(); });
    feld.addEventListener('input', suchen);
    feld.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!vorschlaege.length) return;
        e.preventDefault();
        vsAktiv = (vsAktiv + (e.key === 'ArrowDown' ? 1 : vorschlaege.length - 1)) % vorschlaege.length;
        vorschlagListe();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (vorschlaege.length) { vorschlagNehmen(vorschlaege[Math.max(vsAktiv, 0)]); feld.blur(); }
      } else if (e.key === 'Escape') {
        if (vorschlaege.length) { e.preventDefault(); vorschlagZu(); }
        feld.value = startpunkt ? startpunkt.name : '';
      }
    });
    feld.addEventListener('blur', function () {
      setTimeout(function () { // ein Tipp auf einen Vorschlag kommt vor dem Schliessen an
        if (document.activeElement === feld) return;
        vorschlagZu();
        feld.value = startpunkt ? startpunkt.name : '';
      }, 200);
    });
    ul.addEventListener('mousedown', function (e) { e.preventDefault(); }); // Fokus bleibt im Feld
    ul.addEventListener('click', function (e) {
      var li = e.target.closest('li');
      if (li && vorschlaege[+li.dataset.i]) { vorschlagNehmen(vorschlaege[+li.dataset.i]); feld.blur(); }
    });
    $('startWeg').addEventListener('click', function () { waehlenAn(false); startWeg(); });
    $('startKarte').addEventListener('click', function () { waehlenAn(!waehlen); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && waehlen) waehlenAn(false); });
    map.on('click', function (e) { if (waehlen) startVonKarte(e.latlng); });
    $('umkreisWahl').addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      umkreis = b.dataset.umkreis;
      store(STORE_UMKREIS, umkreis);
      malStart();
      applyFilters();
      zeigeUmkreis();
    });

    // gespeicherter Startpunkt aus einem früheren Besuch
    try {
      var s = JSON.parse(load(STORE_START) || 'null');
      if (s && typeof s.lat === 'number' && typeof s.lon === 'number' && Math.abs(s.lat - 46.8) < 6 && Math.abs(s.lon - 8.2) < 8) {
        startpunkt = { lat: s.lat, lon: s.lon, name: String(s.name || 'Startpunkt').slice(0, 80) };
        var u = load(STORE_UMKREIS);
        umkreis = UMKREISE.indexOf(u) !== -1 ? u : 'alle';
        ladeFahrzeiten().then(function () { neuRechnen(); zeigeUmkreis(); });
      }
    } catch (e) { /* kaputter Eintrag: ignorieren */ }
    malStart();
  }

  // ---------- Bedienung ----------
  function wireUi() {
    chipRow.addEventListener('click', function (e) {
      var chip = e.target.closest('.filter-chip');
      if (chip) toggleKat(chip.dataset.cat);
    });

    // Handy: Kategorien in einem Fenster von unten (ohne <dialog> bleiben die Chips)
    if (filterBlatt && typeof filterBlatt.showModal === 'function') {
      document.querySelector('.filterbar').classList.add('mit-filterblatt');
      $('filterKnopf').addEventListener('click', function () {
        filterListe();
        filterBlatt.showModal();
        filterBlatt.focus(); // keine Zeile vorausgewählt
      });
      $('filterListe').addEventListener('click', function (e) {
        var z = e.target.closest('.fb-zeile');
        if (z) toggleKat(z.dataset.cat);
      });
      $('filterZurueck').addEventListener('click', function () { activeCats.clear(); updateChips(); applyFilters(); });
      $('filterFertig').addEventListener('click', function () { filterBlatt.close(); });
      filterBlatt.addEventListener('click', function (e) { if (e.target === filterBlatt) filterBlatt.close(); }); // Tipp daneben
    }
    // Jahreszeit und Regentag
    var saisonWahl = $('saisonWahl'), regenKnopf = $('regenKnopf');
    function malSchalter() {
      saisonWahl.querySelectorAll('button').forEach(function (b) {
        var on = b.dataset.saison === saison;
        b.classList.toggle('an', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      regenKnopf.classList.toggle('an', regen);
      regenKnopf.setAttribute('aria-pressed', regen ? 'true' : 'false');
      hideDoneToggle.parentNode.classList.toggle('an', hideDone);
    }
    saisonWahl.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      saison = b.dataset.saison;
      malSchalter(); applyFilters();
    });
    regenKnopf.addEventListener('click', function () { regen = !regen; malSchalter(); applyFilters(); });
    malSchalter();

    $('resetFilters').addEventListener('click', function () { // die Jahreszeit bleibt
      activeCats.clear(); query = ''; hideDone = false; regen = false;
      searchInput.value = ''; hideDoneToggle.checked = false;
      malSchalter(); updateChips(); applyFilters();
    });
    searchInput.addEventListener('input', function () { query = searchInput.value; applyFilters(); });
    hideDoneToggle.addEventListener('change', function () { hideDone = hideDoneToggle.checked; malSchalter(); applyFilters(); });

    listEl.addEventListener('change', function (e) {
      var t = e.target;
      if (t.classList && t.classList.contains('done-check')) setDone(t.dataset.id, t.checked);
    });
    listEl.addEventListener('click', function (e) {
      var b = e.target.closest('.show-on-map');
      if (b) showOnMap(b.dataset.id);
    });

    // Hover über einen Eintrag hebt den Pin hervor (nur mit Maus)
    var inList = false, lastPt = null;
    function hlFromPoint() {
      if (!lastPt) return;
      var el = document.elementFromPoint(lastPt.x, lastPt.y);
      var card = el && el.closest ? el.closest('.card') : null;
      var id = card ? card.dataset.id : null;
      if (id !== hlId) setHighlight(id);
    }
    listEl.addEventListener('mouseover', function (e) {
      if (!mqHover.matches) return;
      inList = true; lastPt = { x: e.clientX, y: e.clientY };
      var card = e.target.closest('.card');
      var id = card ? card.dataset.id : null;
      if (id !== hlId) setHighlight(id);
    });
    listEl.addEventListener('mousemove', function (e) { lastPt = { x: e.clientX, y: e.clientY }; }, { passive: true });
    listEl.addEventListener('mouseleave', function () { inList = false; setHighlight(null); });
    // Beim Scrollen wandert ein anderer Eintrag unter den Zeiger: Markierung mitführen
    sidebar.addEventListener('scroll', function () { if (inList && mqHover.matches) hlFromPoint(); }, { passive: true });

    // Nach-oben-Knopf: Auf dem Desktop scrollt nur die Liste, mobil die ganze Seite
    var hoch = $('hochKnopf');
    function scrollPos() { return mqDesktop.matches ? sidebar.scrollTop : window.scrollY; }
    function updateHoch() { hoch.classList.toggle('sichtbar', scrollPos() > 480); }
    window.addEventListener('scroll', updateHoch, { passive: true });
    sidebar.addEventListener('scroll', updateHoch, { passive: true });
    if (mqDesktop.addEventListener) mqDesktop.addEventListener('change', updateHoch);
    else if (mqDesktop.addListener) mqDesktop.addListener(updateHoch);
    hoch.addEventListener('click', function () {
      if (mqDesktop.matches) sidebar.scrollTo({ top: 0, behavior: 'smooth' });
      else window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    updateHoch();

    // Mein-Stand-Link
    $('teilenKnopf').addEventListener('click', shareStand);
    if (frageBox) frageBox.addEventListener('close', function () {
      var cb = frageCb;
      frageCb = null;
      if (cb) cb(frageBox.returnValue === 'ja');
    });
    window.addEventListener('hashchange', readLink); // Link in schon offenem Tab eingefügt
  }

  // ---------- Start ----------
  function start(data) {
    (data.kategorien || []).forEach(function (c) { cats[c.key] = c; catOrder.push(c.key); });
    items = (data.ausfluege || []).filter(function (a) {
      return a && a.id && typeof a.lat === 'number' && typeof a.lon === 'number';
    });
    if (!cats.sonst) { cats.sonst = { key: 'sonst', label: 'Sonstiges', farbe: '#888888' }; catOrder.push('sonst'); }
    items.forEach(function (a) {
      if (!cats[a.kat]) a.kat = 'sonst';
      // fehlt die Angabe oder ist sie ungültig: ganzjährig, kein Regentag
      if (a.saison !== 'sommer' && a.saison !== 'winter') a.saison = 'ganzjaehrig';
      a.regentag = a.regentag === true;
      byId[a.id] = a;
      hay[a.id] = norm([a.titel, a.ort, a.region, a.land, a.beschreibung, a.hinweis, cats[a.kat].label].join(' '));
    });
    items.sort(function (x, y) { return x.titel.localeCompare(y.titel, 'de'); });

    loadDone();
    buildCodeMap();
    buildChips();
    buildCards();
    initMap();
    items.forEach(function (a) { paintDone(a.id); });
    wireUi();
    wireStart();
    updateChips();
    applyFilters();
    updateStats();

    if (data.stand) {
      var d = new Date(data.stand + 'T12:00:00');
      $('standInfo').textContent = items.length + ' Einträge · Stand ' +
        (isNaN(d) ? data.stand : d.toLocaleDateString('de-CH', { day: 'numeric', month: 'long', year: 'numeric' }));
    }

    readLink();
  }

  fetch(DATA_URL, { cache: 'no-cache' })
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(start)
    .catch(function (err) {
      listMsg.textContent = 'Die Einträge konnten nicht geladen werden (' + err.message + '). Bitte Seite neu laden.';
      if (window.console) console.error(err);
    });
})();
