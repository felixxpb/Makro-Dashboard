/* ===========================================================================
   Makro-Dashboard - PDF-Report ("MakroReport", Sonntagsausblick)
   Baut auf Knopfdruck einen gestalteten Wochenreport zum Ausdrucken:
   Arbeitsmarkt, Inflation, Wachstum. Ersetzt die fruehere generische
   Tabellen-Version (siehe Git-Historie / README, falls die alte Fassung
   nochmal gebraucht wird).

   Funktionsweise: Fuer jeden der drei Bereiche werden die gleichen
   Datendateien + die zugehoerige bereiche/*-kacheln.js nachgeladen wie auf
   der jeweiligen Unterseite. Das setzt window.KACHELN / window.GRUPPEN /
   window.QUELLEN neu. Alle Werte werden mit genau den Funktionen berechnet,
   die auch die Kacheln selbst benutzen (window.MOTOR, siehe motor.js) -
   keine zweite Rechenlogik, also nie ein Unterschied zwischen Website und
   Report.

   Layout-Hinweis (Abweichung von der Handvorlage): Die vier Trend-Boxen
   (AKTUELL / 1M / 3M / 6M) passen unter drei nebeneinanderliegenden Charts
   nicht lesbar in eine Reihe (zu schmal fuer Text + Datum). Sie stehen
   deshalb als 2x2-Raster unter jedem Chart, mit gekuerztem Text (Wert +
   Pfeil + Vormonatsdatum, ohne ausgeschriebenen Vergleichssatz). Die Zahlen
   selbst sind exakt die von motor.js berechneten 1/3/6-Monats-Trends.

   Voraussetzung: motor.js ist auf index.html eingebunden (nur zur
   Berechnung, baut auf dieser Seite keine Kacheln, siehe Schutz in
   motor.js).
   =========================================================================== */

