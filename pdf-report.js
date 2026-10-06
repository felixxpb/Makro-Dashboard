/* ===========================================================================
   Makro-Dashboard - PDF-Report ("MakroReport")
   Fassung vom 2026-10-04: Kombi-Version nach Felix' Vorgaben (vierte Fassung;
   davor: Neuaufbau 2026-09-27, Sicherung in 05_Dashboard/pdf-report.js.alt-2026-09-27).

   AUFBAU (Entscheidung Felix, 2026-10-04, A4 hochkant, Hintergrund hellgrau):
   1. Kopf + "FIST 5 auf einen Blick": NFP, CPI Headline, US GDP, FED Leitzins,
      VIX - je Kennzahl, 3-Jahres-Kurve und Trend-Balken des Bereichs.
   2. Heatmap-Tabellen (duenne Trennlinien) mit ALLEN Kennzahlen von
      Arbeitsmarkt, Inflation, Wachstum. Zinsen: FED Leitzins, Realrendite,
      Breakeven. Farbe = Richtung der Veraenderung, Saettigung = relative
      Staerke innerhalb der Zeile (1M/3M/6M).
   3. Uebersicht: Trend-Verteilung (Donuts), Balance fallend/steigend,
      Datenfrische.
   4. Plumbing als reine Datenliste (keine Heatmap). SPAETER: Stress-Score als
      Barometer (Vorhaben Felix, 2026-10-04) - dafuer ist hier Platz.
   5. Kapitalrotation: vier Ratio-Charts im 2x2-Raster (XLY/XLP, IYT/XLU,
      HYG/TLT, VUG/VTV). Es liegen nur die Ratios vor, nicht SPX/Einzel-ETFs.
   6. Regime: ZSK-Chart mit Regime-Baendern (D1, 3 Monate), US02Y, US10Y,
      Renditen-Tabelle mit IPDA-Regime, IPDA- und 3-Tage-Regime-Kasten,
      darunter die Core Setups des aktuellen IPDA-Regimes (aus
      window.REGIME_LOGIK.core, gleiche Liste wie auf der Regime-Seite).
   Entfallen gegenueber der Fassung vom 2026-09-27: Datenfazit-Kaesten,
   Inflation-Kategorienseite, FOMC-Dot-Plot, Leitzinsen weiterer Notenbanken.

   Funktionsweise unveraendert: Pro Bereich werden die gleichen Datendateien
   und bereiche/*-kacheln.js nachgeladen wie auf der Unterseite; alle Werte
   werden mit window.MOTOR (motor.js) berechnet, die Regime-Einstufung kommt
   aus window.REGIME_LOGIK (regime-ansicht.js). Keine zweite Rechenlogik.
   Charts werden als PDF-Vektoren gezeichnet.

   Neutral: nur Daten und Zaehlungen, keine Bewertung (CLAUDE.md Abschnitt 5).
   =========================================================================== */

