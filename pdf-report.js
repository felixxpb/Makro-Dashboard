/* ===========================================================================
   Makro-Dashboard - PDF-Report ("MakroReport")
   Fassung vom 2026-09-27: Neuaufbau von Design und Gliederung nach Felix'
   Vorgaben. Dritte Fassung insgesamt - vorher: generische Kacheln-Tabelle
   (2026-09-20), danach "MakroReport" in dunkelbraun/gold mit drei Bereichen
   und leeren Fazit-Boxen zum Ausdrucken (2026-09-23).

   VORGABEN, auf denen dieser Aufbau beruht (Entscheidung Felix, 2026-09-27):
   - Reihenfolge nach FIST-Logik: Arbeitsmarkt, Inflation (+ Kategorienseite),
     Wachstum, Zinsen, Plumbing, Regime. Kein Deckblatt, kein Event-Kalender.
   - Je Bereich: wenige Kernzahlen gross mit Chart, alle weiteren Kennzahlen
     als kompakte Zeile mit Mini-Chart (Sparkline) und 1M/3M/6M-Trend.
   - Die grossen Charts haben kleine Achsenbeschriftungen (Wert rechts,
     Datum unten), damit sich die Lage einschaetzen laesst.
   - Zielgebrauch: digital lesen (PC und Handy), A4 Hochkant. Deshalb keine
     leeren Handschrift-Felder mehr, sondern je Bereich ein neutrales
     Datenfazit (reine Auszaehlung, keine Bewertung - CLAUDE.md Abschnitt 5).
   - Optik hell und minimalistisch: weisse Seite, Haarlinien, eine
     Akzentfarbe. Farbe traegt nur Bedeutung bei Trendvorzeichen (gruen/rot)
     und bei den Regime-Baendern.

   Funktionsweise: Fuer jeden Bereich werden die gleichen Datendateien und die
   zugehoerige bereiche/*-kacheln.js nachgeladen wie auf der jeweiligen
   Unterseite. Das setzt window.KACHELN / window.GRUPPEN / window.QUELLEN neu.
   Alle Werte werden mit genau den Funktionen berechnet, die auch die Kacheln
   benutzen (window.MOTOR in motor.js), die Regime-Einstufung kommt aus
   window.REGIME_LOGIK (regime-ansicht.js). Keine zweite Rechenlogik, also nie
   ein Unterschied zwischen Website und Report.

   Charts werden als echte PDF-Vektoren gezeichnet (nicht mehr als PNG aus
   einem Canvas): bleiben beim Zoomen scharf, auch die Achsentexte, und die
   Datei bleibt klein. Lange Tagesreihen werden vorher verdichtet, dabei
   bleiben Hoch- und Tiefpunkte je Abschnitt erhalten.

   Voraussetzung: motor.js ist auf index.html eingebunden (nur zur
   Berechnung, baut auf dieser Seite keine Kacheln, siehe Schutz in motor.js).
   =========================================================================== */