(function () {
  "use strict";

  /* --- Farben (angelehnt an die Vorlage: dunkles Braun/Anthrazit + Gold) --- */
  var FARBE_HEADER_BG   = [38, 30, 22];
  var FARBE_GOLD_BG     = [150, 108, 58];
  var FARBE_SEKTION_BG  = [24, 24, 23];
  var FARBE_BOX_BG      = [36, 35, 33];
  var FARBE_CHART_BG    = [24, 24, 23];
  var FARBE_LINIE       = [86, 155, 235];
  var FARBE_GUT         = [16, 145, 16];
  var FARBE_SCHLECHT    = [200, 55, 55];
  var FARBE_TEXT_HELL   = [245, 244, 240];
  var FARBE_TEXT_MATT   = [180, 178, 172];
  var FARBE_TEXT_DUNKEL = [30, 28, 24];
  var FARBE_SEITE_BG    = [253, 250, 244];
  var FARBE_PILL_BG     = [232, 226, 213];
  var FARBE_TABKOPF_BG  = [225, 220, 208];
  var FARBE_TABZEILE_ALT= [244, 241, 234];
  var FARBE_RAND        = [210, 205, 195];

  var SEITEN_BREITE = 210, SEITEN_HOEHE = 297;
  var RAND_LINKS = 14, RAND_RECHTS = 14;
  var INHALT_BREITE = SEITEN_BREITE - RAND_LINKS - RAND_RECHTS;

  /* --- Skripte nachladen (gleiches Muster wie die Bereichs-Unterseiten) --- */

  var geladeneTags = [];

  function ladeSkript(pfad) {
    return new Promise(function (resolve, reject) {
      var tag = document.createElement("script");
      tag.src = pfad;
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

  /* --- Datum / Kalenderwoche ----------------------------------------------- */

  function montagDerWoche(datum) {
    var d = new Date(datum);
    var tag = d.getDay(); // 0 = Sonntag
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
    var kw = 1 + Math.round(((d - jahresBeginn) / 86400000 - 3 + ((jahresBeginn.getUTCDay() + 6) % 7)) / 7);
    return kw;
  }

  function datumKurz(d) {
    return String(d.getDate()).padStart(2, "0") + "." + String(d.getMonth() + 1).padStart(2, "0") + "." + d.getFullYear();
  }

  /* --- Chart als PNG (letzte 3 Jahre) --------------------------------------- */

  function letzteNJahre(punkte, jahre) {
    if (!punkte.length) { return punkte; }
    var letztes = new Date(punkte[punkte.length - 1].d + "T00:00:00");
    var grenze = new Date(letztes);
    grenze.setFullYear(grenze.getFullYear() - jahre);
    var gefiltert = punkte.filter(function (p) { return new Date(p.d + "T00:00:00") >= grenze; });
    return gefiltert.length >= 2 ? gefiltert : punkte;
  }

  function baueChartBild(punkte) {
    var skala = 4; // hoehere Aufloesung fuers PDF
    var breitePx = 300 * skala, hoehePx = 110 * skala;
    var canvas = document.createElement("canvas");
    canvas.width = breitePx; canvas.height = hoehePx;
    var ctx = canvas.getContext("2d");
    ctx.fillStyle = "rgb(" + FARBE_CHART_BG.join(",") + ")";
    ctx.fillRect(0, 0, breitePx, hoehePx);

    var teil = letzteNJahre(punkte, 3);
    if (teil.length < 2) { return canvas.toDataURL("image/png"); }

    var werte = teil.map(function (p) { return p.v; });
    var min = Math.min.apply(null, werte), max = Math.max.apply(null, werte);
    var spanne = (max - min) || 1;
    var padX = 8 * skala, padY = 10 * skala;

    function x(i) { return padX + (i / (teil.length - 1)) * (breitePx - padX * 2); }
    function y(v) { return hoehePx - padY - ((v - min) / spanne) * (hoehePx - padY * 2); }

    ctx.strokeStyle = "rgb(" + FARBE_LINIE.join(",") + ")";
    ctx.lineWidth = 2 * skala;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    teil.forEach(function (p, i) {
      var px = x(i), py = y(p.v);
      if (i === 0) { ctx.moveTo(px, py); } else { ctx.lineTo(px, py); }
    });
    ctx.stroke();

    var letzterIdx = teil.length - 1;
    ctx.fillStyle = "rgb(" + FARBE_LINIE.join(",") + ")";
    ctx.beginPath();
    ctx.arc(x(letzterIdx), y(teil[letzterIdx].v), 3.5 * skala, 0, Math.PI * 2);
    ctx.fill();

    return canvas.toDataURL("image/png");
  }

  /* --- Kleine Zeichenhelfer ------------------------------------------------- */

  function setzeFuell(doc, farbe) { doc.setFillColor(farbe[0], farbe[1], farbe[2]); }
  function setzeText(doc, farbe) { doc.setTextColor(farbe[0], farbe[1], farbe[2]); }
  function setzeLinie(doc, farbe) { doc.setDrawColor(farbe[0], farbe[1], farbe[2]); }

  function platzPruefen(doc, y, minHoehe) {
    if (y + minHoehe > SEITEN_HOEHE - 16) {
      doc.addPage();
      malePageHintergrund(doc);
      return 16;
    }
    return y;
  }

  function malePageHintergrund(doc) {
    setzeFuell(doc, FARBE_SEITE_BG);
    doc.rect(0, 0, SEITEN_BREITE, SEITEN_HOEHE, "F");
  }

  /* --- Trend-Berechnung, direkt ueber window.MOTOR -------------------------- */

  function trendWert(M, k, punkte, letzter, n) {
    var punkt = M.trendVergleichspunkt(punkte, n);
    if (!punkt) { return null; }
    var diff = letzter.v - punkt.v;
    return { punkt: punkt, diff: diff };
  }

  function farbeFuerDiff(diff) {
    if (diff > 0) { return FARBE_GUT; }
    if (diff < 0) { return FARBE_SCHLECHT; }
    return FARBE_TEXT_MATT;
  }

  // Unicode-Pfeile (↑/↓) sind in den jsPDF-Kernschriften nicht
  // zuverlaessig vorhanden - deshalb echte kleine Dreiecke zeichnen statt
  // Pfeilzeichen im Text zu verwenden.
  function maleTrendDreieck(doc, mitteX, mitteY, diff, groesse) {
    if (!diff) { return; }
    var farbe = diff > 0 ? FARBE_GUT : FARBE_SCHLECHT;
    setzeFuell(doc, farbe);
    var h = groesse;
    if (diff > 0) {
      doc.triangle(mitteX, mitteY - h / 2, mitteX - h / 2, mitteY + h / 2, mitteX + h / 2, mitteY + h / 2, "F");
    } else {
      doc.triangle(mitteX, mitteY + h / 2, mitteX - h / 2, mitteY - h / 2, mitteX + h / 2, mitteY - h / 2, "F");
    }
  }

  /* --- Headline-Metrik: Titel + Chart + 2x2 Trend-Raster -------------------- */

  function zeichneHeadlineSpalte(doc, x, y, breite, k) {
    var M = window.MOTOR;
    var punkte = M.punkteVon(k);
    var art = M.frequenzArt(k);
    var einheit = M.einheitVon(k) ? " " + M.einheitVon(k) : "";

    setzeText(doc, FARBE_TEXT_HELL);
    doc.setFontSize(8.5);
    doc.setFont(undefined, "bold");
    doc.text(k.titel, x, y);
    doc.setFont(undefined, "normal");

    var chartY = y + 2;
    var chartHoehe = 26;
    if (punkte.length >= 2) {
      var bild = baueChartBild(punkte);
      doc.addImage(bild, "PNG", x, chartY, breite, chartHoehe);
    } else {
      setzeFuell(doc, FARBE_CHART_BG);
      doc.rect(x, chartY, breite, chartHoehe, "F");
      setzeText(doc, FARBE_TEXT_MATT);
      doc.setFontSize(7);
      doc.text("keine Historie", x + 2, chartY + chartHoehe / 2);
    }

    var rasterY = chartY + chartHoehe + 2;
    var boxSpalt = 1.5, boxZeile = 1.5;
    var boxBreite = (breite - boxSpalt) / 2;
    var boxHoehe = 13;

    if (!punkte.length) {
      setzeText(doc, FARBE_TEXT_MATT);
      doc.setFontSize(7);
      doc.text("keine Daten", x, rasterY + 6);
      return rasterY + boxHoehe * 2 + boxZeile + 4;
    }

    var letzter = punkte[punkte.length - 1];
    var felder = [
      { label: "AKTUELL", text: M.zahl(letzter.v, k.format) + einheit, farbe: FARBE_TEXT_HELL }
    ];
    [1, 3, 6].forEach(function (n) {
      var t = trendWert(M, k, punkte, letzter, n);
      if (!t) { felder.push({ label: n + "-MONATS-TREND", text: "–", farbe: FARBE_TEXT_MATT, diff: 0 }); return; }
      var farbe = farbeFuerDiff(t.diff);
      var text = M.veraenderungText(t.diff, k.format) + einheit;
      var unterzeile = "vs " + M.datumText(t.punkt.d, art);
      felder.push({ label: n + "-MONATS-TREND", text: text, unterzeile: unterzeile, farbe: farbe, diff: t.diff });
    });

    for (var i = 0; i < 4; i++) {
      var spalte = i % 2, zeile = Math.floor(i / 2);
      var bx = x + spalte * (boxBreite + boxSpalt);
      var by = rasterY + zeile * (boxHoehe + boxZeile);
      setzeFuell(doc, FARBE_BOX_BG);
      doc.roundedRect(bx, by, boxBreite, boxHoehe, 1, 1, "F");
      setzeText(doc, FARBE_TEXT_MATT);
      doc.setFontSize(5.2);
      doc.text(felder[i].label, bx + 1.8, by + 4);
      setzeText(doc, felder[i].farbe);
      doc.setFontSize(7.2);
      doc.text(String(felder[i].text), bx + 1.8, by + 8.3);
      if (i > 0 && felder[i].diff) { maleTrendDreieck(doc, bx + boxBreite - 3.5, by + 6.8, felder[i].diff, 2.6); }
      if (felder[i].unterzeile) {
        setzeText(doc, FARBE_TEXT_MATT);
        doc.setFontSize(5);
        doc.text(felder[i].unterzeile, bx + 1.8, by + 11.5);
      }
    }

    return rasterY + boxHoehe * 2 + boxZeile + 4;
  }

  function zeichneHeadlineBereich(doc, y, titel, spaltenKacheln) {
    var n = spaltenKacheln.length;
    var luecke = 4;
    var spaltenBreite = (INHALT_BREITE - luecke * (n - 1)) / n;

    // Hoehe grob abschaetzen: Titelzeile + Chart + 2 Boxreihen + Innenabstand
    var innenHoehe = 6 + 2 + 26 + 2 + 13 * 2 + 1.5 + 4 + 6;
    y = platzPruefen(doc, y, innenHoehe + 10);

    var kastenY = y;
    setzeFuell(doc, FARBE_SEKTION_BG);
    doc.roundedRect(RAND_LINKS, kastenY, INHALT_BREITE, innenHoehe, 2, 2, "F");

    setzeText(doc, FARBE_TEXT_HELL);
    doc.setFontSize(12);
    doc.setFont(undefined, "bold");
    doc.text(titel, RAND_LINKS + 4, kastenY + 7);
    doc.setFont(undefined, "normal");

    var innenY = kastenY + 11;
    var maxUnten = innenY;
    for (var i = 0; i < n; i++) {
      var sx = RAND_LINKS + 4 + i * (spaltenBreite + luecke);
      var unten = zeichneHeadlineSpalte(doc, sx, innenY, spaltenBreite - 4, spaltenKacheln[i]);
      if (unten > maxUnten) { maxUnten = unten; }
    }

    return kastenY + innenHoehe + 6;
  }

  /* --- Datentabelle (vorl. / letzt. / aktuell / 6M / 3M / 1M) --------------- */

  function tabellenZeile(k) {
    var M = window.MOTOR;
    var punkte = M.punkteVon(k);
    var art = M.frequenzArt(k);
    var einheit = M.einheitVon(k) || "";

    function formatPunkt(p) { return p ? M.zahl(p.v, k.format) + (einheit ? " " + einheit : "") : "–"; }

    var n = punkte.length;
    var vorletzter = n >= 3 ? punkte[n - 3] : null;
    var letzterMonat = n >= 2 ? punkte[n - 2] : null;
    var aktuellerPunkt = n >= 1 ? punkte[n - 1] : null;

    var trendZellen = [6, 3, 1].map(function (m) {
      if (!aktuellerPunkt) { return { text: "–", farbe: null, diff: 0 }; }
      var t = trendWert(M, k, punkte, aktuellerPunkt, m);
      if (!t) { return { text: "–", farbe: null, diff: 0 }; }
      var farbe = farbeFuerDiff(t.diff);
      var text = M.veraenderungText(t.diff, k.format) + (einheit ? " " + einheit : "");
      return { text: text, farbe: farbe, diff: t.diff };
    });

    return {
      zeile: [k.titel, formatPunkt(vorletzter), formatPunkt(letzterMonat), formatPunkt(aktuellerPunkt),
        trendZellen[0].text, trendZellen[1].text, trendZellen[2].text],
      farben: [null, null, null, null, trendZellen[0].farbe, trendZellen[1].farbe, trendZellen[2].farbe],
      diffs: [0, 0, 0, 0, trendZellen[0].diff, trendZellen[1].diff, trendZellen[2].diff]
    };
  }

  function zeichneDatentabelle(doc, y, kachelListe) {
    var M = window.MOTOR;
    var zeilen = kachelListe.filter(Boolean).map(tabellenZeile);
    if (!zeilen.length) { return y; }

    y = platzPruefen(doc, y, 20);
    var body = zeilen.map(function (z) { return z.zeile; });
    var farben = zeilen.map(function (z) { return z.farben; });
    var diffs = zeilen.map(function (z) { return z.diffs; });

    doc.autoTable({
      startY: y,
      head: [["Kennzahl", "vorl.", "letzt.", "aktuell", "6M", "3M", "1M"]],
      body: body,
      styles: { fontSize: 7.5, cellPadding: 2, textColor: FARBE_TEXT_DUNKEL, lineColor: FARBE_RAND, lineWidth: 0.1 },
      headStyles: { fillColor: FARBE_TABKOPF_BG, textColor: FARBE_TEXT_DUNKEL, fontStyle: "bold" },
      alternateRowStyles: { fillColor: FARBE_TABZEILE_ALT },
      margin: { left: RAND_LINKS, right: RAND_RECHTS },
      columnStyles: { 0: { cellWidth: 52 } },
      didParseCell: function (data) {
        if (data.section === "body" && data.column.index >= 4) {
          var farbe = farben[data.row.index][data.column.index];
          if (farbe) { data.cell.styles.textColor = farbe; }
          data.cell.styles.cellPadding = { top: 2, right: 2, bottom: 2, left: 5 };
        }
      },
      didDrawCell: function (data) {
        if (data.section === "body" && data.column.index >= 4) {
          var diff = diffs[data.row.index][data.column.index];
          if (diff) { maleTrendDreieck(doc, data.cell.x + 2, data.cell.y + data.cell.height / 2, diff, 2); }
        }
      }
    });

    return doc.lastAutoTable.finalY + 6;
  }

  /* --- Kategorien-Tabellen (CPI / PPI, aktueller Monat, YoY) ----------------- */

  function cpiKategorienZeilen() {
    var daten = window.CPI_KATEGORIEN_DATEN;
    if (!daten || !daten.monate || !daten.monate.length) { return null; }
    var letzterMonat = daten.monate[daten.monate.length - 1];
    var zeilen = daten.kategorien
      .map(function (kat) { return { name: kat.name, wert: letzterMonat.werte[kat.key] }; })
      .filter(function (z) { return z.wert !== undefined && z.wert !== null; })
      .sort(function (a, b) { return b.wert - a.wert; });
    return { stand: letzterMonat.d, zeilen: zeilen };
  }

  function ppiKategorienZeilen() {
    var M = window.MOTOR;
    var ppiKachel = findeKachel("PPIFIS");
    if (!ppiKachel || !ppiKachel.aufschluesselung || !ppiKachel.aufschluesselung.kategorien) { return null; }
    var stand = null;
    var zeilen = ppiKachel.aufschluesselung.kategorien.map(function (kat) {
      var k = { schluessel: kat.schluessel, quelle: "fred", format: "prozent", ableitung: "yoy", ableitungSchritt: 12 };
      var p = M.punkteVon(k);
      if (!p.length) { return { name: kat.name, wert: null }; }
      stand = p[p.length - 1].d;
      return { name: kat.name, wert: p[p.length - 1].v };
    }).filter(function (z) { return z.wert !== null; });
    return { stand: stand, zeilen: zeilen };
  }

  function zeichneKategorienZweispaltig(doc, y, linksTitel, linksDaten, rechtsTitel, rechtsDaten) {
    if (!linksDaten && !rechtsDaten) { return y; }
    var M = window.MOTOR;
    var spaltBreite = (INHALT_BREITE - 6) / 2;

    y = platzPruefen(doc, y, 14);
    setzeText(doc, FARBE_TEXT_DUNKEL);
    doc.setFontSize(9.5);
    doc.setFont(undefined, "bold");
    doc.text(linksTitel + " nach Kategorien", RAND_LINKS, y);
    doc.text(rechtsTitel + " nach Kategorien", RAND_LINKS + spaltBreite + 6, y);
    doc.setFont(undefined, "normal");
    y += 2;

    function zumBody(daten) {
      if (!daten) { return []; }
      return daten.zeilen.map(function (z) {
        return { row: [z.name, M.zahl(z.wert, "prozent") + " %"], farbe: farbeFuerDiff(z.wert) };
      });
    }

    var linksBody = zumBody(linksDaten);
    var rechtsBody = zumBody(rechtsDaten);

    var startY = y;
    doc.autoTable({
      startY: startY,
      head: [["Kategorie (YoY)", "%"]],
      body: linksBody.map(function (b) { return b.row; }),
      styles: { fontSize: 6.5, cellPadding: 1.4, textColor: FARBE_TEXT_DUNKEL, lineColor: FARBE_RAND, lineWidth: 0.1 },
      headStyles: { fillColor: FARBE_TABKOPF_BG, textColor: FARBE_TEXT_DUNKEL, fontStyle: "bold" },
      alternateRowStyles: { fillColor: FARBE_TABZEILE_ALT },
      margin: { left: RAND_LINKS, right: RAND_RECHTS + spaltBreite + 6 },
      tableWidth: spaltBreite,
      didParseCell: function (data) {
        if (data.section === "body" && data.column.index === 1) {
          data.cell.styles.textColor = linksBody[data.row.index].farbe;
        }
      }
    });
    var linksEndeY = doc.lastAutoTable.finalY;

    doc.autoTable({
      startY: startY,
      head: [["Kategorie (YoY)", "%"]],
      body: rechtsBody.map(function (b) { return b.row; }),
      styles: { fontSize: 6.5, cellPadding: 1.4, textColor: FARBE_TEXT_DUNKEL, lineColor: FARBE_RAND, lineWidth: 0.1 },
      headStyles: { fillColor: FARBE_TABKOPF_BG, textColor: FARBE_TEXT_DUNKEL, fontStyle: "bold" },
      alternateRowStyles: { fillColor: FARBE_TABZEILE_ALT },
      margin: { left: RAND_LINKS + spaltBreite + 6, right: RAND_RECHTS },
      tableWidth: spaltBreite,
      didParseCell: function (data) {
        if (data.section === "body" && data.column.index === 1) {
          data.cell.styles.textColor = rechtsBody[data.row.index].farbe;
        }
      }
    });
    var rechtsEndeY = doc.lastAutoTable.finalY;

    return Math.max(linksEndeY, rechtsEndeY) + 6;
  }

  /* --- Fazit-Box (leer zum Ausdrucken, Felix schreibt von Hand) ------------- */

  function zeichneFazitBox(doc, y, bereichsName) {
    var hoehe = 22;
    y = platzPruefen(doc, y, hoehe + 6);
    setzeFuell(doc, FARBE_PILL_BG);
    doc.roundedRect(RAND_LINKS, y, INHALT_BREITE, hoehe, 2, 2, "F");
    setzeText(doc, [130, 120, 100]);
    doc.setFontSize(16);
    doc.text("“", RAND_LINKS + 4, y + 9);
    setzeText(doc, FARBE_TEXT_DUNKEL);
    doc.setFontSize(9);
    doc.setFont(undefined, "bold");
    doc.text("Fazit " + bereichsName + " ...", RAND_LINKS + 10, y + 9);
    doc.setFont(undefined, "normal");
    setzeLinie(doc, FARBE_RAND);
    doc.line(RAND_LINKS + 10, y + 15, RAND_LINKS + INHALT_BREITE - 10, y + 15);
    setzeText(doc, [130, 120, 100]);
    doc.setFontSize(16);
    doc.text("”", RAND_LINKS + INHALT_BREITE - 10, y + hoehe - 3);
    return y + hoehe + 8;
  }

  /* --- Kopfbereich (MakroReport / Sonntagsausblick / KW) --------------------- */

  function zeichneReportKopf(doc) {
    setzeFuell(doc, FARBE_HEADER_BG);
    doc.rect(0, 0, SEITEN_BREITE, 34, "F");
    setzeText(doc, FARBE_TEXT_HELL);
    doc.setFontSize(30);
    doc.setFont(undefined, "bold");
    doc.text("MakroReport", RAND_LINKS, 22);
    doc.setFont(undefined, "normal");

    setzeFuell(doc, FARBE_GOLD_BG);
    doc.rect(0, 34, SEITEN_BREITE, 8, "F");
    setzeText(doc, FARBE_TEXT_HELL);
    doc.setFontSize(9);
    doc.setFont(undefined, "bold");
    doc.text("Sonntagsausblick", SEITEN_BREITE / 2, 39.5, { align: "center" });
    doc.setFont(undefined, "normal");

    var heute = new Date();
    var montag = montagDerWoche(heute);
    var sonntag = new Date(montag); sonntag.setDate(sonntag.getDate() + 6);
    var kw = isoKw(montag);

    setzeText(doc, FARBE_TEXT_DUNKEL);
    doc.setFontSize(10);
    doc.text("Für die KW " + kw + " vom:", RAND_LINKS, 50);

    setzeFuell(doc, FARBE_PILL_BG);
    doc.roundedRect(RAND_LINKS + 38, 45.5, 26, 6.5, 2, 2, "F");
    doc.text(datumKurz(montag), RAND_LINKS + 51, 50, { align: "center" });
    doc.text("-", RAND_LINKS + 67, 50);
    setzeFuell(doc, FARBE_PILL_BG);
    doc.roundedRect(RAND_LINKS + 70, 45.5, 26, 6.5, 2, 2, "F");
    doc.text(datumKurz(sonntag), RAND_LINKS + 83, 50, { align: "center" });

    setzeText(doc, [120, 112, 96]);
    doc.setFontSize(7.5);
    doc.text("Erzeugt am " + heute.toLocaleDateString("de-DE") + ", " + heute.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) + " Uhr", SEITEN_BREITE - RAND_RECHTS, 50, { align: "right" });

    return 58;
  }

  /* --- Bereich Arbeitsmarkt --------------------------------------------------- */

  async function baueArbeitsmarkt(doc, y) {
    await ladeDateien(["daten/arbeitsmarkt.js", "daten/webquellen.js", "bereiche/arbeitsmarkt-kacheln.js"]);

    var aheKachel = { schluessel: "CES0500000003", quelle: "fred", titel: "Average Hourly Earnings", format: "prozent", einheitFest: "% MoM" };
    var unrateKachel = findeKachel("UNRATE");
    var payemsKachel = findeKachel("PAYEMS");

    y = zeichneHeadlineBereich(doc, y, "Arbeitsmarkt", [aheKachel, unrateKachel, payemsKachel]);

    var tabellenReihen = ["JTSJOR", "JTSHIR", "JTSTSR", "JTSQUR", "ISM_MFG_EMP", "ISM_SVC_EMP", "ECIALLCIV", "CHALLENGER", "ICSA"]
      .map(function (s) { return findeKachel(s); });
    y = zeichneDatentabelle(doc, y, tabellenReihen);

    y = zeichneFazitBox(doc, y, "Arbeitsmarkt");
    return y;
  }

  /* --- Bereich Inflation ------------------------------------------------------- */

  async function baueInflation(doc, y) {
    await ladeDateien(["daten/inflation.js", "daten/webquellen.js", "daten/arbeitsmarkt.js", "daten/cpi-kategorien.js", "bereiche/inflation-kacheln.js"]);

    var headline = ["CPIAUCSL", "CPILFESL", "PPIFIS", "PPIFES"].map(function (s) { return findeKachel(s); });
    y = zeichneHeadlineBereich(doc, y, "Inflation", headline);

    var cpiKat = cpiKategorienZeilen();
    var ppiKat = ppiKategorienZeilen();
    y = zeichneKategorienZweispaltig(doc, y, "CPI", cpiKat, "PPI", ppiKat);

    var tabellenReihen = ["ISM_MFG_PRICE", "ISM_SVC_PRICE", "GSCPI", "DCOILBRENTEU", "M2SL", "T5YIE", "T5YIFR", "MICH", "ECIALLCIV"]
      .map(function (s) { return findeKachel(s); });
    y = zeichneDatentabelle(doc, y, tabellenReihen);

    y = zeichneFazitBox(doc, y, "Inflation");
    return y;
  }

  /* --- Bereich Wachstum --------------------------------------------------------- */

  async function baueWachstum(doc, y) {
    await ladeDateien(["daten/wachstum.js", "daten/webquellen.js", "bereiche/wachstum-kacheln.js"]);

    var headline = ["A191RL1Q225SBEA", "GDPNOW"].map(function (s) { return findeKachel(s); });
    y = zeichneHeadlineBereich(doc, y, "Wachstum", headline);

    var tabellenReihen = ["ISM_MFG_NO", "ISM_MFG_BACKLOG", "ISM_SVC_BUSACT", "DGORDER", "DG_ORDER_SHIP", "CB_CCI",
      "MICH_ICE", "NFIB", "PERMIT", "MORTGAGE30US", "OECD_CLI"].map(function (s) { return findeKachel(s); });
    y = zeichneDatentabelle(doc, y, tabellenReihen);

    y = zeichneFazitBox(doc, y, "Wachstum");
    return y;
  }

  /* --- Ablauf ------------------------------------------------------------------ */

  async function erzeugeReport(knopf) {
    var textVorher = knopf.textContent;
    knopf.disabled = true;
    try {
      var jsPDF = window.jspdf && window.jspdf.jsPDF;
      if (!jsPDF) { throw new Error("PDF-Bibliothek (jsPDF) konnte nicht geladen werden - Internetverbindung prüfen."); }
      var doc = new jsPDF({ unit: "mm", format: "a4" });

      malePageHintergrund(doc);
      var y = zeichneReportKopf(doc);

      knopf.textContent = "Lade Arbeitsmarkt …";
      y = await baueArbeitsmarkt(doc, y);

      doc.addPage();
      malePageHintergrund(doc);
      knopf.textContent = "Lade Inflation …";
      y = await baueInflation(doc, 16);

      doc.addPage();
      malePageHintergrund(doc);
      knopf.textContent = "Lade Wachstum …";
      y = await baueWachstum(doc, 16);

      knopf.textContent = "Baue PDF …";
      var heute = new Date();
      var dateiDatum = heute.toISOString().slice(0, 10);
      doc.save("MakroReport-" + dateiDatum + ".pdf");
    } catch (fehler) {
      window.alert("PDF konnte nicht erzeugt werden.\n\n" + fehler.message);
    } finally {
      aufraeumen();
      knopf.disabled = false;
      knopf.textContent = textVorher;
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    var knopf = document.getElementById("pdfKnopf");
    if (!knopf) { return; }
    knopf.addEventListener("click", function () { erzeugeReport(knopf); });
  });

})();
