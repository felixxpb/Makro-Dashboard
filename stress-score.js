/* ===========================================================================
   Stress-Barometer Plumbing - Rechenteil
   Gemeinsamer Rechenkern fuer Website (stress-barometer.js) und spaeter den
   PDF-Report. Alle Schwellen, Zeitraeume und Gewichte stammen von Felix,
   Herleitung und Historien-Tests: 03_Doku/Stress_Barometer_Entwurf.md.

   Aufbau je Kennzahl: Score 0-100 = 50 % Wert + 25 % Geschwindigkeit
   + 25 % Trend. Jeder Faktor wird linear zwischen "0 Punkte" und "100 Punkte"
   umgerechnet (ausserhalb abgeschnitten). Nur die Stressrichtung zaehlt.
   Barometer = gewichtete Summe aller Kennzahlen x Hebel 1,3, bei 100 gedeckelt.
   Fehlt eine Kennzahl (zu wenig Historie), werden die Gewichte der uebrigen
   auf 100 % hochgerechnet.

   Liest: window.PLUMBING_DATEN (daten/plumbing.js), window.ZINSEN_DATEN
   (daten/zinsen.js, nur FED_LEITZINS). Stellt window.STRESS bereit.
   =========================================================================== */

(function () {
  "use strict";

  var HEBEL = 1.3;
  var KETTE_SCHWELLE = 40;   /* Einzel-Score, ab dem eine Kennzahl der Stress-Kette als "zeigt Stress" gilt */

  /* Zonen rein beschreibend (CLAUDE.md Abschnitt 5), Farben in stil.css (--st-1 bis --st-5; text = lesbare Schriftfarbe auf dunklem Grund) */
  var ZONEN = [
    { id: "niedrig",  name: "niedrig",       von: 0,  bis: 20,  farbe: "var(--st-1)", text: "var(--st-1)" },
    { id: "leicht",   name: "leicht erhöht", von: 20, bis: 40,  farbe: "var(--st-2)", text: "var(--st-2)" },
    { id: "erhoeht",  name: "erhöht",        von: 40, bis: 60,  farbe: "var(--st-3)", text: "var(--st-3)" },
    { id: "hoch",     name: "hoch",          von: 60, bis: 80,  farbe: "var(--st-4)", text: "var(--st-4)" },
    { id: "sehrhoch", name: "sehr hoch",     von: 80, bis: 100, farbe: "var(--st-5)", text: "var(--st-5t)" }
  ];

  function zoneVon(wert) {
    for (var i = 0; i < ZONEN.length; i++) {
      if (wert < ZONEN[i].bis) { return ZONEN[i]; }
    }
    return ZONEN[ZONEN.length - 1];
  }

  function pt(x, a, b) {
    var p = (x - a) / (b - a) * 100;
    return p < 0 ? 0 : (p > 100 ? 100 : p);
  }

  /* --- Datenaufbereitung ------------------------------------------------- */

  function punkteVon(daten, id) {
    var r = daten && daten.reihen && daten.reihen[id];
    if (!r || !r.punkte) { return null; }
    var d = [], v = [];
    r.punkte.forEach(function (p) {
      if (p.v !== null && p.v !== undefined) { d.push(p.d); v.push(p.v); }
    });
    return d.length ? { d: d, v: v } : null;
  }

  /* gleitender Durchschnitt ueber die letzten 5 Beobachtungen ("Wochendurchschnitt") */
  function mittel5(v) {
    return v.map(function (_, i) {
      var s = 0, n = 0;
      for (var j = Math.max(0, i - 4); j <= i; j++) { s += v[j]; n++; }
      return s / n;
    });
  }

  /* letzter Index mit Datum <= datum (ISO-Texte sind direkt vergleichbar) */
  function indexBis(d, datum) {
    var lo = 0, hi = d.length - 1, res = -1;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      if (d[mid] <= datum) { res = mid; lo = mid + 1; } else { hi = mid - 1; }
    }
    return res;
  }

  var cache = null;

  function vorbereiten() {
    if (cache) { return cache; }
    var P = window.PLUMBING_DATEN, Z = window.ZINSEN_DATEN, s = {};

    s.vix  = punkteVon(P, "VIXCLS");
    s.hy   = punkteVon(P, "BAMLH0A0HYM2");
    s.ffsi = punkteVon(P, "STLFSI4");

    var rp = punkteVon(P, "RPONTSYD");
    var rr = punkteVon(P, "RRPONTSYD");
    s.repo = rp ? { d: rp.d, v: mittel5(rp.v) } : null;
    s.rrp  = rr ? { d: rr.d, v: mittel5(rr.v) } : null;

    /* SOFR-Abstand zum Leitzins und SOFR-Relation (Basispunkte je 1.000 Mrd.
       Volumen), beide auf den Tagen, an denen Satz und Volumen vorliegen */
    var so = punkteVon(P, "SOFR_RATE");
    var sv = punkteVon(P, "SOFR_VOLUME");
    var fed = punkteVon(Z, "FED_LEITZINS");
    s.sofr = null; s.rel = null;
    if (so && sv && fed) {
      var volTag = {};
      sv.d.forEach(function (x, i) { volTag[x] = sv.v[i]; });
      var d = [], ab = [], vol = [], fi = -1;
      so.d.forEach(function (x, i) {
        if (volTag[x] === undefined) { return; }
        while (fi + 1 < fed.d.length && fed.d[fi + 1] <= x) { fi++; }
        if (fi < 0) { return; }
        d.push(x);
        ab.push(so.v[i] - fed.v[fi]);
        vol.push(volTag[x] / 1000);
      });
      var ab5 = mittel5(ab), vol5 = mittel5(vol);
      s.sofr = { d: d, v: ab5 };
      s.rel = { d: d, v: ab5.map(function (a, i) { return a * 100 / vol5[i]; }) };
    }
    cache = s;
    return s;
  }

  /* --- Kennzahlen: Schwellen von Felix ----------------------------------- */
  /* tempo = Geschwindigkeit (kurze Zeitraeume), trend = lange Zeitraeume;
     Schluessel = Zeitraum in Beobachtungen (Handelstage, FFSI: Wochen),
     Wert = [0 Punkte bei, 100 Punkte bei] fuer den Anstieg */

  var KENNZAHLEN = [
    { id: "vix", name: "VIX", gruppe: "markt", gewicht: 17, serie: "vix",
      lang: "VIX (Absicherung am Aktienmarkt)", einheit: "", dez: 1,
      wert: function (v, i) { return pt(Math.floor(v[i]) - 16, 0, 14); },
      tempo: { 8: [2, 7], 14: [2, 8] },
      trend: { 20: [2, 9], 40: [3, 11], 60: [4, 12.5] } },

    { id: "hy", name: "HY-Spread", gruppe: "markt", gewicht: 16, serie: "hy",
      lang: "High-Yield-Spread (ICE BofA)", einheit: " %", dez: 2,
      wert: function (v, i) { return pt(v[i], 3, 5); },
      tempo: { 8: [0.10, 0.30], 14: [0.15, 0.40] },
      trend: { 20: [0.15, 0.50], 40: [0.20, 0.70], 60: [0.20, 0.90] } },

    { id: "ffsi", name: "FED Stress Index", gruppe: "markt", gewicht: 10, serie: "ffsi",
      lang: "FED Financial Stress Index (wöchentlich)", einheit: "", dez: 2,
      wert: function (v, i) { return pt(v[i], 0, 1); },
      tempo: { 2: [0.15, 0.45], 3: [0.15, 0.50] },
      trend: { 4: [0.20, 0.55], 8: [0.20, 0.75], 12: [0.25, 0.85] } },

    { id: "sofr", name: "SOFR", gruppe: "funding", gewicht: 20, serie: "sofr",
      lang: "SOFR-Abstand zum FED-Leitzins", einheit: " pp", dez: 2, schnitt: true,
      wert: function (v, i) { return pt(v[i], 0, 0.30); },
      tempo: { 8: [0.02, 0.06], 14: [0.02, 0.07] },
      trend: { 20: [0.02, 0.06], 40: [0.03, 0.08], 60: [0.03, 0.09] } },

    { id: "rel", name: "SOFR-Volumen", gruppe: "funding", gewicht: 5, serie: "rel",
      lang: "SOFR-Relation (Abstand je 1.000 Mrd. Volumen)", einheit: " bp", dez: 1, schnitt: true,
      wert: function (v, i) { return pt(v[i], 0, 10); },
      tempo: { 8: [1, 4], 14: [1, 4.5] },
      trend: { 20: [1, 4.5], 40: [1.5, 5.5], 60: [1.5, 5.5] } },

    { id: "repo", name: "REPO", gruppe: "funding", gewicht: 16, serie: "repo",
      lang: "REPO (Fed-Repo-Nutzung)", einheit: " Mrd.", dez: 1, schnitt: true,
      wert: function (v, i) { return pt(v[i], 0, 25); },
      tempo: { 3: [0.5, 8], 5: [0.5, 10] },
      trend: { 8: [0.5, 12], 14: [0.5, 15], 20: [0.5, 15] } },

    { id: "rrp", name: "ON RRP", gruppe: "funding", gewicht: 16, serie: "rrp",
      lang: "ON RRP (bei der FED geparktes Geld)", einheit: " Mrd.", dez: 1, schnitt: true,
      minIndex: 20,
      /* Wert = 5-Tage-Schnitt minus gleitender 20-Tage-Durchschnitt; Rueckgang = 0 */
      wert: function (v, i) {
        var s = 0;
        for (var j = i - 20; j < i; j++) { s += v[j]; }
        return pt(v[i] - s / 20, 5, 100);
      },
      tempo: { 8: [5, 100], 14: [5, 150] },
      trend: { 20: [5, 150], 40: [5, 200], 60: [5, 250] } }
  ];

  function mittelFaktor(v, i, fenster) {
    var summe = 0, anzahl = 0;
    for (var n in fenster) {
      var z = fenster[n];
      summe += pt(v[i] - v[i - Number(n)], z[0], z[1]);
      anzahl++;
    }
    return summe / anzahl;
  }

  function maxFenster(k) {
    var m = k.minIndex || 0;
    [k.tempo, k.trend].forEach(function (f) {
      for (var n in f) { if (Number(n) > m) { m = Number(n); } }
    });
    return m;
  }

  /* Score einer Kennzahl zum Stichtag; null, wenn zu wenig Historie */
  function kennzahlScore(k, serien, datum) {
    var s = serien[k.serie];
    if (!s) { return null; }
    var i = indexBis(s.d, datum);
    if (i < maxFenster(k)) { return null; }
    var wert = k.wert(s.v, i);
    var tempo = mittelFaktor(s.v, i, k.tempo);
    var trend = mittelFaktor(s.v, i, k.trend);
    return {
      score: 0.5 * wert + 0.25 * tempo + 0.25 * trend,
      wert: wert, tempo: tempo, trend: trend,
      roh: s.v[i], stand: s.d[i]
    };
  }

  /* --- Barometer zum Stichtag ------------------------------------------- */

  function berechne(datum) {
    var serien = vorbereiten();
    var liste = [], summeG = 0, summeP = 0;

    KENNZAHLEN.forEach(function (k) {
      var r = kennzahlScore(k, serien, datum);
      liste.push({ k: k, r: r });
      if (r) { summeG += k.gewicht; summeP += k.gewicht * r.score; }
    });
    if (!summeG) { return null; }

    var summe = summeP / summeG;
    var barometer = Math.min(100, summe * HEBEL);

    var bereiche = liste.map(function (e) {
      var k = e.k, r = e.r;
      return {
        id: k.id, name: k.name, lang: k.lang, gruppe: k.gruppe,
        gewicht: k.gewicht, einheit: k.einheit, dez: k.dez, schnitt: !!k.schnitt,
        verfuegbar: !!r,
        score: r ? r.score : null,
        wert: r ? r.wert : null, tempo: r ? r.tempo : null, trend: r ? r.trend : null,
        roh: r ? r.roh : null, stand: r ? r.stand : null,
        /* Beitrag in Barometer-Punkten (Hebel eingerechnet, vor der Deckelung) */
        beitrag: r ? (k.gewicht / summeG) * r.score * HEBEL : 0,
        maxBeitrag: r ? (k.gewicht / summeG) * 100 * HEBEL : 0
      };
    });

    /* Stress-Kette: VIX, HY-Spread und FFSI gemeinsam */
    var kette = [];
    bereiche.forEach(function (b) {
      if (b.id === "vix" || b.id === "hy" || b.id === "ffsi") {
        kette.push({ id: b.id, name: b.name, score: b.score,
                     stress: b.verfuegbar && b.score >= KETTE_SCHWELLE });
      }
    });

    return {
      datum: datum,
      barometer: barometer,
      summe: summe,
      zone: zoneVon(barometer),
      bereiche: bereiche,
      kette: {
        anzahl: kette.filter(function (x) { return x.stress; }).length,
        von: kette.filter(function (x) { return x.score !== null; }).length,
        liste: kette,
        schwelle: KETTE_SCHWELLE
      }
    };
  }

  /* --- Stichtage fuer die Historie --------------------------------------- */

  function isoVon(jahr, monat, tag) {
    var m = monat + 1;
    return jahr + "-" + (m < 10 ? "0" : "") + m + "-" + (tag < 10 ? "0" : "") + tag;
  }

  /* Datum vor n Kalendermonaten (Tag wird auf die Monatslaenge begrenzt) */
  function monateZurueck(iso, n) {
    var j = Number(iso.slice(0, 4)), m = Number(iso.slice(5, 7)) - 1, t = Number(iso.slice(8, 10));
    var gesamt = j * 12 + m - n;
    var nj = Math.floor(gesamt / 12), nm = gesamt - nj * 12;
    var tageImMonat = new Date(Date.UTC(nj, nm + 1, 0)).getUTCDate();
    return isoVon(nj, nm, Math.min(t, tageImMonat));
  }

  /* neuestes Datum der taeglichen Reihe (VIX); Grundlage fuer "heute" */
  function stand() {
    var s = vorbereiten();
    return s.vix ? s.vix.d[s.vix.d.length - 1] : null;
  }

  function zeitpunkte() {
    var heute = stand();
    if (!heute) { return []; }
    return [
      { id: "heute", label: "Aktuell",           datum: heute },
      { id: "m1",    label: "vor 1 Monat",       datum: monateZurueck(heute, 1) },
      { id: "m3",    label: "vor 3 Monaten",     datum: monateZurueck(heute, 3) },
      { id: "m6",    label: "vor 6 Monaten",     datum: monateZurueck(heute, 6) },
      { id: "j1",    label: "vor 1 Jahr",        datum: monateZurueck(heute, 12) }
    ];
  }

  window.STRESS = {
    HEBEL: HEBEL,
    KETTE_SCHWELLE: KETTE_SCHWELLE,
    ZONEN: ZONEN,
    KENNZAHLEN: KENNZAHLEN,
    zoneVon: zoneVon,
    berechne: berechne,
    stand: stand,
    zeitpunkte: zeitpunkte
  };
})();