(function () {
  "use strict";

  /* =========================================================================
     1. Gestaltung: Farben, Masse, Schriftgroessen
     ========================================================================= */

  var C = {
    papier:     [255, 255, 255],
    tinte:      [26, 26, 26],     // Haupttext, Zahlen
    matt:       [108, 108, 108],  // Untertitel, Labels
    zart:       [152, 152, 152],  // Achsen, Fussnoten
    linie:      [214, 214, 214],  // Haarlinien
    raster:     [234, 234, 234],  // Gitterlinien im Chart
    akzent:     [47, 93, 140],    // Chartlinie, Bereichsmarke
    akzentFlaeche: [226, 234, 243],
    bandNull:   [198, 198, 198],  // Nulllinie im Chart
    fazitFlaeche: [247, 247, 245],
    gut:        [27, 122, 74],
    schlecht:   [172, 44, 36]
  };

  /* Regime-Baender: helle Toene, damit die Chartlinie darueber lesbar bleibt.
     Zuordnung Regime -> Quadrant kommt aus window.REGIME_LOGIK.stammdaten. */
  var REGIME_FARBE = {
    "Bull Steepener": [252, 242, 222],
    "Bear Steepener": [228, 242, 231],
    "Bull Flattener": [252, 235, 226],
    "Bear Flattener": [247, 224, 224],
    "Steepenertwist": [240, 240, 240],
    "Flattenertwist": [240, 240, 240],
    "Neutral":        [245, 245, 245]
  };

  var SEITE_B = 210, SEITE_H = 297;
  var RAND = 16;
  var INHALT = SEITE_B - RAND * 2;
  var UNTERKANTE = SEITE_H - 20;   // darunter beginnt der Fussbereich

  /* Spalten der Kennzahlen-Liste, gemessen von links (mm) */
  var SP = {
    name:     RAND,
    nameB:    58,
    spark:    RAND + 62,
    sparkB:   28,
    aktuell:  RAND + 112,   // rechtsbuendig
    m1:       RAND + 136,   // rechtsbuendig
    m3:       RAND + 157,
    m6:       RAND + 178
  };

  var zustand = { bereich: "", kw: "", erzeugt: "" };

  /* =========================================================================
     2. Skripte nachladen (gleiches Muster wie die Bereichs-Unterseiten)
     ========================================================================= */

  var geladeneTags = [];

  /* Zeitstempel je Report-Lauf. Er haengt an jeder nachgeladenen Datei als
     ?v=... - damit holt der Browser die daten/*.js IMMER neu vom Server und
     nimmt nie eine alte Fassung aus dem Cache (Vorgabe Felix, 2026-09-27:
     "immer die aktuellen und frisch aktualisierten Daten"). Die Dateien
     selbst werden zweimal taeglich per GitHub Actions erneuert, siehe
     README Abschnitt 8b. */
  var laufStempel = "";

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

  function kacheln(schluessel) {
    return schluessel.map(findeKachel).filter(Boolean);
  }

  /* =========================================================================
     3. Datum und Kalenderwoche
     ========================================================================= */

  function montagDerWoche(datum) {
    var d = new Date(datum);
    var tag = d.getDay();               // 0 = Sonntag
    var diff = tag === 0 ? -6 : 1 - tag;
    d.setDate(d.getDate() + diff);
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

  /* Welche Woche der Report abdeckt (Vorgabe Felix, 2026-09-27):
     Die Handelswoche geht Montag bis Freitag. Ab Samstag 0 Uhr zeigt der
     Report bereits die KOMMENDE Woche - wer ihn am Wochenende baut, plant
     damit die Woche, die vor ihm liegt, nicht die abgelaufene.
     Montag bis Freitag zeigt er die laufende Woche.                       */
  function berichtsWoche(heute) {
    var wochentag = heute.getDay();            // 0 = Sonntag, 6 = Samstag
    var montag = montagDerWoche(heute);
    if (wochentag === 6 || wochentag === 0) {  // Samstag oder Sonntag
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

  /* Die jsPDF-Kernschriften koennen nur WinAnsi. Zeichen, die motor.js und
     die Regime-Logik verwenden, aber dort fehlen, wuerden als " erscheinen -
     deshalb werden sie beim Schreiben ersetzt. Gepruefte Faelle:
       U+2212 Minuszeichen (aus veraenderungText)  -> normaler Bindestrich
       U+0394 Delta                                -> "d "
     Umlaute, en-dash (–), Mittelpunkt (·) und ± sind in WinAnsi enthalten
     und bleiben unveraendert. */
  function sicher(t) {
    if (Array.isArray(t)) { return t.map(sicher); }
    if (typeof t !== "string") { return t; }
    return t.replace(/−/g, "-").replace(/Δ/g, "d ");
  }

  /* Einmal pro Dokument: doc.text so umhuellen, dass jeder Text durch
     sicher() laeuft. So kann keine Stelle im Code das vergessen. */
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

  function seitenGrund(doc) {
    fuell(doc, C.papier);
    doc.rect(0, 0, SEITE_B, SEITE_H, "F");
  }

  /* Kleines Dreieck statt Pfeilzeichen: Unicode-Pfeile sind in den
     jsPDF-Kernschriften nicht zuverlaessig vorhanden. */
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
     5. Seitenkopf, Seitenfuss, Umbruch
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

    tinte(doc, C.tinte);
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
    doc.text("Makro-Wochenreport · FIST-Analyseprozess · Arbeitsmarkt, Inflation, Wachstum, Zinsen, Plumbing, Regime",
      RAND, 35);

    return 44;
  }

  function zeichneLaufkopf(doc) {
    tinte(doc, C.zart);
    schrift(doc, 6.5);
    doc.text("MakroReport · " + zustand.kw, RAND, 12);
    if (zustand.bereich) {
      doc.text(zustand.bereich, SEITE_B - RAND, 12, { align: "right" });
    }
    haarlinie(doc, RAND, 14.5, RAND + INHALT);
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

  /* Fuesse erst am Ende, weil die Gesamtseitenzahl vorher nicht bekannt ist. */
  function zeichneFuesse(doc) {
    var n = doc.getNumberOfPages();
    for (var i = 1; i <= n; i++) {
      doc.setPage(i);
      haarlinie(doc, RAND, SEITE_H - 15, RAND + INHALT);
      tinte(doc, C.zart);
      schrift(doc, 6);
      doc.text("Makro-Dashboard · " + zustand.erzeugt + " · Daten wie auf der Website (gleiche Rechenlogik)",
        RAND, SEITE_H - 11);
      doc.text("Seite " + i + " von " + n, SEITE_B - RAND, SEITE_H - 11, { align: "right" });
    }
  }

  function zeichneBereichsKopf(doc, y, titel, unterzeile) {
    zustand.bereich = titel;
    fuell(doc, C.akzent);
    doc.rect(RAND, y, 14, 0.8, "F");
    tinte(doc, C.tinte);
    schrift(doc, 15, "bold");
    doc.text(titel, RAND, y + 8);
    if (unterzeile) {
      tinte(doc, C.matt);
      schrift(doc, 7);
      doc.text(unterzeile, RAND, y + 13);
      return y + 19;
    }
    return y + 14;
  }

  /* =========================================================================
     6. Chart (Vektor) mit optionalen Achsen und Regime-Baendern
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

  /* Zeitfenster eines Charts: entweder in Monaten (opt.monate) oder in
     Jahren (opt.jahre, Standard 3). */
  function zeitfenster(punkte, opt) {
    if (opt.monate) { return letzteNMonate(punkte, opt.monate); }
    return letzteNJahre(punkte, opt.jahre || 3);
  }

  /* Verdichtet lange Reihen, behaelt dabei je Abschnitt Hoch- und Tiefpunkt -
     so verschwinden Spitzen (z. B. im VIX) nicht aus dem Bild. */
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

  /* opt:
       achsen     true  -> Wertachse rechts (Max/Mitte/Min) + Datumsachse unten
       flaeche    true  -> zarte Flaeche unter der Linie
       format,einheit,art  -> nur fuer die Achsentexte
       bandKey(p) -> Schluessel fuer Regime-Baender (oder null)
       maxPunkte  -> Verdichtungsgrenze                                      */
  function zeichneVerlauf(doc, x, y, breite, hoehe, punkte, opt) {
    opt = opt || {};
    var M = window.MOTOR;
    var achsenBreite = opt.achsen ? 13 : 0;
    var datumHoehe = opt.achsen ? 4.5 : 0;
    var plotB = breite - achsenBreite;
    var plotH = hoehe - datumHoehe;

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

    /* Regime-Baender zuerst, damit alles andere darueber liegt */
    if (opt.bandKey) {
      var start = 0;
      for (var i = 1; i <= teil.length; i++) {
        var jetzt = i < teil.length ? opt.bandKey(teil[i]) : " ";
        if (jetzt === opt.bandKey(teil[start])) { continue; }
        var label = opt.bandKey(teil[start]);
        var farbe = label && REGIME_FARBE[label];
        if (farbe) {
          var xa = px(start), xb = px(i - 1);
          fuell(doc, farbe);
          doc.rect(xa, y, Math.max(0.25, xb - xa), plotH, "F");
        }
        start = i;
      }
    }

    /* Gitter und Wertachse */
    if (opt.achsen) {
      var stufen = [max, (max + min) / 2, min];
      stufen.forEach(function (w) {
        haarlinie(doc, x, py(w), x + plotB, C.raster);
        tinte(doc, C.zart);
        schrift(doc, 5);
        doc.text(M.zahl(w, opt.format), x + plotB + 1.5, py(w) + 1.2);
      });
    }

    /* Nulllinie nur, wenn sie im Bild liegt */
    if (unten < 0 && oben > 0) {
      haarlinie(doc, x, py(0), x + plotB, C.bandNull, 0.2);
    }

    /* Flaeche und Linie */
    var seg = [];
    for (var s = 1; s < teil.length; s++) {
      seg.push([px(s) - px(s - 1), py(teil[s].v) - py(teil[s - 1].v)]);
    }

    if (opt.flaeche) {
      var basis = y + plotH;
      var fseg = seg.slice();
      fseg.push([0, basis - py(teil[teil.length - 1].v)]);
      fseg.push([px(0) - px(teil.length - 1), 0]);
      fuell(doc, C.akzentFlaeche);
      doc.lines(fseg, px(0), py(teil[0].v), [1, 1], "F", true);
    }

    stift(doc, C.akzent);
    doc.setLineWidth(opt.dick || 0.35);
    doc.setLineJoin("round");
    doc.setLineCap("round");
    doc.lines(seg, px(0), py(teil[0].v), [1, 1], "S", false);

    /* Letzter Punkt */
    var letzt = teil[teil.length - 1];
    fuell(doc, C.akzent);
    doc.circle(px(teil.length - 1), py(letzt.v), opt.achsen ? 0.7 : 0.45, "F");

    /* Datumsachse */
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
     7. Trendwerte (ueber window.MOTOR, keine eigene Rechnung)
     ========================================================================= */

  /* Wichtig: Farbe und Pfeil richten sich nach dem GERUNDETEN Wert. Sonst
     steht bei einer Veraenderung von 0,004 die Anzeige "±0,0" mit gruenem
     Pfeil daneben - das hat der erste Testlauf gezeigt. */
  function trend(k, punkte, letzter, n) {
    var M = window.MOTOR;
    var punkt = M.trendVergleichspunkt(punkte, n);
    if (!punkt) { return null; }
    var diff = letzter.v - punkt.v;
    return { punkt: punkt, diff: diff, g: M.gerundet(diff, k.format) };
  }

  /* =========================================================================
     8. Kernzahl-Block (Chart gross mit Achsen)
     ========================================================================= */

  var KERN_HOEHE = 64;

  function zeichneKernzahl(doc, x, y, breite, k) {
    var M = window.MOTOR;
    var punkte = M.punkteVon(k);
    var art = M.frequenzArt(k);
    var einheit = M.einheitVon(k) || "";

    tinte(doc, C.tinte);
    schrift(doc, 8.2, "bold");
    doc.text(doc.splitTextToSize(k.titel, breite)[0], x, y + 3);

    if (!punkte.length) {
      tinte(doc, C.zart);
      schrift(doc, 7);
      doc.text("keine Daten", x, y + 12);
      return;
    }

    var letzter = punkte[punkte.length - 1];

    tinte(doc, C.tinte);
    schrift(doc, 15, "bold");
    var wertText = M.zahl(letzter.v, k.format);
    doc.text(wertText, x, y + 12.5);
    var wertBreite = doc.getTextWidth(wertText);
    tinte(doc, C.matt);
    schrift(doc, 6.5);
    if (einheit) { doc.text(einheit, x + wertBreite + 1.2, y + 12.5); }
    doc.text("Stand " + M.datumText(letzter.d, art), x, y + 17);

    zeichneVerlauf(doc, x, y + 20, breite, 29, punkte, {
      achsen: true, flaeche: true, format: k.format, art: art, maxPunkte: 200
    });

    /* Trendzeile 1M / 3M / 6M */
    var zellB = breite / 3;
    var yL = y + 54, yW = y + 58.5;
    haarlinie(doc, x, y + 50.5, x + breite);
    [1, 3, 6].forEach(function (n, i) {
      var zx = x + i * zellB;
      tinte(doc, C.matt);
      schrift(doc, 5);
      doc.text(n + "M", zx, yL);
      var t = trend(k, punkte, letzter, n);
      if (!t) {
        tinte(doc, C.zart);
        schrift(doc, 7);
        doc.text("–", zx, yW);
        return;
      }
      tinte(doc, farbeFuerDiff(t.g));
      schrift(doc, 7.2, "bold");
      doc.text(M.veraenderungText(t.diff, k.format), zx + (t.g ? 2.8 : 0), yW);
      dreieck(doc, zx + 1.1, yW - 1.1, t.g, 2.2);
      tinte(doc, C.zart);
      schrift(doc, 4.8);
      doc.text("vs " + M.datumText(t.punkt.d, art), zx, yW + 3.2);
    });
  }

  function zeichneKernzeile(doc, y, kachelListe) {
    var liste = kachelListe.filter(Boolean);
    if (!liste.length) { return y; }
    y = platzPruefen(doc, y, KERN_HOEHE + 4);
    var luecke = 7;
    var breite = (INHALT - luecke * (liste.length - 1)) / liste.length;
    liste.forEach(function (k, i) {
      zeichneKernzahl(doc, RAND + i * (breite + luecke), y, breite, k);
    });
    return y + KERN_HOEHE + 5;
  }

  /* =========================================================================
     9. Kennzahlen-Liste (Sparkline + Aktuell + 1M/3M/6M)
     ========================================================================= */

  var ZEILE_H = 9.2;

  function listenKopf(doc, y, titel) {
    tinte(doc, C.matt);
    schrift(doc, 6.2, "bold");
    /* Auf Spaltenbreite kuerzen, sonst laeuft ein langer Titel in die
       Spalte "VERLAUF 3 JAHRE" hinein (im ersten Testlauf passiert). */
    doc.text(doc.splitTextToSize((titel || "Weitere Kennzahlen").toUpperCase(), SP.nameB)[0], SP.name, y);
    doc.text("VERLAUF 3 JAHRE", SP.spark, y);
    schrift(doc, 6.2, "bold");
    doc.text("AKTUELL", SP.aktuell, y, { align: "right" });
    doc.text("1M", SP.m1, y, { align: "right" });
    doc.text("3M", SP.m3, y, { align: "right" });
    doc.text("6M", SP.m6, y, { align: "right" });
    haarlinie(doc, RAND, y + 1.8, RAND + INHALT, C.tinte, 0.25);
    return y + 1.8;
  }

  function listenZeile(doc, y, k) {
    var M = window.MOTOR;
    var punkte = M.punkteVon(k);
    var art = M.frequenzArt(k);
    var einheit = M.einheitVon(k) || "";
    var mitte = y + ZEILE_H / 2;

    tinte(doc, C.tinte);
    schrift(doc, 7.2);
    doc.text(doc.splitTextToSize(k.titel, SP.nameB)[0], SP.name, mitte + 0.5);

    if (!punkte.length) {
      tinte(doc, C.zart);
      schrift(doc, 6.5);
      doc.text("keine Daten", SP.spark, mitte + 0.5);
      haarlinie(doc, RAND, y + ZEILE_H, RAND + INHALT, C.raster);
      return y + ZEILE_H;
    }

    zeichneVerlauf(doc, SP.spark, y + 1.8, SP.sparkB, ZEILE_H - 3.6, punkte, { maxPunkte: 90, dick: 0.25 });

    var letzter = punkte[punkte.length - 1];
    tinte(doc, C.tinte);
    schrift(doc, 7.4, "bold");
    doc.text(M.zahl(letzter.v, k.format), SP.aktuell, mitte + 0.5, { align: "right" });
    tinte(doc, C.zart);
    schrift(doc, 4.8);
    doc.text((einheit ? einheit + " · " : "") + M.datumText(letzter.d, art), SP.aktuell, mitte + 3.6, { align: "right" });

    [[1, SP.m1], [3, SP.m3], [6, SP.m6]].forEach(function (paar) {
      var t = trend(k, punkte, letzter, paar[0]);
      if (!t) {
        tinte(doc, C.zart);
        schrift(doc, 7);
        doc.text("–", paar[1], mitte + 0.5, { align: "right" });
        return;
      }
      tinte(doc, farbeFuerDiff(t.g));
      schrift(doc, 7);
      doc.text(M.veraenderungText(t.diff, k.format), paar[1], mitte + 0.5, { align: "right" });
      var textB = doc.getTextWidth(M.veraenderungText(t.diff, k.format));
      dreieck(doc, paar[1] - textB - 1.8, mitte - 0.6, t.g, 2);
    });

    haarlinie(doc, RAND, y + ZEILE_H, RAND + INHALT, C.raster);
    return y + ZEILE_H;
  }

  function zeichneListe(doc, y, titel, kachelListe) {
    var liste = kachelListe.filter(Boolean);
    if (!liste.length) { return y; }
    y = platzPruefen(doc, y, 6 + ZEILE_H * 2);
    y = listenKopf(doc, y, titel) + 2;
    liste.forEach(function (k) {
      var vorher = y;
      y = platzPruefen(doc, y, ZEILE_H);
      /* Seitenumbruch mitten in der Liste: Kopfzeile auf der neuen Seite
         wiederholen, sonst stehen die Zahlen ohne Spaltenbeschriftung da. */
      if (y < vorher) { y = listenKopf(doc, y + 2, titel + " (Fortsetzung)") + 2; }
      y = listenZeile(doc, y, k);
    });
    return y + 4;
  }

  /* =========================================================================
     10. Datenfazit (reine Auszaehlung, keine Bewertung)
     ========================================================================= */

  function zeichneDatenfazit(doc, y, kachelListe) {
    var M = window.MOTOR;
    var liste = kachelListe.filter(Boolean);
    if (!liste.length) { return y; }

    var hoch = 0, tief = 0, gleich = 0, ohne = 0, jungstes = null;
    liste.forEach(function (k) {
      var punkte = M.punkteVon(k);
      if (!punkte.length) { ohne++; return; }
      var letzter = punkte[punkte.length - 1];
      if (!jungstes || letzter.d > jungstes) { jungstes = letzter.d; }
      var t = trend(k, punkte, letzter, 3);
      if (!t) { ohne++; return; }
      if (t.g > 0) { hoch++; } else if (t.g < 0) { tief++; } else { gleich++; }
    });

    var hoehe = 11;
    y = platzPruefen(doc, y, hoehe + 3);
    fuell(doc, C.fazitFlaeche);
    doc.rect(RAND, y, INHALT, hoehe, "F");
    fuell(doc, C.akzent);
    doc.rect(RAND, y, 0.8, hoehe, "F");

    tinte(doc, C.matt);
    schrift(doc, 5.6, "bold");
    doc.text("DATENFAZIT (AUSZÄHLUNG, KEINE BEWERTUNG)", RAND + 3.5, y + 4);
    tinte(doc, C.tinte);
    schrift(doc, 7.2);
    var teile = [];
    teile.push("3-Monats-Trend: " + hoch + " steigend, " + tief + " fallend, " + gleich + " unverändert");
    if (ohne) { teile.push(ohne + " ohne Vergleichswert"); }
    if (jungstes) { teile.push("jüngste Veröffentlichung " + isoKurz(jungstes)); }
    doc.text(teile.join("  ·  "), RAND + 3.5, y + 8.5);

    return y + hoehe + 6;
  }

  /* =========================================================================
     11. Inflation: CPI- und PPI-Kategorien
     ========================================================================= */

  function cpiKategorien() {
    var daten = window.CPI_KATEGORIEN_DATEN;
    if (!daten || !daten.monate || !daten.monate.length) { return null; }
    var letzter = daten.monate[daten.monate.length - 1];
    var zeilen = daten.kategorien
      .map(function (kat) { return { name: kat.name, wert: letzter.werte[kat.key] }; })
      .filter(function (z) { return z.wert !== undefined && z.wert !== null; })
      .sort(function (a, b) { return b.wert - a.wert; });
    return { stand: letzter.d, zeilen: zeilen };
  }

  function ppiKategorien() {
    var M = window.MOTOR;
    var ppi = findeKachel("PPIFIS");
    if (!ppi || !ppi.aufschluesselung || !ppi.aufschluesselung.kategorien) { return null; }
    var stand = null;
    var zeilen = ppi.aufschluesselung.kategorien.map(function (kat) {
      var k = { schluessel: kat.schluessel, quelle: "fred", format: "prozent", ableitung: "yoy", ableitungSchritt: 12 };
      var p = M.punkteVon(k);
      if (!p.length) { return { name: kat.name, wert: null }; }
      stand = p[p.length - 1].d;
      return { name: kat.name, wert: p[p.length - 1].v };
    }).filter(function (z) { return z.wert !== null; })
      .sort(function (a, b) { return b.wert - a.wert; });
    return { stand: stand, zeilen: zeilen };
  }

  /* Eine Spalte: Name, Balken um die Nulllinie, Wert. Der Balken macht die
     Rangfolge auf einen Blick lesbar, ohne dass man Zahlen vergleichen muss. */
  function zeichneKategorienSpalte(doc, x, y, breite, titel, daten) {
    var M = window.MOTOR;
    tinte(doc, C.tinte);
    schrift(doc, 9, "bold");
    doc.text(titel, x, y);
    if (!daten) {
      tinte(doc, C.zart);
      schrift(doc, 7);
      doc.text("keine Daten", x, y + 6);
      return y + 10;
    }
    tinte(doc, C.matt);
    schrift(doc, 6);
    doc.text("Veränderung zum Vorjahr, Stand " + M.datumText(daten.stand, "monat"), x, y + 4);
    haarlinie(doc, x, y + 6, x + breite, C.tinte, 0.25);

    var nameB = 40;
    var balkenX = x + nameB + 2;
    var balkenB = breite - nameB - 16;
    var werte = daten.zeilen.map(function (z) { return z.wert; });
    var minWert = Math.min.apply(null, werte);
    var maxWert = Math.max.apply(null, werte);

    /* Die Nulllinie sitzt dort, wo sie nach den echten Werten hingehoert:
       gibt es keine negativen Kategorien, steht sie links und die Balken
       nutzen die ganze Breite. Gibt es welche, wird der Platz im Verhaeltnis
       von groesstem Minus zu groesstem Plus geteilt - so bleibt kein
       halber Balkenbereich leer (erster Testlauf: Nulllinie starr mittig). */
    var negRaum = minWert < 0 ? Math.abs(minWert) / (Math.abs(minWert) + Math.max(maxWert, 0)) : 0;
    var nullX = balkenX + balkenB * negRaum;
    var spannePlus = (balkenB * (1 - negRaum)) || 1;
    var spanneMinus = (balkenB * negRaum) || 1;

    var yy = y + 10;
    daten.zeilen.forEach(function (z) {
      var laenge = z.wert >= 0
        ? (maxWert > 0 ? (z.wert / maxWert) * spannePlus : 0)
        : (Math.abs(z.wert) / Math.abs(minWert)) * spanneMinus;
      tinte(doc, C.tinte);
      schrift(doc, 6.4);
      doc.text(doc.splitTextToSize(z.name, nameB)[0], x, yy + 1.4);
      fuell(doc, z.wert >= 0 ? C.gut : C.schlecht);
      if (z.wert >= 0) { doc.rect(nullX, yy - 1.3, laenge, 2.6, "F"); }
      else { doc.rect(nullX - laenge, yy - 1.3, laenge, 2.6, "F"); }
      tinte(doc, farbeFuerDiff(z.wert));
      schrift(doc, 6.6, "bold");
      doc.text(M.zahl(z.wert, "prozent") + " %", x + breite, yy + 1.4, { align: "right" });
      yy += 6.6;
    });

    /* Nulllinie ueber die ganze Spaltenhoehe */
    stift(doc, C.linie);
    doc.setLineWidth(0.15);
    doc.line(nullX, y + 8, nullX, yy - 5);

    return yy + 2;
  }

  /* =========================================================================
     12. Zinsen: FOMC Dot Plot
     ========================================================================= */

  function zeichneDotPlot(doc, y) {
    var daten = window.ZINSEN_DATEN;
    var dp = daten && daten.dotplot;
    if (!dp || !dp.ziele || !dp.ziele.length) { return y; }

    y = platzPruefen(doc, y, 20);
    tinte(doc, C.tinte);
    schrift(doc, 8.5, "bold");
    doc.text("FED-Zinserwartung (FOMC Dot Plot, Median)", RAND, y);
    tinte(doc, C.matt);
    schrift(doc, 6);
    doc.text("Median-Projektion der FOMC-Mitglieder für den Fed Funds Rate am jeweiligen Jahresende. " +
      "Wird vierteljährlich komplett ersetzt, ist also keine fortlaufende Zeitreihe.", RAND, y + 4);
    haarlinie(doc, RAND, y + 6, RAND + INHALT, C.tinte, 0.25);

    var felder = dp.ziele.map(function (z) {
      return { label: String(z.jahr), wert: z.wert };
    });
    if (dp.langfristig !== null && dp.langfristig !== undefined) {
      felder.push({ label: "Langfristig", wert: dp.langfristig });
    }

    var luecke = 4;
    var breite = (INHALT - luecke * (felder.length - 1)) / felder.length;
    var yy = y + 9;
    felder.forEach(function (f, i) {
      var fx = RAND + i * (breite + luecke);
      fuell(doc, C.fazitFlaeche);
      doc.rect(fx, yy, breite, 13, "F");
      tinte(doc, C.matt);
      schrift(doc, 5.6);
      doc.text(f.label, fx + 2.5, yy + 4.5);
      tinte(doc, C.tinte);
      schrift(doc, 10, "bold");
      doc.text(window.MOTOR.zahl(f.wert, "faktor") + " %", fx + 2.5, yy + 10.5);
    });

    return yy + 13 + 6;
  }

  /* =========================================================================
     13. Regime: Chart mit Baendern, Einstufung, Legende
     ========================================================================= */

  function regimeReihe(tf) {
    var L = window.REGIME_LOGIK;
    if (!L || !L.daten || !L.daten[tf]) { return []; }
    return L.daten[tf];
  }

  /* Zwei Charts untereinander (Vorgabe Felix, 2026-09-27):
       oben  Tageschart D1, letzte 3 Monate
       unten Wochenchart W1, letzte 6 Monate
     Beide mit Regime-Baendern aus dem 3-Perioden-Regime der jeweiligen
     Zeitebene - auf W1 sind drei Perioden drei Wochen, die Baender werden
     dadurch von sich aus breiter. */
  function zeichneRegimeChart(doc, y) {
    if (!regimeReihe("D1").length) { return y; }

    tinte(doc, C.tinte);
    schrift(doc, 8.5, "bold");
    doc.text("Zinsstrukturkurve 10Y–2Y mit Regime-Verlauf", RAND, y);
    tinte(doc, C.matt);
    schrift(doc, 6);
    /* Umbrechen, sonst laeuft der Satz ueber den rechten Rand hinaus. */
    var hinweis = doc.splitTextToSize(
      "Spread selbst gerechnet (10Y minus 2Y). Hintergrundfarbe = eingestuftes 3-Perioden-Regime, " +
      "gleiche Logik wie auf der Regime-Seite.", INHALT);
    doc.text(hinweis, RAND, y + 4);

    var yy = y + 4 + hinweis.length * 2.6 + 4;

    [{ tf: "D1", monate: 3, titel: "Tageschart D1 · letzte 3 Monate", art: "tag", max: 220 },
     { tf: "W1", monate: 6, titel: "Wochenchart W1 · letzte 6 Monate", art: "woche", max: 220 }
    ].forEach(function (cfg) {
      var reihe = regimeReihe(cfg.tf);
      var punkte = reihe.map(function (p) { return { d: p.d, v: p.sp, band: p.tag }; });
      tinte(doc, C.matt);
      schrift(doc, 6.4, "bold");
      doc.text(cfg.titel, RAND, yy);
      zeichneVerlauf(doc, RAND, yy + 2.5, INHALT, 36, punkte, {
        achsen: true, format: "faktor", art: cfg.art, monate: cfg.monate, maxPunkte: cfg.max,
        bandKey: function (p) { return p.band; }
      });
      yy += 2.5 + 36 + 6;
    });

    /* Legende */
    var yL = yy;
    var L = window.REGIME_LOGIK;
    var labels = ["Bull Steepener", "Bear Steepener", "Bull Flattener", "Bear Flattener", "Steepenertwist", "Flattenertwist"];
    var spalte = INHALT / 3;
    labels.forEach(function (label, i) {
      var lx = RAND + (i % 3) * spalte;
      var ly = yL + Math.floor(i / 3) * 5;
      fuell(doc, REGIME_FARBE[label] || C.raster);
      doc.rect(lx, ly - 2.4, 3.2, 3.2, "F");
      stift(doc, C.linie);
      doc.setLineWidth(0.1);
      doc.rect(lx, ly - 2.4, 3.2, 3.2, "S");
      tinte(doc, C.matt);
      schrift(doc, 6);
      var quad = L && L.stammdaten[label] ? L.stammdaten[label].quadrant : "";
      doc.text(label + (quad ? " · " + quad : ""), lx + 4.5, ly);
    });

    return yL + 12;
  }

  function regimeKasten(doc, x, y, breite, titel, punkt, fensterIpda, fensterTag) {
    var L = window.REGIME_LOGIK;
    var hoehe = 33;
    fuell(doc, C.fazitFlaeche);
    doc.rect(x, y, breite, hoehe, "F");
    tinte(doc, C.matt);
    schrift(doc, 5.8, "bold");
    doc.text(titel.toUpperCase(), x + 3, y + 4.5);

    if (!punkt) {
      tinte(doc, C.zart);
      schrift(doc, 7);
      doc.text("keine Einstufung", x + 3, y + 11);
      return hoehe;
    }

    function block(yy, label, regime, delta) {
      tinte(doc, C.zart);
      schrift(doc, 5.2);
      doc.text(label, x + 3, yy);
      tinte(doc, C.tinte);
      schrift(doc, 8.5, "bold");
      doc.text(regime || "–", x + 3, yy + 5);
      var quad = regime && L.stammdaten[regime] ? L.stammdaten[regime].quadrant : "";
      if (quad) {
        var b = doc.getTextWidth(regime || "–");
        tinte(doc, C.matt);
        schrift(doc, 6);
        doc.text(quad, x + 4.5 + b, yy + 5);
      }
      if (delta) {
        tinte(doc, C.matt);
        schrift(doc, 5.4);
        doc.text("Veränderung seit " + isoKurz(delta.ab) + ":  2Y " + zeigDelta(delta.y2) +
          "  ·  10Y " + zeigDelta(delta.y10) + "  ·  Spread " + zeigDelta(delta.sp), x + 3, yy + 9);
      }
    }

    function zeigDelta(v) {
      if (v === null || v === undefined) { return "–"; }
      var s = Math.abs(v).toFixed(2).replace(".", ",");
      return (v > 0 ? "+" : v < 0 ? "-" : "±") + s;
    }

    block(y + 9.5, fensterTag + " Perioden (Tages-Regime)", punkt.tag, punkt.dt);
    block(y + 23, fensterIpda + " Perioden (IPDA-Regime)", punkt.ipda, punkt.di);
    return hoehe;
  }

  function zeichneRegimeKaesten(doc, y) {
    var L = window.REGIME_LOGIK;
    if (!L) { return y; }
    var d1 = regimeReihe("D1"), w1 = regimeReihe("W1");
    var letztD1 = d1.length ? d1[d1.length - 1] : null;
    var letztW1 = w1.length ? w1[w1.length - 1] : null;

    y = platzPruefen(doc, y, 34);
    var luecke = 6;
    var breite = (INHALT - luecke) / 2;
    var h1 = regimeKasten(doc, RAND, y, breite, "Tageschart D1 · Stand " + (letztD1 ? isoKurz(letztD1.d) : "–"),
      letztD1, L.fensterIpda, L.fensterTag);
    var h2 = regimeKasten(doc, RAND + breite + luecke, y, breite, "Wochenchart W1 · Stand " + (letztW1 ? isoKurz(letztW1.d) : "–"),
      letztW1, L.fensterIpda, L.fensterTag);
    return y + Math.max(h1, h2) + 6;
  }

  /* =========================================================================
     14. Die sechs Bereiche
     ========================================================================= */

  async function baueArbeitsmarkt(doc, y) {
    await ladeDateien(["daten/arbeitsmarkt.js", "daten/webquellen.js", "bereiche/arbeitsmarkt-kacheln.js"]);
    y = zeichneBereichsKopf(doc, y, "Arbeitsmarkt",
      "Wie stark ist der Arbeitsmarkt, und verliert er an Schwung? Harte Daten und Frühindikatoren.");

    var ahe = { schluessel: "CES0500000003", quelle: "fred", titel: "Average Hourly Earnings", format: "prozent", einheitFest: "% MoM" };
    var kern = [findeKachel("PAYEMS"), findeKachel("UNRATE"), ahe];
    y = zeichneKernzeile(doc, y, kern);

    var weitere = kacheln(["JTSJOR", "JTSHIR", "JTSTSR", "JTSQUR", "ISM_MFG_EMP", "ISM_SVC_EMP", "ECIALLCIV", "CHALLENGER", "ICSA"]);
    y = zeichneListe(doc, y, "Weitere Kennzahlen Arbeitsmarkt", weitere);
    return zeichneDatenfazit(doc, y, kern.concat(weitere));
  }

  async function baueInflation(doc, y) {
    await ladeDateien(["daten/inflation.js", "daten/webquellen.js", "daten/arbeitsmarkt.js",
      "daten/cpi-kategorien.js", "bereiche/inflation-kacheln.js"]);
    y = zeichneBereichsKopf(doc, y, "Inflation",
      "Wo steht der Preisdruck bei Verbrauchern und Produzenten, und was erwartet der Markt?");

    var kern = kacheln(["CPIAUCSL", "CPILFESL", "PPIFIS"]);
    y = zeichneKernzeile(doc, y, kern);

    var weitere = kacheln(["PPIFES", "ISM_MFG_PRICE", "ISM_SVC_PRICE", "GSCPI", "DCOILBRENTEU",
      "M2SL", "T5YIE", "T5YIFR", "MICH", "ECIALLCIV"]);
    y = zeichneListe(doc, y, "Weitere Kennzahlen Inflation", weitere);
    y = zeichneDatenfazit(doc, y, kern.concat(weitere));

    /* Eigene Seite fuer die Kategorien: zwei lange Listen, die auf der
       Bereichsseite den Umbruch sprengen wuerden. */
    zustand.bereich = "Inflation · Kategorien";
    y = neueSeite(doc);
    y = zeichneBereichsKopf(doc, y, "Inflation · Kategorien",
      "Woher der Preisdruck kommt: CPI- und PPI-Kategorien im Vorjahresvergleich, absteigend sortiert.");
    var spalte = (INHALT - 8) / 2;
    var u1 = zeichneKategorienSpalte(doc, RAND, y, spalte, "CPI nach Kategorien", cpiKategorien());
    var u2 = zeichneKategorienSpalte(doc, RAND + spalte + 8, y, spalte, "PPI nach Kategorien", ppiKategorien());
    return Math.max(u1, u2) + 6;
  }

  async function baueWachstum(doc, y) {
    await ladeDateien(["daten/wachstum.js", "daten/webquellen.js", "bereiche/wachstum-kacheln.js"]);
    y = zeichneBereichsKopf(doc, y, "Wachstum",
      "Wie schnell wächst die Wirtschaft aktuell, und was sagen die Frühindikatoren über die nächsten Monate?");

    var kern = kacheln(["A191RL1Q225SBEA", "GDPNOW"]);
    y = zeichneKernzeile(doc, y, kern);

    var weitere = kacheln(["ISM_MFG_NO", "ISM_MFG_BACKLOG", "ISM_SVC_BUSACT", "DGORDER", "DG_ORDER_SHIP",
      "CB_CCI", "MICH_ICE", "NFIB", "PERMIT", "MORTGAGE30US", "OECD_CLI"]);
    y = zeichneListe(doc, y, "Weitere Kennzahlen Wachstum", weitere);
    return zeichneDatenfazit(doc, y, kern.concat(weitere));
  }

  async function baueZinsen(doc, y) {
    await ladeDateien(["daten/zinsen.js", "daten/regime.js", "bereiche/zinsen-kacheln.js"]);
    y = zeichneBereichsKopf(doc, y, "Zinsen",
      "Leitzinsen, Realrendite, Breakeven und Zinsstrukturkurve – Grundlage des Bonds Framework.");

    var kern = kacheln(["FED_LEITZINS", "T10Y2Y", "DFII10"]);
    y = zeichneKernzeile(doc, y, kern);

    var leitzinsen = kacheln(["ECBDFR", "IRSTCI01GBM156N", "IRSTCI01JPM156N", "IRSTCI01AUM156N",
      "IRSTCI01CAM156N", "IR3TIB01CHM156N", "IR3TIB01NZM156N"]);
    y = zeichneListe(doc, y, "Leitzinsen weitere Notenbanken", leitzinsen);

    var weitere = kacheln(["T10YIE", "DGS2", "DGS10"]);
    y = zeichneListe(doc, y, "Renditen und Breakeven (USA)", weitere);

    y = zeichneDotPlot(doc, y);
    return zeichneDatenfazit(doc, y, kern.concat(leitzinsen, weitere));
  }

  async function bauePlumbing(doc, y) {
    await ladeDateien(["daten/plumbing.js", "bereiche/plumbing-kacheln.js"]);
    y = zeichneBereichsKopf(doc, y, "Plumbing",
      "Wie teuer und knapp ist USD-Funding, und wie angespannt ist das Finanzsystem insgesamt?");

    var kern = kacheln(["VIXCLS", "BAMLH0A0HYM2", "SOFR_RATE"]);
    y = zeichneKernzeile(doc, y, kern);

    var weitere = kacheln(["SOFR_VOLUME", "RPONTSYD", "RRPONTSYD", "STLFSI4"]);
    y = zeichneListe(doc, y, "Weitere Kennzahlen Plumbing", weitere);
    return zeichneDatenfazit(doc, y, kern.concat(weitere));
  }

  async function baueRegime(doc, y) {
    await ladeDateien(["daten/regime.js", "regime-ansicht.js", "bereiche/regime-kacheln.js"]);
    y = zeichneBereichsKopf(doc, y, "Regime",
      "In welchem Zinsregime läuft der Markt, und was sagen die Konjunkturzyklus-Frühindikatoren?");

    y = zeichneRegimeChart(doc, y);
    y = zeichneRegimeKaesten(doc, y);

    var weitere = kacheln(["XLY_XLP", "IYT_XLU", "HYG_TLT", "VUG_VTV"]);
    y = zeichneListe(doc, y, "Konjunkturzyklus-Frühindikatoren", weitere);
    return zeichneDatenfazit(doc, y, weitere);
  }

  /* =========================================================================
     15. Ablauf
     ========================================================================= */

  async function erzeugeReport(knopf) {
    var textVorher = knopf.textContent;
    knopf.disabled = true;
    try {
      var jsPDF = window.jspdf && window.jspdf.jsPDF;
      if (!jsPDF) { throw new Error("PDF-Bibliothek (jsPDF) konnte nicht geladen werden – Internetverbindung prüfen."); }
      laufStempel = String(Date.now());
      var doc = new jsPDF({ unit: "mm", format: "a4" });
      doc.setFont("helvetica", "normal");
      schriftSicherMachen(doc);

      seitenGrund(doc);
      var y = zeichneTitelkopf(doc);

      var schritte = [
        { name: "Arbeitsmarkt", fn: baueArbeitsmarkt },
        { name: "Inflation", fn: baueInflation },
        { name: "Wachstum", fn: baueWachstum },
        { name: "Zinsen", fn: baueZinsen },
        { name: "Plumbing", fn: bauePlumbing },
        { name: "Regime", fn: baueRegime }
      ];

      for (var i = 0; i < schritte.length; i++) {
        knopf.textContent = "Lade " + schritte[i].name + " …";
        /* Bereichsname vor dem Seitenwechsel setzen, damit der Laufkopf der
           neuen Seite schon den richtigen Bereich zeigt. */
        zustand.bereich = schritte[i].name;
        if (i > 0) { y = neueSeite(doc); }
        y = await schritte[i].fn(doc, y);
      }

      knopf.textContent = "Baue PDF …";
      zeichneFuesse(doc);
      doc.save("MakroReport-" + new Date().toISOString().slice(0, 10) + ".pdf");
    } catch (fehler) {
      window.alert("PDF konnte nicht erzeugt werden.\n\n" + fehler.message);
    } finally {
      aufraeumen();
      knopf.disabled = false;
      knopf.textContent = textVorher;
    }
  }

  /* Direkt aufrufbar machen: erlaubt einen Testlauf ohne Klick (z. B. im
     Chrome-Headless-Lauf) und ist ansonsten unbenutzt. Der Parameter ist
     alles, was einen Knopf ausmacht: textContent und disabled. */
  window.MAKRO_REPORT = {
    erzeuge: function (knopf) {
      return erzeugeReport(knopf || { textContent: "", disabled: false });
    }
  };

  document.addEventListener("DOMContentLoaded", function () {
    var knopf = document.getElementById("pdfKnopf");
    if (!knopf) { return; }
    knopf.addEventListener("click", function () { erzeugeReport(knopf); });
  });

})();
