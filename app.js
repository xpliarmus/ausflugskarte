/* Ausflugsideen – Karte und Liste
 * Daten: ausfluege.json (Schritt 3: wird automatisch aus Microsoft To Do erzeugt)
 * Haken: nur im Browser des jeweiligen Geräts (localStorage),
 *        übertragbar per Mein-Stand-Link (#stand=1.<Kurzcodes>, erreicht nie einen Server)
 */
(function () {
  'use strict';

  var DATA_URL = 'ausfluege.json';
  var STORE_DONE = 'ausflugsideen.erledigt.v1';
  var STORE_LAYER = 'ausflugsideen.karte';
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

  var items = [], byId = {}, cats = {}, catOrder = [];
  var cards = {}, markers = {}, hay = {}, codeMap = Object.create(null);
  var done = new Set(), activeCats = new Set(), query = '', hideDone = false;
  var map, markerLayer, mainBounds, hlHalo, hlRing, hlId = null;

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
  function store(key, val) { try { localStorage.setItem(key, val); } catch (e) { /* privates Fenster o. ä. */ } }
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
        '<div class="card-meta"><span class="cat-dot" style="background:' + esc(c.farbe) + '"></span>' +
        esc(c.label) + ' · ' + esc(place(a)) + '</div>' +
        '<p class="card-desc">' + esc(a.beschreibung) + '</p>' +
        (a.hinweis ? '<p class="card-note">' + esc(a.hinweis) + '</p>' : '') +
        '<div class="card-links">' + linksHtml(a, true) + '</div>';
      cards[a.id] = el;
      frag.appendChild(el);
    });
    listEl.appendChild(frag);
  }

  function buildChips() {
    var counts = {};
    items.forEach(function (a) { counts[a.kat] = (counts[a.kat] || 0) + 1; });
    chipRow.innerHTML = catOrder.filter(function (k) { return counts[k]; }).map(function (k) {
      return '<button type="button" class="filter-chip" data-cat="' + esc(k) + '" style="--chip-color:' + esc(cats[k].farbe) + '">' +
        '<span class="chip-dot"></span>' + esc(cats[k].label) + ' <span class="chip-n">' + counts[k] + '</span></button>';
    }).join('');
  }

  function updateChips() {
    var any = activeCats.size > 0;
    chipRow.querySelectorAll('.filter-chip').forEach(function (chip) {
      var on = activeCats.has(chip.dataset.cat);
      chip.classList.toggle('active', on);
      chip.classList.toggle('dimmed', any && !on);
      chip.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function applyFilters() {
    var q = norm(query.trim()), shown = 0;
    items.forEach(function (a) {
      var vis = (activeCats.size === 0 || activeCats.has(a.kat)) &&
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
    listMsg.hidden = shown > 0;
    listMsg.textContent = 'Keine Einträge passen zu Suche und Filter.';
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
      '<p class="pop-meta">' + esc(c.label) + ' · ' + esc(place(a)) + '</p>' +
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
      m.on('click', function () { if (mqDesktop.matches) flashCard(a.id); });
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

  // ---------- Bedienung ----------
  function wireUi() {
    chipRow.addEventListener('click', function (e) {
      var chip = e.target.closest('.filter-chip');
      if (!chip) return;
      var k = chip.dataset.cat;
      if (activeCats.has(k)) activeCats.delete(k); else activeCats.add(k);
      updateChips();
      applyFilters();
    });
    $('resetFilters').addEventListener('click', function () {
      activeCats.clear(); query = ''; hideDone = false;
      searchInput.value = ''; hideDoneToggle.checked = false;
      updateChips(); applyFilters();
    });
    searchInput.addEventListener('input', function () { query = searchInput.value; applyFilters(); });
    hideDoneToggle.addEventListener('change', function () { hideDone = hideDoneToggle.checked; applyFilters(); });

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