(function () {
  "use strict";

  /* =========================================================================
     1. Gestaltung
     ========================================================================= */

  var C = {
    papier:     [236, 239, 242],  // Seitenhintergrund (leichtes Hellgrau)
    karte:      [246, 247, 249],
    kartenRand: [211, 216, 222],
    tinte:      [27, 35, 45],
    matt:       [91, 102, 117],
    zart:       [128, 137, 150],
    linie:      [196, 202, 209],  // duenne Trennlinien in Tabellen
    linieDunkel:[139, 148, 160],
    raster:     [213, 218, 224],
    bandNull:   [190, 196, 203],
    akzent:     [31, 78, 121],
    akzentFlaeche: [214, 222, 232],
    gut:        [30, 122, 76],
    schlecht:   [179, 38, 30],
    neutralZelle: [223, 227, 232],
    neutralBalken: [201, 206, 214],
    weiss:      [255, 255, 255]
  };

  /* Heatmap-Farben (Flaeche, Textfarbe) in drei Staerkestufen */
  var HEAT_ROT  = [[[244, 199, 195], C.tinte], [[231, 137, 127], C.tinte], [[207, 74, 62], C.weiss]];
  var HEAT_GRUEN = [[[197, 228, 209], C.tinte], [[127, 194, 155], C.tinte], [[47, 157, 99], C.weiss]];

  /* Regime-Baender und Badges (auf hellgrauem Grund gut lesbar) */
  var REGIME_FARBE = {
    "Bull Steepener": [249, 228, 189],
    "Bear Steepener": [207, 233, 214],
    "Bull Flattener": [248, 214, 196],
    "Bear Flattener": [240, 196, 196],
    "Steepenertwist": [227, 230, 234],
    "Flattenertwist": [227, 230, 234],
    "Neutral":        [236, 239, 242]
  };
  var REGIME_AKZENT = {
    "Bull Steepener": [217, 140, 43],
    "Bear Steepener": [63, 154, 92],
    "Bull Flattener": [217, 105, 59],
    "Bear Flattener": [179, 38, 30]
  };
  var REGIME_INDEX = { "Bull Steepener": 0, "Bear Steepener": 1, "Bull Flattener": 2, "Bear Flattener": 3 };

  var SEITE_B = 210, SEITE_H = 297;
  var RAND = 16;
  var INHALT = SEITE_B - RAND * 2;
  var UNTERKANTE = SEITE_H - 20;

  /* Spalten der Heatmap-Tabelle (mm, gemessen ab RAND) */
  var T = {
    nameB: 50,
    spark: RAND + 50, sparkB: 24,
    akt: RAND + 74, aktRechts: RAND + 100,
    c1: RAND + 128, cw: 50 / 3
  };
  var ZEILE_H = 5.5;

  var zustand = { bereich: "", kw: "", erzeugt: "" };

  /* =========================================================================
     2. Skripte nachladen
     ========================================================================= */

  var geladeneTags = [];
  var laufStempel = "";   // haengt als ?v=... an jeder Datei: nie ein Cache-Stand

  function ladeSkript(pfad) {
    return new Promise(function (resolve, reject) {
      var tag = document.createElement("script");
      tag.src = pfad + (pfad.indexOf("?") >= 0 ? "&" : "?") + "v=" + laufStempel;
      tag.onload = function () { resolve(); };
      tag.onerror = function () { reject(new Error("Datei nicht gefunden: " + pfad)); };
      document.head.appendChild(tag);
      geladeneTags.push(tag);
    });
  }

  async function ladeDateien(dateien) {
    for (var i = 0; i < dateien.length; i++) { await ladeSkript(dateien[i]); }
  }

  function aufraeumen() {
    geladeneTags.forEach(function (tag) { if (tag.parentNode) { tag.parentNode.removeChild(tag); } });
    geladeneTags = [];
  }

  function findeKachel(schluessel) {
    var alle = window.KACHELN || [];
    for (var i = 0; i < alle.length; i++) {
      if (alle[i].schluessel === schluessel) { return alle[i]; }
    }
    return null;
  }

  /* Eintraege sind entweder Schluessel (String) oder fertige Kachel-Objekte */
  function kacheln(eintraege) {
    return eintraege.map(function (e) {
      return typeof e === "string" ? findeKachel(e) : e;
    }).filter(Boolean);
  }

  /* =========================================================================
     3. Datum, Kalenderwoche
     ========================================================================= */

  function montagDerWoche(datum) {
    var d = new Date(datum);
    var tag = d.getDay();
    d.setDate(d.getDate() + (tag === 0 ? -6 : 1 - tag));
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function isoKw(datum) {
    var d = new Date(Date.UTC(datum.getFullYear(), datum.getMonth(), datum.getDate()));
    var tagNr = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - tagNr + 3);
    var jahresBeginn = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
    return 1 + Math.round(((d - jahresBeginn) / 86400000 - 3 + ((jahresBeginn.getUTCDay() + 6) % 7)) / 7);
  }

  /* Handelswoche Montag bis Freitag; ab Samstag 0 Uhr die kommende Woche
     (Vorgabe Felix, 2026-09-27). */
  function berichtsWoche(heute) {
    var montag = montagDerWoche(heute);
    if (heute.getDay() === 6 || heute.getDay() === 0) {
      montag = new Date(montag);
      montag.setDate(montag.getDate() + 7);
    }
    var freitag = new Date(montag);
    freitag.setDate(freitag.getDate() + 4);
    return { montag: montag, freitag: freitag, kw: isoKw(montag) };
  }

  function datumKurz(d) {
    return String(d.getDate()).padStart(2, "0") + "." + String(d.getMonth() + 1).padStart(2, "0") + "." + d.getFullYear();
  }
  function isoKurz(iso) {
    var t = String(iso).split("-");
    return t[2] + "." + t[1] + "." + t[0];
  }
  function isoMonatJahr(iso) {
    var t = String(iso).split("-");
    return t[1] + "/" + t[0].slice(2);
  }

  /* =========================================================================
     4. Zeichenhelfer
     ========================================================================= */

  /* jsPDF-Kernschriften koennen nur WinAnsi: Minuszeichen und Delta ersetzen. */
  function sicher(t) {
    if (Array.isArray(t)) { return t.map(sicher); }
    if (typeof t !== "string") { return t; }
    return t.replace(/−/g, "-").replace(/Δ/g, "d ");
  }

  function schriftSicherMachen(doc) {
    var echtText = doc.text.bind(doc);
    doc.text = function (t, x, y, opt) { return echtText(sicher(t), x, y, opt); };
    var echteBreite = doc.getTextWidth.bind(doc);
    doc.getTextWidth = function (t) { return echteBreite(sicher(t)); };
  }

  function fuell(doc, f) { doc.setFillColor(f[0], f[1], f[2]); }
  function tinte(doc, f) { doc.setTextColor(f[0], f[1], f[2]); }
  function stift(doc, f) { doc.setDrawColor(f[0], f[1], f[2]); }

  function schrift(doc, groesse, stil) {
    doc.setFontSize(groesse);
    doc.setFont("helvetica", stil || "normal");
  }

  function haarlinie(doc, x1, y, x2, farbe, dicke) {
    stift(doc, farbe || C.linie);
    doc.setLineWidth(dicke || 0.15);
    doc.line(x1, y, x2, y);
  }

  function senkrechte(doc, x, y1, y2, farbe) {
    stift(doc, farbe || C.linie);
    doc.setLineWidth(0.12);
    doc.line(x, y1, x, y2);
  }

  function seitenGrund(doc) {
    fuell(doc, C.papier);
    doc.rect(0, 0, SEITE_B, SEITE_H, "F");
  }

  function karte(doc, x, y, b, h) {
    fuell(doc, C.karte);
    stift(doc, C.kartenRand);
    doc.setLineWidth(0.2);
    doc.roundedRect(x, y, b, h, 1.8, 1.8, "FD");
  }

  function dreieck(doc, mitteX, mitteY, diff, groesse) {
    if (!diff) { return; }
    fuell(doc, diff > 0 ? C.gut : C.schlecht);
    var h = groesse;
    if (diff > 0) {
      doc.triangle(mitteX, mitteY - h / 2, mitteX - h / 2, mitteY + h / 2, mitteX + h / 2, mitteY + h / 2, "F");
    } else {
      doc.triangle(mitteX, mitteY + h / 2, mitteX - h / 2, mitteY - h / 2, mitteX + h / 2, mitteY - h / 2, "F");
    }
  }

  function farbeFuerDiff(diff) {
    if (diff > 0) { return C.gut; }
    if (diff < 0) { return C.schlecht; }
    return C.matt;
  }

  /* =========================================================================
     5. Seitenkopf, -fuss, Umbruch
     ========================================================================= */

  function zeichneTitelkopf(doc) {
    var heute = new Date();
    var woche = berichtsWoche(heute);
    zustand.kw = "KW " + woche.kw;
    zustand.erzeugt = "erzeugt " + datumKurz(heute) + ", " +
      heute.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) + " Uhr";

    tinte(doc, C.tinte);
    schrift(doc, 25, "bold");
    doc.text("MakroReport", RAND, 26);

    schrift(doc, 10, "bold");
    doc.text(zustand.kw, SEITE_B - RAND, 20.5, { align: "right" });
    tinte(doc, C.matt);
    schrift(doc, 7.5);
    doc.text("Handelswoche " + datumKurz(woche.montag) + " – " + datumKurz(woche.freitag),
      SEITE_B - RAND, 25.5, { align: "right" });

    stift(doc, C.akzent);
    doc.setLineWidth(0.6);
    doc.line(RAND, 30, RAND + INHALT, 30);

    tinte(doc, C.matt);
    schrift(doc, 7.5);
    doc.text("Makro-Wochenreport · FIST-Analyseprozess", RAND, 35);
    return 41;
  }

  function zeichneLaufkopf(doc) {
    tinte(doc, C.zart);
    schrift(doc, 6.5);
    doc.text("MakroReport · " + zustand.kw, RAND, 12);
    if (zustand.bereich) { doc.text(zustand.bereich, SEITE_B - RAND, 12, { align: "right" }); }
    haarlinie(doc, RAND, 14.5, RAND + INHALT, C.linie);
    return 22;
  }

  function neueSeite(doc) {
    doc.addPage();
    seitenGrund(doc);
    return zeichneLaufkopf(doc);
  }

  function platzPruefen(doc, y, hoehe) {
    if (y + hoehe > UNTERKANTE) { return neueSeite(doc); }
    return y;
  }

  function zeichneFuesse(doc) {
    var n = doc.getNumberOfPages();
    for (var i = 1; i <= n; i++) {
      doc.setPage(i);
      haarlinie(doc, RAND, SEITE_H - 15, RAND + INHALT, C.linie);
      tinte(doc, C.zart);
      schrift(doc, 6);
      doc.text("Makro-Dashboard · " + zustand.erzeugt + " · Daten wie auf der Website (gleiche Rechenlogik)",
        RAND, SEITE_H - 11);
      doc.text("Seite " + i + " von " + n, SEITE_B - RAND, SEITE_H - 11, { align: "right" });
    }
  }

  /* Kleine Abschnittsueberschrift in Grossbuchstaben */
  function abschnitt(doc, y, text) {
    tinte(doc, C.matt);
    schrift(doc, 6.6, "bold");
    doc.text(text.toUpperCase(), RAND, y);
    return y + 4;
  }

  /* =========================================================================
     6. Chart (Vektor)
     ========================================================================= */

  function letzteNJahre(punkte, jahre) {
    if (!punkte.length) { return punkte; }
    var letztes = new Date(punkte[punkte.length - 1].d + "T00:00:00");
    var grenze = new Date(letztes);
    grenze.setFullYear(grenze.getFullYear() - jahre);
    var teil = punkte.filter(function (p) { return new Date(p.d + "T00:00:00") >= grenze; });
    return teil.length >= 2 ? teil : punkte;
  }

  function letzteNMonate(punkte, monate) {
    if (!punkte.length) { return punkte; }
    var letztes = new Date(punkte[punkte.length - 1].d + "T00:00:00");
    var grenze = new Date(letztes);
    grenze.setMonth(grenze.getMonth() - monate);
    var teil = punkte.filter(function (p) { return new Date(p.d + "T00:00:00") >= grenze; });
    return teil.length >= 2 ? teil : punkte;
  }

  function zeitfenster(punkte, opt) {
    if (opt.monate) { return letzteNMonate(punkte, opt.monate); }
    return letzteNJahre(punkte, opt.jahre || 3);
  }

  /* Verdichtet lange Reihen, behaelt Hoch- und Tiefpunkt je Abschnitt */
  function verdichte(punkte, maxN) {
    if (punkte.length <= maxN) { return punkte; }
    var koerbe = Math.max(2, Math.floor(maxN / 2));
    var groesse = punkte.length / koerbe;
    var raus = [];
    for (var b = 0; b < koerbe; b++) {
      var von = Math.floor(b * groesse);
      var bis = Math.min(punkte.length, Math.floor((b + 1) * groesse));
      if (bis <= von) { continue; }
      var iMin = von, iMax = von;
      for (var i = von; i < bis; i++) {
        if (punkte[i].v < punkte[iMin].v) { iMin = i; }
        if (punkte[i].v > punkte[iMax].v) { iMax = i; }
      }
      var erst = Math.min(iMin, iMax), dann = Math.max(iMin, iMax);
      raus.push(punkte[erst]);
      if (dann !== erst) { raus.push(punkte[dann]); }
    }
    if (raus[raus.length - 1] !== punkte[punkte.length - 1]) { raus.push(punkte[punkte.length - 1]); }
    return raus;
  }

  /* opt: achsen, flaeche, format, art, bandKey(p), maxPunkte, monate/jahre,
          dick, farbe (Linienfarbe), flaecheFarbe, punktRadius                */
  function zeichneVerlauf(doc, x, y, breite, hoehe, punkte, opt) {
    opt = opt || {};
    var M = window.MOTOR;
    var achsenBreite = opt.achsen ? 13 : 0;
    var datumHoehe = opt.achsen ? 4.5 : 0;
    var plotB = breite - achsenBreite;
    var plotH = hoehe - datumHoehe;
    var linienFarbe = opt.farbe || C.akzent;

    if (!punkte || punkte.length < 2) {
      tinte(doc, C.zart);
      schrift(doc, 6);
      doc.text("keine Historie", x + 1, y + plotH / 2);
      return;
    }

    var teil = verdichte(zeitfenster(punkte, opt), opt.maxPunkte || 240);
    var werte = teil.map(function (p) { return p.v; });
    var min = Math.min.apply(null, werte), max = Math.max.apply(null, werte);
    if (min === max) { min -= 1; max += 1; }
    var luft = (max - min) * 0.10;
    var unten = min - luft, oben = max + luft;

    function px(i) { return x + (i / (teil.length - 1)) * plotB; }
    function py(v) { return y + plotH - ((v - unten) / (oben - unten)) * plotH; }

    /* Regime-Baender: jeder Tag bekommt seine Breite (halber Schritt links
       und rechts), damit keine Luecken zwischen den Baendern bleiben. */
    if (opt.bandKey) {
      var schritt = plotB / (teil.length - 1);
      var start = 0;
      for (var i = 1; i <= teil.length; i++) {
        var jetzt = i < teil.length ? opt.bandKey(teil[i]) : " ";
        if (jetzt === opt.bandKey(teil[start])) { continue; }
        var label = opt.bandKey(teil[start]);
        var farbe = label && REGIME_FARBE[label];
        if (farbe) {
          var xa = Math.max(x, px(start) - schritt / 2);
          var xb = Math.min(x + plotB, px(i - 1) + schritt / 2);
          fuell(doc, farbe);
          doc.rect(xa, y, Math.max(0.25, xb - xa), plotH, "F");
        }
        start = i;
      }
    }

    if (opt.achsen) {
      [max, (max + min) / 2, min].forEach(function (w) {
        haarlinie(doc, x, py(w), x + plotB, C.raster);
        tinte(doc, C.zart);
        schrift(doc, 5);
        doc.text(M.zahl(w, opt.format), x + plotB + 1.5, py(w) + 1.2);
      });
    }

    if (unten < 0 && oben > 0) { haarlinie(doc, x, py(0), x + plotB, C.bandNull, 0.2); }

    var seg = [];
    for (var s = 1; s < teil.length; s++) {
      seg.push([px(s) - px(s - 1), py(teil[s].v) - py(teil[s - 1].v)]);
    }

    if (opt.flaeche) {
      var basis = y + plotH;
      var fseg = seg.slice();
      fseg.push([0, basis - py(teil[teil.length - 1].v)]);
      fseg.push([px(0) - px(teil.length - 1), 0]);
      fuell(doc, opt.flaecheFarbe || C.akzentFlaeche);
      doc.lines(fseg, px(0), py(teil[0].v), [1, 1], "F", true);
    }

    stift(doc, linienFarbe);
    doc.setLineWidth(opt.dick || 0.35);
    doc.setLineJoin("round");
    doc.setLineCap("round");
    doc.lines(seg, px(0), py(teil[0].v), [1, 1], "S", false);

    var letzt = teil[teil.length - 1];
    fuell(doc, linienFarbe);
    doc.circle(px(teil.length - 1), py(letzt.v), opt.punktRadius || (opt.achsen ? 0.7 : 0.45), "F");

    if (opt.achsen) {
      var mitte = teil[Math.floor((teil.length - 1) / 2)];
      var yD = y + plotH + 3.4;
      tinte(doc, C.zart);
      schrift(doc, 5);
      var fmt = opt.art === "tag" || opt.art === "woche" ? isoKurz : isoMonatJahr;
      doc.text(fmt(teil[0].d), x, yD);
      doc.text(fmt(mitte.d), x + plotB / 2, yD, { align: "center" });
      doc.text(fmt(letzt.d), x + plotB, yD, { align: "right" });
    }
  }

  /* =========================================================================
     7. Datenaufbereitung je Kennzahl (nur ueber window.MOTOR)
     ========================================================================= */

  /* Farbe und Pfeil richten sich nach dem GERUNDETEN Wert (g). */
  function zeileBerechnen(k) {
    var M = window.MOTOR;
    var punkte = M.punkteVon(k);
    if (!punkte.length) { return { titel: k.titel, leer: true, d: [] }; }
    var art = M.frequenzArt(k);
    var letzter = punkte[punkte.length - 1];
    var d = [1, 3, 6].map(function (n) {
      var vp = M.trendVergleichspunkt(punkte, n);
      if (!vp) { return null; }
      var diff = letzter.v - vp.v;
      return { diff: diff, g: M.gerundet(diff, k.format), text: M.veraenderungText(diff, k.format) };
    });
    return {
      titel: k.titel,
      aktuell: M.zahl(letzter.v, k.format),
      einheit: M.einheitVon(k) || "",
      stand: M.datumText(letzter.d, art),
      standIso: letzter.d,
      d: d,
      punkte: verdichte(letzteNJahre(punkte, 3), 90),
      art: art
    };
  }

  var BEREICHE = {};

  function bereichBerechnen(id, name, kachelListe) {
    var zeilen = kachelListe.map(zeileBerechnen);
    var t = { up: 0, down: 0, flat: 0 };
    var jung = null;
    zeilen.forEach(function (z) {
      if (z.standIso && (!jung || z.standIso > jung)) { jung = z.standIso; }
      var x = z.d && z.d[1];
      if (!x) { return; }
      if (x.g > 0) { t.up++; } else if (x.g < 0) { t.down++; } else { t.flat++; }
    });
    BEREICHE[id] = { name: name, zeilen: zeilen, trend: t, jung: jung };
  }

  /* =========================================================================
     8. FIST 5 auf einen Blick
     ========================================================================= */

  var FIST = [
    { bereich: "arbeit", index: 0, name: "Nonfarm Payrolls" },
    { bereich: "infl",   index: 0, name: "CPI Headline" },
    { bereich: "wachs",  index: 0, name: "US GDP" },
    { bereich: "zins",   index: 0, name: "FED Leitzins" },
    { bereich: "plumb",  index: 0, name: "VIX" }
  ];

  function trendBalken(doc, x, y, b, h, t) {
    var summe = (t.up + t.down + t.flat) || 1;
    var luecke = 0.6;
    var teile = [[t.up, C.gut], [t.down, C.schlecht], [t.flat, C.neutralBalken]].filter(function (e) { return e[0] > 0; });
    var frei = b - luecke * (teile.length - 1);
    var xx = x;
    teile.forEach(function (e) {
      var w = frei * e[0] / summe;
      fuell(doc, e[1]);
      doc.roundedRect(xx, y, w, h, h / 2, h / 2, "F");
      xx += w + luecke;
    });
  }

  function zeichneFist(doc, y) {
    y = abschnitt(doc, y, "FIST 5 – auf einen Blick");
    var luecke = 3;
    var b = (INHALT - luecke * 4) / 5;
    var h = 41;
    FIST.forEach(function (f, i) {
      var bereich = BEREICHE[f.bereich];
      var z = bereich && bereich.zeilen[f.index];
      var x = RAND + i * (b + luecke);
      karte(doc, x, y, b, h);
      tinte(doc, C.akzent);
      schrift(doc, 5.8, "bold");
      doc.text(bereich.name.toUpperCase(), x + 2.5, y + 5);
      tinte(doc, C.matt);
      schrift(doc, 6.4);
      doc.text(f.name, x + 2.5, y + 9.5);
      if (!z || z.leer) { return; }
      tinte(doc, C.tinte);
      schrift(doc, 13, "bold");
      doc.text(z.aktuell, x + 2.5, y + 16.5);
      var w = doc.getTextWidth(z.aktuell);
      tinte(doc, C.matt);
      schrift(doc, 5.4);
      if (z.einheit) { doc.text(z.einheit, x + 3.5 + w, y + 16.5); }
      zeichneVerlauf(doc, x + 2.5, y + 19.5, b - 5, 11, z.punkte, { flaeche: true, maxPunkte: 70, dick: 0.3 });
      trendBalken(doc, x + 2.5, y + 33, b - 5, 1.8, bereich.trend);
      schrift(doc, 5.6, "bold");
      tinte(doc, C.gut);
      doc.text(String(bereich.trend.up), x + 2.5, y + 38);
      tinte(doc, C.schlecht);
      doc.text(String(bereich.trend.down), x + b / 2, y + 38, { align: "center" });
      tinte(doc, C.matt);
      doc.text(String(bereich.trend.flat), x + b - 2.5, y + 38, { align: "right" });
    });
    y += h + 4;

    /* Legende */
    var lx = RAND;
    [[C.gut, "steigend"], [C.schlecht, "fallend"], [C.neutralBalken, "unverändert"]].forEach(function (e) {
      fuell(doc, e[0]);
      doc.rect(lx, y - 2, 2.2, 2.2, "F");
      tinte(doc, C.matt);
      schrift(doc, 5.8);
      doc.text(e[1], lx + 3.4, y);
      lx += 3.4 + doc.getTextWidth(e[1]) + 5;
    });
    doc.text("3-Monats-Trend aller Kennzahlen des Bereichs", lx, y);
    return y + 9;
  }

  /* =========================================================================
     9. Heatmap-Tabellen
     ========================================================================= */

  function tabellenKopf(doc, y) {
    tinte(doc, C.matt);
    schrift(doc, 5.8, "bold");
    doc.text("KENNZAHL", RAND + 1.5, y);
    doc.text("VERLAUF 3J", T.spark + T.sparkB / 2, y, { align: "center" });
    doc.text("AKTUELL", T.aktRechts, y, { align: "right" });
    ["1M", "3M", "6M"].forEach(function (n, i) {
      doc.text(n, T.c1 + T.cw * i + T.cw / 2, y, { align: "center" });
    });
    haarlinie(doc, RAND, y + 1.8, RAND + INHALT, C.linieDunkel, 0.25);
    return y + 2.6;
  }

  function gruppenKopf(doc, y, bereich, fortsetzung) {
    tinte(doc, C.akzent);
    schrift(doc, 8, "bold");
    doc.text(bereich.name.toUpperCase() + (fortsetzung ? " (FORTSETZUNG)" : ""), RAND, y);
    if (!fortsetzung) {
      tinte(doc, C.zart);
      schrift(doc, 5.8);
      var t = bereich.trend;
      doc.text("3-Monats-Trend: " + t.up + " steigend · " + t.down + " fallend · " + t.flat + " unverändert",
        RAND + INHALT, y, { align: "right" });
    }
    stift(doc, C.akzent);
    doc.setLineWidth(0.4);
    doc.line(RAND, y + 1.8, RAND + INHALT, y + 1.8);
    return y + 6.2;
  }

  function spaltenLinien(doc, y, h) {
    [T.spark, T.akt, T.c1, T.c1 + T.cw, T.c1 + 2 * T.cw].forEach(function (x) { senkrechte(doc, x, y, y + h); });
  }

  /* mitHeat = true: Farbflaeche je Zelle (Heatmap), false: nur Pfeil + Zahl */
  function tabellenZeile(doc, y, z, mitHeat) {
    var mitte = y + ZEILE_H / 2;
    tinte(doc, C.tinte);
    schrift(doc, 6.9);
    doc.text(doc.splitTextToSize(z.titel, T.nameB - 2)[0], RAND + 1.5, mitte + 0.8);
    spaltenLinien(doc, y, ZEILE_H);

    if (z.leer) {
      tinte(doc, C.zart);
      schrift(doc, 6);
      doc.text("keine Daten", T.spark + 2, mitte + 0.8);
      haarlinie(doc, RAND, y + ZEILE_H, RAND + INHALT, C.linie, 0.12);
      return y + ZEILE_H;
    }

    zeichneVerlauf(doc, T.spark + 1.5, y + 1.1, T.sparkB - 3, ZEILE_H - 2.2, z.punkte, { maxPunkte: 70, dick: 0.22, punktRadius: 0.4 });

    tinte(doc, C.tinte);
    schrift(doc, 7.2, "bold");
    doc.text(z.aktuell, T.aktRechts, mitte + 0.8, { align: "right" });
    tinte(doc, C.zart);
    schrift(doc, 4.6);
    doc.text(doc.splitTextToSize((z.einheit ? z.einheit + " · " : "") + z.stand, T.c1 - T.aktRechts - 3)[0],
      T.aktRechts + 1.6, mitte + 0.8);

    var maxAbs = 0;
    z.d.forEach(function (e) { if (e && Math.abs(e.diff) > maxAbs) { maxAbs = Math.abs(e.diff); } });

    z.d.forEach(function (e, i) {
      var zx = T.c1 + T.cw * i;
      var cx = zx + T.cw / 2;
      if (!e) {
        tinte(doc, C.zart);
        schrift(doc, 6.5);
        doc.text("–", cx, mitte + 0.8, { align: "center" });
        return;
      }
      if (mitHeat) {
        var flaeche, text;
        if (e.g === 0) {
          flaeche = C.neutralZelle; text = C.matt;
        } else {
          var r = maxAbs ? Math.abs(e.diff) / maxAbs : 0;
          var stufe = r > 0.66 ? 2 : r > 0.25 ? 1 : 0;
          var paar = (e.g > 0 ? HEAT_GRUEN : HEAT_ROT)[stufe];
          flaeche = paar[0]; text = paar[1];
        }
        fuell(doc, flaeche);
        doc.roundedRect(zx + 0.7, y + 0.8, T.cw - 1.4, ZEILE_H - 1.6, 0.8, 0.8, "F");
        tinte(doc, text);
        schrift(doc, 6.4, "bold");
        doc.text(e.text, cx, mitte + 0.8, { align: "center" });
      } else {
        tinte(doc, farbeFuerDiff(e.g));
        schrift(doc, 6.6, "bold");
        var tb = doc.getTextWidth(e.text);
        doc.text(e.text, cx + (e.g ? 1 : 0), mitte + 0.8, { align: "center" });
        dreieck(doc, cx + (e.g ? 1 : 0) - tb / 2 - 1.5, mitte - 0.2, e.g, 1.9);
      }
    });

    haarlinie(doc, RAND, y + ZEILE_H, RAND + INHALT, C.linie, 0.12);
    return y + ZEILE_H;
  }

  function zeichneTabelle(doc, y, id, mitHeat) {
    var bereich = BEREICHE[id];
    zustand.bereich = bereich.name;
    y = platzPruefen(doc, y, 6.2 + 4.4 + ZEILE_H * 2);
    y = gruppenKopf(doc, y, bereich, false);
    y = tabellenKopf(doc, y) + 0.4;
    bereich.zeilen.forEach(function (z) {
      var vorher = y;
      y = platzPruefen(doc, y, ZEILE_H);
      if (y < vorher) {
        y = gruppenKopf(doc, y + 2, bereich, true);
        y = tabellenKopf(doc, y) + 0.4;
      }
      y = tabellenZeile(doc, y, z, mitHeat);
    });
    return y + 4;
  }

  function heatLegende(doc, y) {
    y = platzPruefen(doc, y, 6);
    tinte(doc, C.matt);
    schrift(doc, 5.8);
    doc.text("Stärke:", RAND, y);
    var x = RAND + 9;
    function reihe(stufen, text) {
      stufen.forEach(function (s) { fuell(doc, s[0]); doc.roundedRect(x, y - 2.2, 6, 2.6, 0.5, 0.5, "F"); x += 7; });
      tinte(doc, C.matt);
      doc.text(text, x, y);
      x += doc.getTextWidth(text) + 5;
    }
    reihe(HEAT_ROT, "fallend");
    reihe(HEAT_GRUEN, "steigend");
    fuell(doc, C.neutralZelle);
    doc.roundedRect(x, y - 2.2, 6, 2.6, 0.5, 0.5, "F");
    doc.text("unverändert", x + 7.5, y);
    doc.text("Sättigung = Stärke relativ zur größten Veränderung der Zeile", RAND + INHALT, y, { align: "right" });
    return y + 6;
  }

  /* =========================================================================
     10. Uebersicht: Donuts, Balance, Datenfrische
     ========================================================================= */

  function ringSegment(doc, cx, cy, r1, r2, a0, a1, farbe) {
    var n = Math.max(2, Math.ceil((a1 - a0) / 0.08));
    var pts = [], i, a;
    for (i = 0; i <= n; i++) {
      a = a0 + (a1 - a0) * i / n;
      pts.push([cx + r2 * Math.sin(a), cy - r2 * Math.cos(a)]);
    }
    for (i = n; i >= 0; i--) {
      a = a0 + (a1 - a0) * i / n;
      pts.push([cx + r1 * Math.sin(a), cy - r1 * Math.cos(a)]);
    }
    var seg = [];
    for (i = 1; i < pts.length; i++) { seg.push([pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]]); }
    fuell(doc, farbe);
    doc.lines(seg, pts[0][0], pts[0][1], [1, 1], "F", true);
  }

  var REIHENFOLGE = ["arbeit", "infl", "wachs", "zins", "plumb"];

  function zeichneUebersicht(doc, y) {
    y = platzPruefen(doc, y, 110);
    zustand.bereich = "Übersicht";
    y = abschnitt(doc, y, "Trend-Verteilung je Bereich (3 Monate)");

    var luecke = 3;
    var b = (INHALT - luecke * 4) / 5;
    var h = 40;
    REIHENFOLGE.forEach(function (id, i) {
      var bereich = BEREICHE[id];
      var t = bereich.trend;
      var x = RAND + i * (b + luecke);
      karte(doc, x, y, b, h);
      tinte(doc, C.akzent);
      schrift(doc, 6.4, "bold");
      doc.text(bereich.name.toUpperCase(), x + b / 2, y + 5.5, { align: "center" });

      var cx = x + b / 2, cy = y + 19, summe = t.up + t.down + t.flat;
      var teile = [[t.up, C.gut], [t.down, C.schlecht], [t.flat, C.neutralBalken]].filter(function (e) { return e[0] > 0; });
      var winkel = 0;
      teile.forEach(function (e) {
        var spanne = 2 * Math.PI * e[0] / (summe || 1);
        var pad = teile.length > 1 ? 0.03 : 0;
        ringSegment(doc, cx, cy, 6.8, 11, winkel + pad, winkel + spanne - pad, e[1]);
        winkel += spanne;
      });
      tinte(doc, C.tinte);
      schrift(doc, 10, "bold");
      doc.text(String(summe), cx, cy + 1.8, { align: "center" });

      var zx = [x + 4.5, x + b / 2 - 2.2, x + b - 9];
      [[t.up, C.gut], [t.down, C.schlecht], [t.flat, C.neutralBalken]].forEach(function (e, k) {
        fuell(doc, e[1]);
        doc.rect(zx[k], y + 33.4, 1.8, 1.8, "F");
        tinte(doc, C.matt);
        schrift(doc, 6.4, "bold");
        doc.text(String(e[0]), zx[k] + 2.8, y + 35.1);
      });
    });
    y += h + 8;

    /* Links: Balance, rechts: Datenfrische */
    var halbB = (INHALT - 10) / 2;
    tinte(doc, C.matt);
    schrift(doc, 6.6, "bold");
    doc.text("BALANCE FALLEND ◄ ► STEIGEND".replace("◄ ►", "|"), RAND, y);
    doc.text("DATENFRISCHE · JÜNGSTE VERÖFFENTLICHUNG", RAND + halbB + 10, y);

    var maxT = 1;
    REIHENFOLGE.forEach(function (id) { maxT = Math.max(maxT, BEREICHE[id].trend.up, BEREICHE[id].trend.down); });
    var nullX = RAND + 22 + (halbB - 22) / 2;
    var halb = (halbB - 22) / 2;
    var yy = y + 6;
    REIHENFOLGE.forEach(function (id) {
      var t = BEREICHE[id].trend;
      tinte(doc, C.tinte);
      schrift(doc, 6.8);
      doc.text(BEREICHE[id].name, RAND, yy + 2.3);
      var lw = halb * t.down / maxT, rw = halb * t.up / maxT;
      if (lw > 0) { fuell(doc, C.schlecht); doc.roundedRect(nullX - lw, yy, lw, 3.6, 0.8, 0.8, "F"); }
      if (rw > 0) { fuell(doc, C.gut); doc.roundedRect(nullX, yy, rw, 3.6, 0.8, 0.8, "F"); }
      schrift(doc, 5.8, "bold");
      tinte(doc, C.weiss);
      if (lw > 3) { doc.text(String(t.down), nullX - 1, yy + 2.6, { align: "right" }); }
      if (rw > 3) { doc.text(String(t.up), nullX + 1, yy + 2.6); }
      yy += 7;
    });
    stift(doc, C.tinte);
    doc.setLineWidth(0.2);
    doc.line(nullX, y + 4.5, nullX, yy - 1.5);

    var fx = RAND + halbB + 10, fb = halbB - 10;
    var fy = y + 6;
    REIHENFOLGE.forEach(function (id) {
      tinte(doc, C.tinte);
      schrift(doc, 7, "bold");
      doc.text(BEREICHE[id].name, fx, fy + 2.5);
      tinte(doc, C.matt);
      schrift(doc, 7);
      doc.text(BEREICHE[id].jung ? isoKurz(BEREICHE[id].jung) : "–", fx + fb, fy + 2.5, { align: "right" });
      haarlinie(doc, fx, fy + 4.2, fx + fb, C.linie, 0.12);
      fy += 7;
    });
    return Math.max(yy, fy) + 4;
  }

  /* =========================================================================
     10b. Stress-Barometer Plumbing (Rechenkern: stress-score.js, wie Website)
     ========================================================================= */

  var STRESS_FARBE = {
    niedrig:  [0, 99, 0],
    leicht:   [122, 168, 42],
    erhoeht:  [224, 160, 0],
    hoch:     [208, 59, 59],
    sehrhoch: [122, 15, 15]
  };

  function zahlDe(v, dez) {
    return Number(v).toLocaleString("de-DE", { minimumFractionDigits: dez, maximumFractionDigits: dez });
  }

  function zeichneBarometer(doc, y) {
    var S = window.STRESS;
    var erg = S && S.stand() ? S.berechne(S.stand()) : null;
    if (!erg) { return y; }
    var H = 61;
    y = platzPruefen(doc, y, H + 8);
    y = abschnitt(doc, y, "Stress-Barometer Plumbing · Stand " + isoKurz(S.stand()));
    karte(doc, RAND, y, INHALT, H);

    /* Halbkreis: Winkel 0 = oben, -PI/2 = links, +PI/2 = rechts */
    var cx = RAND + 36, cy = y + 29, r1 = 15, r2 = 22;
    function winkel(v) { return -Math.PI / 2 + Math.PI * v / 100; }
    S.ZONEN.forEach(function (z) {
      ringSegment(doc, cx, cy, r1, r2, winkel(z.von) + 0.012, winkel(z.bis) - 0.012, STRESS_FARBE[z.id]);
    });
    tinte(doc, C.zart);
    schrift(doc, 5.5);
    [0, 20, 40, 60, 80, 100].forEach(function (v) {
      var a = winkel(v), rr = r2 + 3.2;
      doc.text(String(v), cx + rr * Math.sin(a), cy - rr * Math.cos(a) + 1, { align: "center" });
    });
    var an = winkel(Math.min(100, erg.barometer));
    stift(doc, C.tinte);
    doc.setLineWidth(0.8);
    doc.line(cx, cy, cx + (r1 - 2) * Math.sin(an), cy - (r1 - 2) * Math.cos(an));
    fuell(doc, C.tinte);
    doc.circle(cx, cy, 1.6, "F");

    tinte(doc, STRESS_FARBE[erg.zone.id]);
    schrift(doc, 16, "bold");
    doc.text(zahlDe(erg.barometer, 0), cx, cy + 9.5, { align: "center" });
    schrift(doc, 6.6, "bold");
    doc.text(erg.zone.name, cx, cy + 14, { align: "center" });

    /* Balkenliste rechts */
    var x0 = RAND + 76, nameB = 27, balkenB = 46, zeile = 4.9;
    var yy = y + 8;
    tinte(doc, C.matt);
    schrift(doc, 5.6, "bold");
    doc.text("KENNZAHL (GEWICHT)", x0, yy - 2);
    doc.text("SCORE", RAND + INHALT - 4, yy - 2, { align: "right" });
    var letzteGruppe = "";
    erg.bereiche.forEach(function (b) {
      if (letzteGruppe && b.gruppe !== letzteGruppe) {
        haarlinie(doc, x0, yy - 1.4, RAND + INHALT - 4, C.linie, 0.12);
        yy += 1.2;
      }
      letzteGruppe = b.gruppe;
      tinte(doc, C.tinte);
      schrift(doc, 6.6, "bold");
      doc.text(b.name, x0, yy + 2.6);
      tinte(doc, C.zart);
      schrift(doc, 5.6);
      doc.text(b.gewicht + " %", x0 + nameB - 1, yy + 2.6, { align: "right" });
      var bx = x0 + nameB + 1;
      fuell(doc, C.raster);
      doc.roundedRect(bx, yy + 0.8, balkenB, 2.6, 1.3, 1.3, "F");
      if (b.verfuegbar) {
        var fz = STRESS_FARBE[S.zoneVon(b.score).id];
        fuell(doc, fz);
        doc.roundedRect(bx, yy + 0.8, Math.max(2.6, balkenB * b.score / 100), 2.6, 1.3, 1.3, "F");
        tinte(doc, fz);
        schrift(doc, 7, "bold");
        doc.text(zahlDe(b.score, 0), RAND + INHALT - 4, yy + 3, { align: "right" });
      } else {
        tinte(doc, C.zart);
        schrift(doc, 6);
        doc.text("–", RAND + INHALT - 4, yy + 3, { align: "right" });
      }
      yy += zeile;
    });

    /* Fusszeile der Karte: Stress-Kette und Verlauf */
    var fy = y + H - 13;
    haarlinie(doc, RAND + 3, fy - 3, RAND + INHALT - 3, C.linie, 0.12);
    tinte(doc, C.matt);
    schrift(doc, 5.6, "bold");
    doc.text("STRESS-KETTE · " + erg.kette.anzahl + " VON " + erg.kette.von + " (AB " + erg.kette.schwelle + " PUNKTEN)", RAND + 4, fy + 1);
    var kx = RAND + 4;
    erg.kette.liste.forEach(function (c) {
      fuell(doc, c.stress ? C.schlecht : C.neutralBalken);
      doc.circle(kx + 1, fy + 5.3, 1.1, "F");
      tinte(doc, c.stress ? C.tinte : C.zart);
      schrift(doc, 6.4, c.stress ? "bold" : "normal");
      doc.text(c.name, kx + 3.2, fy + 6.2);
      kx += 3.2 + doc.getTextWidth(c.name) + 5;
    });

    var zp = S.zeitpunkte();
    var hx = RAND + 76;
    var hb = (INHALT - 76 - 4) / zp.length;
    tinte(doc, C.matt);
    schrift(doc, 5.6, "bold");
    doc.text("VERLAUF DES BAROMETERS", hx, fy + 1);
    zp.forEach(function (z, i) {
      var e = S.berechne(z.datum);
      var x = hx + i * hb;
      tinte(doc, C.zart);
      schrift(doc, 5.4);
      doc.text(z.label, x, fy + 5);
      if (e) {
        var t = zahlDe(e.barometer, 0);
        tinte(doc, STRESS_FARBE[e.zone.id]);
        schrift(doc, 8, "bold");
        doc.text(t, x, fy + 9.6);
        var tb = doc.getTextWidth(t);
        schrift(doc, 5.4);
        doc.text(e.zone.name, x + tb + 1.4, fy + 9.4);
      }
    });
    return y + H + 5;
  }

  /* =========================================================================
     11. Kapitalrotation (2 x 2)
     ========================================================================= */

  /* Kapitalrotation: vier Linien (S&P 500, Ratio, Zaehler-ETF, Nenner-ETF),
     alle auf 100 am Anfang des Zeitraums normiert (unterschiedliche Skalen).
     Farben wie im TradingView-Vorbild: Zaehler gruen, Nenner rot. */
  function zeichneRotationsChart(doc, x, y, breite, hoehe, k, punkte) {
    var cfg = k.rotation;
    var quelle = (window.QUELLEN || {})[k.quelle];
    function map(schluessel) {
      var r = quelle && quelle.reihen && quelle.reihen[schluessel];
      var m = {};
      if (r && r.punkte) { r.punkte.forEach(function (p) { m[p.d] = p.v; }); }
      return m;
    }
    var fenster = letzteNMonate(punkte, 3);
    var linien = [
      { name: "S&P 500", farbe: C.tinte, m: map(cfg.spx), dick: 0.3 },
      { name: k.titel, farbe: C.akzent, m: null, dick: 0.5 },
      { name: cfg.zaehlerName, farbe: C.gut, m: map(cfg.zaehler), dick: 0.3 },
      { name: cfg.nennerName, farbe: C.schlecht, m: map(cfg.nenner), dick: 0.3 }
    ];
    var alle = [];
    linien.forEach(function (l) {
      l.v = fenster.map(function (p) {
        var w = l.m ? l.m[p.d] : p.v;
        return (w === undefined || w === null) ? null : w;
      });
      var b0 = null;
      for (var i = 0; i < l.v.length; i++) { if (l.v[i] !== null) { b0 = l.v[i]; break; } }
      l.n = b0 === null ? null : l.v.map(function (w) { return w === null ? null : w / b0 * 100; });
      if (l.n) { l.n.forEach(function (w) { if (w !== null) { alle.push(w); } }); }
    });
    if (!alle.length || fenster.length < 2) { return; }

    var achsenB = 9, datumH = 4.5, plotB = breite - achsenB, plotH = hoehe - datumH;
    var min = Math.min.apply(null, alle), max = Math.max.apply(null, alle);
    var luft = (max - min) * 0.10 || 1;
    var unten = min - luft, oben = max + luft, n = fenster.length;
    function px(i) { return x + (i / (n - 1)) * plotB; }
    function py(v) { return y + plotH - ((v - unten) / (oben - unten)) * plotH; }

    [oben - luft, (min + max) / 2, unten + luft].forEach(function (w) {
      haarlinie(doc, x, py(w), x + plotB, C.raster);
      tinte(doc, C.zart);
      schrift(doc, 5);
      doc.text(zahlDe(w, 0), x + plotB + 1.5, py(w) + 1.2);
    });
    if (unten < 100 && oben > 100) {
      stift(doc, C.bandNull);
      doc.setLineWidth(0.2);
      if (doc.setLineDashPattern) { doc.setLineDashPattern([1, 1], 0); }
      doc.line(x, py(100), x + plotB, py(100));
      if (doc.setLineDashPattern) { doc.setLineDashPattern([], 0); }
    }
    linien.forEach(function (l) {
      if (!l.n) { return; }
      stift(doc, l.farbe);
      doc.setLineWidth(l.dick);
      doc.setLineJoin("round");
      doc.setLineCap("round");
      var offen = false, letzt = null;
      for (var i = 0; i < n; i++) {
        if (l.n[i] === null) { offen = false; continue; }
        if (offen && letzt !== null) { doc.line(px(letzt), py(l.n[letzt]), px(i), py(l.n[i])); }
        offen = true; letzt = i;
      }
    });
    var yD = y + plotH + 3.4;
    tinte(doc, C.zart);
    schrift(doc, 5);
    doc.text(isoKurz(fenster[0].d), x, yD);
    doc.text(isoKurz(fenster[Math.floor((n - 1) / 2)].d), x + plotB / 2, yD, { align: "center" });
    doc.text(isoKurz(fenster[n - 1].d), x + plotB, yD, { align: "right" });
  }

  /* Legende (farbige Striche) rechtsbuendig auf Hoehe yy */
  function zeichneRotationsLegende(doc, xRechts, yy, k) {
    var namen = [["S&P 500", C.tinte], [k.titel, C.akzent], [k.rotation.zaehlerName, C.gut], [k.rotation.nennerName, C.schlecht]];
    schrift(doc, 5.8);
    var gesamt = 0;
    namen.forEach(function (e) { gesamt += 5.5 + doc.getTextWidth(e[0]) + 3.5; });
    var xx = xRechts - gesamt;
    namen.forEach(function (e) {
      stift(doc, e[1]);
      doc.setLineWidth(0.6);
      doc.line(xx, yy - 1, xx + 4.2, yy - 1);
      tinte(doc, C.matt);
      doc.text(e[0], xx + 5.5, yy);
      xx += 5.5 + doc.getTextWidth(e[0]) + 3.5;
    });
  }

  function zeichneKapitalrotation(doc, y, liste) {
    var M = window.MOTOR;
    y = platzPruefen(doc, y, 130);
    zustand.bereich = "Kapitalrotation";
    y = abschnitt(doc, y, "Kapitalrotation · Konjunkturzyklus-Frühindikatoren");
    var luecke = 4;
    var b = (INHALT - luecke) / 2;
    var h = 60;
    liste.forEach(function (k, i) {
      var x = RAND + (i % 2) * (b + luecke);
      var yy = y + Math.floor(i / 2) * (h + luecke);
      karte(doc, x, yy, b, h);
      var punkte = M.punkteVon(k);
      var z = zeileBerechnen(k);
      tinte(doc, C.tinte);
      schrift(doc, 8.5, "bold");
      doc.text(k.titel, x + 3, yy + 5.5);
      var tb = doc.getTextWidth(k.titel);
      tinte(doc, C.matt);
      schrift(doc, 6);
      doc.text(doc.splitTextToSize("· " + (k.untertitel || ""), b - tb - 8)[0], x + 4.5 + tb, yy + 5.5);
      if (z.leer) { return; }
      tinte(doc, C.tinte);
      schrift(doc, 14, "bold");
      doc.text(z.aktuell, x + 3, yy + 13.5);
      var w = doc.getTextWidth(z.aktuell);
      tinte(doc, C.zart);
      schrift(doc, 6);
      if (!k.rotation) { doc.text("Stand " + z.stand, x + 5 + w, yy + 13.5); }
      if (k.rotation) {
        zeichneRotationsLegende(doc, x + b - 3, yy + 13.5, k);
        zeichneRotationsChart(doc, x + 3, yy + 16.5, b - 6, 33, k, punkte);
      } else {
        zeichneVerlauf(doc, x + 3, yy + 16.5, b - 6, 33, punkte, {
          achsen: true, flaeche: true, format: k.format, art: "tag", monate: 3, maxPunkte: 160
        });
      }
      /* Trendzeile */
      var tx = x + 3;
      ["1M", "3M", "6M"].forEach(function (n, j) {
        var e = z.d[j];
        tinte(doc, C.zart);
        schrift(doc, 6);
        doc.text(n, tx, yy + 55.2);
        if (e) {
          tinte(doc, farbeFuerDiff(e.g));
          schrift(doc, 6.6, "bold");
          doc.text(e.text, tx + (e.g ? 8.2 : 6), yy + 55.2);
          dreieck(doc, tx + 6.2, yy + 54.2, e.g, 1.9);
        }
        tx += 27;
      });
    });
    return y + 2 * h + luecke + 6;
  }

  /* =========================================================================
     12. Regime
     ========================================================================= */

  function regimeAnordnung() {
    var L = window.REGIME_LOGIK;
    return L && L.daten && L.daten.D1 ? L.daten.D1 : [];
  }

  function zahl2(v) { return v.toFixed(2).replace(".", ","); }
  function delta2(v) {
    var g = Number(v.toFixed(2));
    var t = Math.abs(g).toFixed(2).replace(".", ",");
    return g > 0 ? "+" + t : g < 0 ? "-" + t : "±0,00";
  }

  function seitWann(reihe, feld) {
    var i = reihe.length - 1, reg = reihe[i][feld];
    while (i > 0 && reihe[i - 1][feld] === reg) { i--; }
    return { d: reihe[i].d, n: reihe.length - i };
  }

  function boxKopf(doc, x, y, b, h, titel, unter) {
    karte(doc, x, y, b, h);
    tinte(doc, C.tinte);
    schrift(doc, 6.4, "bold");
    doc.text(titel.toUpperCase(), x + 3, y + 5);
    if (unter) {
      tinte(doc, C.zart);
      schrift(doc, 5.6);
      doc.text(unter, x + 3, y + 8.6);
    }
  }

  function regimeKasten(doc, x, y, b, titel, regime, zeile1, zeile2, abweichung) {
    var L = window.REGIME_LOGIK;
    var akzent = REGIME_AKZENT[regime] || C.zart;
    var flaeche = REGIME_FARBE[regime] || C.karte;
    fuell(doc, flaeche);
    doc.roundedRect(x, y, b, 19, 1.8, 1.8, "F");
    fuell(doc, akzent);
    doc.rect(x, y + 1, 1.1, 17, "F");
    tinte(doc, C.matt);
    schrift(doc, 5.6, "bold");
    doc.text(titel.toUpperCase(), x + 4, y + 4.6);
    tinte(doc, C.tinte);
    schrift(doc, 11, "bold");
    doc.text(regime || "–", x + 4, y + 10.6);
    tinte(doc, C.matt);
    schrift(doc, 5.8);
    doc.text(zeile1, x + 4, y + 14.4);
    if (zeile2) {
      tinte(doc, abweichung ? C.schlecht : C.matt);
      doc.text(zeile2, x + 4, y + 17.4);
    }
  }

  function zeichneRegime(doc, y) {
    var M = window.MOTOR;
    var L = window.REGIME_LOGIK;
    var D1 = regimeAnordnung();
    zustand.bereich = "Regime";
    if (!D1.length) { return y; }
    var letzt = D1[D1.length - 1];

    y = abschnitt(doc, y - 1, "Regime");

    /* ZSK-Chart mit Baendern */
    var hChart = 64;
    boxKopf(doc, RAND, y, INHALT, hChart, "ZSK · 10Y – 2Y Spread · Tageschart D1, letzte 3 Monate",
      zahl2(letzt.sp) + " % · Stand " + isoKurz(letzt.d) + " · Hintergrund = 3-Handelstage-Regime");
    var punkteSp = D1.map(function (p) { return { d: p.d, v: p.sp, band: p.tag }; });
    zeichneVerlauf(doc, RAND + 3, y + 11, INHALT - 6, 41, punkteSp, {
      achsen: true, format: "faktor", art: "tag", monate: 3, maxPunkte: 200,
      bandKey: function (p) { return p.band; }, farbe: C.tinte, dick: 0.4, punktRadius: 0.8
    });
    /* Legende */
    var labels = ["Bull Steepener", "Bear Steepener", "Bull Flattener", "Bear Flattener", "Steepenertwist", "Neutral"];
    var spalte = (INHALT - 6) / 3;
    labels.forEach(function (label, i) {
      var lx = RAND + 3 + (i % 3) * spalte;
      var ly = y + 55.8 + Math.floor(i / 3) * 4.2;
      fuell(doc, REGIME_FARBE[label]);
      stift(doc, C.linieDunkel);
      doc.setLineWidth(0.1);
      doc.rect(lx, ly - 2.3, 2.8, 2.8, "FD");
      tinte(doc, C.matt);
      schrift(doc, 5.6);
      var q = L.stammdaten[label] && L.stammdaten[label].quadrant !== "–" ? " · " + L.stammdaten[label].quadrant.split(":")[0] : "";
      doc.text(label + q, lx + 4, ly);
    });
    y += hChart + 3;

    /* US02Y und US10Y */
    var halbB = (INHALT - 3) / 2;
    [["US02Y · 2-jährige Rendite", "y2"], ["US10Y · 10-jährige Rendite", "y10"]].forEach(function (cfg, i) {
      var x = RAND + i * (halbB + 3);
      boxKopf(doc, x, y, halbB, 38, cfg[0], zahl2(letzt[cfg[1]]) + " % · Stand " + isoKurz(letzt.d));
      var pts = D1.map(function (p) { return { d: p.d, v: p[cfg[1]] }; });
      zeichneVerlauf(doc, x + 3, y + 11, halbB - 6, 24, pts, {
        achsen: true, format: "faktor", art: "tag", monate: 3, maxPunkte: 160, farbe: C.tinte, dick: 0.35
      });
    });
    y += 41;

    /* Renditen-Tabelle */
    var zeilen = D1.slice(-11).reverse();
    var zh = 5;
    var hTab = 15 + zeilen.length * zh + 2;
    y = platzPruefen(doc, y, hTab);
    boxKopf(doc, RAND, y, INHALT, hTab, "Renditen, Veränderung und Regime",
      "Veränderung jeweils gegenüber 20 Handelstage davor (IPDA-Zyklus). Punkt rechts: stimmt das IPDA-Regime mit dem 3-Handelstage-Regime überein?");
    var sx = { dat: RAND + 3, y2: RAND + 48, y10: RAND + 64, sp: RAND + 82, dsp: RAND + 102, d10: RAND + 120, d2: RAND + 138, reg: RAND + 144, dot: RAND + INHALT - 4 };
    var ty = y + 13.5;
    tinte(doc, C.tinte);
    schrift(doc, 5.8, "bold");
    doc.text("Datum", sx.dat, ty);
    doc.text("2Y", sx.y2, ty, { align: "right" });
    doc.text("10Y", sx.y10, ty, { align: "right" });
    doc.text("10Y–2Y", sx.sp, ty, { align: "right" });
    doc.text("Änd. Spread", sx.dsp, ty, { align: "right" });
    doc.text("Änd. 10Y", sx.d10, ty, { align: "right" });
    doc.text("Änd. 2Y", sx.d2, ty, { align: "right" });
    doc.text("IPDA-Regime", sx.reg, ty);
    haarlinie(doc, RAND + 2, ty + 1.6, RAND + INHALT - 2, C.linieDunkel, 0.25);
    var ry = ty + 1.6;
    zeilen.forEach(function (r) {
      var m = ry + zh / 2 + 0.9;
      tinte(doc, C.tinte);
      schrift(doc, 6.2);
      doc.text(isoKurz(r.d), sx.dat, m);
      doc.text(zahl2(r.y2), sx.y2, m, { align: "right" });
      doc.text(zahl2(r.y10), sx.y10, m, { align: "right" });
      doc.text(zahl2(r.sp), sx.sp, m, { align: "right" });
      if (r.di) {
        [[sx.dsp, r.di.sp], [sx.d10, r.di.y10], [sx.d2, r.di.y2]].forEach(function (e) {
          tinte(doc, farbeFuerDiff(Number(e[1].toFixed(2))));
          doc.text(delta2(e[1]), e[0], m, { align: "right" });
        });
        var f = REGIME_FARBE[r.ipda] || C.karte;
        fuell(doc, f);
        doc.roundedRect(sx.reg, ry + 0.8, 24, zh - 1.6, 0.8, 0.8, "F");
        tinte(doc, C.tinte);
        schrift(doc, 5.6, "bold");
        doc.text(r.ipda || "–", sx.reg + 1.5, m - 0.2);
        fuell(doc, r.ipda === r.tag ? C.gut : C.schlecht);
        doc.circle(sx.dot, ry + zh / 2, 0.9, "F");
      }
      haarlinie(doc, RAND + 2, ry + zh, RAND + INHALT - 2, C.linie, 0.12);
      ry += zh;
    });
    y += hTab + 3;

    /* IPDA- und 3-Tage-Regime */
    y = platzPruefen(doc, y, 22);
    var sI = seitWann(D1, "ipda"), sT = seitWann(D1, "tag");
    var qI = L.stammdaten[letzt.ipda] ? L.stammdaten[letzt.ipda].quadrant : "";
    var qT = L.stammdaten[letzt.tag] ? L.stammdaten[letzt.tag].quadrant : "";
    var gleich = letzt.ipda === letzt.tag;
    regimeKasten(doc, RAND, y, halbB, "IPDA-Regime · " + L.fensterIpda + " Handelstage", letzt.ipda,
      qI + " · seit " + isoKurz(sI.d) + " (" + sI.n + " Handelstage)",
      gleich ? "stimmt mit dem " + L.fensterTag + "-Handelstage-Regime überein"
             : "weicht ab: " + L.fensterTag + "-Handelstage-Regime ist " + letzt.tag, !gleich);
    regimeKasten(doc, RAND + halbB + 3, y, halbB, "Regime · " + L.fensterTag + " Handelstage", letzt.tag,
      (qT && qT !== "–" ? qT + " · " : "– · ") + "seit " + isoKurz(sT.d) + " (" + sT.n + " Handelstage)", "", false);
    y += 22;

    /* Core Setups des aktuellen IPDA-Regimes */
    var qi = REGIME_INDEX[letzt.ipda];
    var core = L.core;
    if (qi === undefined || !core) {
      y = platzPruefen(doc, y, 14);
      karte(doc, RAND, y, INHALT, 12);
      tinte(doc, C.matt);
      schrift(doc, 6.4, "bold");
      doc.text("CORE SETUPS", RAND + 3, y + 5);
      schrift(doc, 6);
      doc.text("Für das aktuelle IPDA-Regime (" + (letzt.ipda || "–") + ") gibt es keine Core-Setups-Spalte.", RAND + 3, y + 9);
      return y + 14;
    }
    var lang = core.long[qi] || [], kurz = core.short[qi] || [];
    var zeilenN = Math.max(lang.length, kurz.length);
    var ch = 4.4;
    var hCore = 17 + zeilenN * ch + 2;
    y = platzPruefen(doc, y, hCore);
    boxKopf(doc, RAND, y, INHALT, hCore, "Core Setups · " + L.stammdaten[letzt.ipda].quadrant + " (" + letzt.ipda + ")",
      "Sharp Ratio je Paar aus der Core-Setups-Tabelle der Regime-Seite. Nachschlage-Daten, keine Empfehlung. Fett = im Original hervorgehoben.");
    [["LONG", lang], ["SHORT", kurz]].forEach(function (blk, i) {
      var bx = RAND + 3 + i * (halbB + 3 - 0.0);
      var bb = halbB - 6;
      tinte(doc, C.akzent);
      schrift(doc, 6, "bold");
      doc.text(blk[0], bx, y + 14.2);
      var cy = y + 15.4;
      blk[1].forEach(function (e) {
        if (e[2]) {
          fuell(doc, C.akzentFlaeche);
          doc.rect(bx - 0.5, cy, bb + 1, ch, "F");
        }
        tinte(doc, C.tinte);
        schrift(doc, 6.6, e[2] ? "bold" : "normal");
        doc.text(e[0], bx + 1, cy + 3.1);
        doc.text(e[1].toFixed(1).replace(".", ","), bx + bb - 1, cy + 3.1, { align: "right" });
        haarlinie(doc, bx - 0.5, cy + ch, bx + bb + 0.5, C.linie, 0.12);
        cy += ch;
      });
    });
    return y + hCore + 4;
  }

  /* =========================================================================
     13. Ablauf
     ========================================================================= */

  async function ladeAlleBereiche(knopf) {
    function schritt(name) { knopf.textContent = "Lade " + name + " …"; }

    var ahe = { schluessel: "CES0500000003", quelle: "fred", titel: "Average Hourly Earnings", format: "prozent", einheitFest: "% MoM" };

    schritt("Arbeitsmarkt");
    await ladeDateien(["daten/arbeitsmarkt.js", "daten/webquellen.js", "bereiche/arbeitsmarkt-kacheln.js"]);
    bereichBerechnen("arbeit", "Arbeitsmarkt", kacheln(["PAYEMS", "UNRATE", ahe, "JTSJOR", "JTSHIR", "JTSTSR", "JTSQUR",
      "ISM_MFG_EMP", "ISM_SVC_EMP", "ECIALLCIV", "CHALLENGER", "ICSA"]));

    schritt("Inflation");
    await ladeDateien(["daten/inflation.js", "daten/webquellen.js", "daten/arbeitsmarkt.js",
      "daten/cpi-kategorien.js", "bereiche/inflation-kacheln.js"]);
    bereichBerechnen("infl", "Inflation", kacheln(["CPIAUCSL", "CPILFESL", "PPIFIS", "PPIFES", "ISM_MFG_PRICE",
      "ISM_SVC_PRICE", "GSCPI", "DCOILBRENTEU", "M2SL", "T5YIE", "T5YIFR", "MICH", "ECIALLCIV"]));

    schritt("Wachstum");
    await ladeDateien(["daten/wachstum.js", "daten/webquellen.js", "bereiche/wachstum-kacheln.js"]);
    bereichBerechnen("wachs", "Wachstum", kacheln(["A191RL1Q225SBEA", "GDPNOW", "ISM_MFG_NO", "ISM_MFG_BACKLOG",
      "ISM_SVC_BUSACT", "DGORDER", "DG_ORDER_SHIP", "CB_CCI", "MICH_ICE", "NFIB", "PERMIT", "MORTGAGE30US", "OECD_CLI"]));

    schritt("Zinsen");
    await ladeDateien(["daten/zinsen.js", "daten/regime.js", "bereiche/zinsen-kacheln.js"]);
    bereichBerechnen("zins", "Zinsen", kacheln(["FED_LEITZINS", "DFII10", "T10YIE"]));

    schritt("Plumbing");
    await ladeDateien(["daten/plumbing.js", "daten/zinsen.js", "stress-score.js", "bereiche/plumbing-kacheln.js"]);
    bereichBerechnen("plumb", "Plumbing", kacheln(["VIXCLS", "BAMLH0A0HYM2", "SOFR_RATE", "SOFR_VOLUME",
      "RPONTSYD", "RRPONTSYD", "STLFSI4"]));

    schritt("Regime");
    await ladeDateien(["daten/regime.js", "regime-ansicht.js", "bereiche/regime-kacheln.js"]);
    return kacheln(["XLY_XLP", "IYT_XLU", "HYG_TLT", "VUG_VTV"]);
  }

  async function erzeugeReport(knopf, optionen) {
    optionen = optionen || {};
    var textVorher = knopf.textContent;
    knopf.disabled = true;
    try {
      var jsPDF = window.jspdf && window.jspdf.jsPDF;
      if (!jsPDF) { throw new Error("PDF-Bibliothek (jsPDF) konnte nicht geladen werden – Internetverbindung prüfen."); }
      laufStempel = String(Date.now());
      BEREICHE = {};

      var rotation = await ladeAlleBereiche(knopf);

      knopf.textContent = "Baue PDF …";
      var doc = new jsPDF({ unit: "mm", format: "a4" });
      doc.setFont("helvetica", "normal");
      schriftSicherMachen(doc);
      seitenGrund(doc);

      var y = zeichneTitelkopf(doc);
      zustand.bereich = "";
      y = zeichneFist(doc, y);

      y = zeichneTabelle(doc, y, "arbeit", true);
      y = zeichneTabelle(doc, y, "infl", true);
      y = zeichneTabelle(doc, y, "wachs", true);
      y = zeichneTabelle(doc, y, "zins", true);
      y = heatLegende(doc, y);
      y = zeichneUebersicht(doc, y + 4);

      /* Plumbing und Kapitalrotation auf eigener Seite */
      zustand.bereich = "Plumbing";
      y = neueSeite(doc);
      y = zeichneBarometer(doc, y);
      y = zeichneTabelle(doc, y, "plumb", false);
      y = zeichneKapitalrotation(doc, y + 2, rotation);

      /* Regime auf eigener Seite */
      zustand.bereich = "Regime";
      y = neueSeite(doc);
      zeichneRegime(doc, y);

      zeichneFuesse(doc);
      if (optionen.alsDokument) { return doc; }
      doc.save("MakroReport-" + new Date().toISOString().slice(0, 10) + ".pdf");
    } catch (fehler) {
      if (optionen.alsDokument) { throw fehler; }
      window.alert("PDF konnte nicht erzeugt werden.\n\n" + fehler.message);
    } finally {
      aufraeumen();
      knopf.disabled = false;
      knopf.textContent = textVorher;
    }
  }

  /* Direkt aufrufbar (Testlauf ohne Klick): erzeuge(knopf, {alsDokument:true})
     liefert das jsPDF-Objekt statt zu speichern. */
  window.MAKRO_REPORT = {
    erzeuge: function (knopf, optionen) {
      return erzeugeReport(knopf || { textContent: "", disabled: false }, optionen);
    }
  };

  document.addEventListener("DOMContentLoaded", function () {
    var knopf = document.getElementById("pdfKnopf");
    if (!knopf) { return; }
    knopf.addEventListener("click", function () { erzeugeReport(knopf); });
  });

})();
