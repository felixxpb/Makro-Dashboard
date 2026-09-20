/* ===========================================================================
   Makro-Dashboard - Motor
   Generischer Code fuer alle Themenbereiche: baut Kacheln, Graphen und die
   Detailansicht. Reine Anzeige: die Daten kommen fertig aus den Abrufskripten.

   Jede Bereichs-Seite (arbeitsmarkt.html, inflation.html, ...) laedt vor
   diesem Skript:
   - ihre Datendateien (daten/*.js), die window.<NAME>_DATEN setzen
   - ihre Konfigurationsdatei (bereiche/*-kacheln.js), die setzt:
     window.KACHELN   = [ ... ]   (Liste der Kacheln, siehe Konfigurationsdatei)
     window.GRUPPEN   = [ { id, titel, hinweis }, ... ]  (Reihenfolge der Abschnitte)
     window.QUELLEN   = { fred: window.X_DATEN, web: window.WEBQUELLEN_DATEN, ... }
   =========================================================================== */

(function () {
  "use strict";

  var KACHELN = window.KACHELN || [];
  var GRUPPEN = window.GRUPPEN || [];
  var QUELLEN = window.QUELLEN || {};

  var MONATE = ["Januar","Februar","März","April","Mai","Juni","Juli",
                "August","September","Oktober","November","Dezember"];

  /* --- Hilfsmittel ------------------------------------------------------- */

  function el(tag, klasse, text) {
    var n = document.createElement(tag);
    if (klasse) { n.className = klasse; }
    if (text !== undefined && text !== null) { n.textContent = String(text); }
    return n;
  }

  function reihe(k) {
    // Live von window.QUELLEN lesen, nicht von der Momentaufnahme beim Laden
    // dieses Skripts: der PDF-Report (pdf-report.js) laedt auf derselben Seite
    // nacheinander mehrere Bereiche nach und setzt window.QUELLEN dafuer jedes
    // Mal neu, lange nachdem motor.js selbst schon geladen ist.
    var quellen = window.QUELLEN || QUELLEN;
    var quelle = quellen[k.quelle];
    return (quelle && quelle.reihen) ? quelle.reihen[k.schluessel] : undefined;
  }

  // Wendet eine Ableitung an: Rohwerte, Vormonatsdifferenz oder Vorjahresvergleich
  function punkteVon(k) {
    var r = reihe(k);
    if (!r || !r.punkte || !r.punkte.length) { return []; }
    var p = r.punkte.slice();

    if (k.ableitung === "diff") {
      var d = [];
      for (var i = 1; i < p.length; i++) {
        d.push({ d: p[i].d, v: p[i].v - p[i - 1].v });
      }
      return d;
    }
    if (k.ableitung === "qoq") {
      // Quartalsreihe: eine Periode zurueck
      var q = [];
      for (var h = 1; h < p.length; h++) {
        q.push({ d: p[h].d, v: ((p[h].v / p[h - 1].v) - 1) * 100 });
      }
      return q;
    }
    if (k.ableitung === "yoy") {
      // Quartalsreihe: vier Perioden zurueck, monatlich: zwoelf Perioden zurueck
      var schritt = k.ableitungSchritt || 4;
      var y = [];
      for (var j = schritt; j < p.length; j++) {
        y.push({ d: p[j].d, v: ((p[j].v / p[j - schritt].v) - 1) * 100 });
      }
      return y;
    }
    return p;
  }

  function zahl(wert, format) {
    if (wert === null || wert === undefined || isNaN(wert)) { return "–"; }
    switch (format) {
      case "tausend":
        return Math.round(wert).toLocaleString("de-DE");
      case "tausendDiff":
        return (wert > 0 ? "+" : "") + Math.round(wert).toLocaleString("de-DE");
      case "ganz":
        return Math.round(wert).toLocaleString("de-DE");
      case "prozent":
        return wert.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
      case "punkte":
        return wert.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
      case "dollar":
      case "faktor":
        return wert.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      default:
        return String(wert);
    }
  }

  // Veraenderung mit Vorzeichen. Erst runden, dann das Vorzeichen bestimmen,
  // damit ein Wert, der auf 0 rundet, als "±0,0" erscheint statt "−0,0".
  function nachkommastellen(format) {
    if (format === "tausend" || format === "ganz" || format === "tausendDiff") { return 0; }
    if (format === "dollar" || format === "faktor") { return 2; }
    return 1;
  }
  function gerundet(v, format) {
    var f = Math.pow(10, nachkommastellen(format));
    return Math.round(v * f) / f;
  }
  function veraenderungText(diff, format) {
    var r = gerundet(diff, format);
    var stellen = nachkommastellen(format);
    return (r > 0 ? "+" : r < 0 ? "−" : "±") +
      Math.abs(r).toLocaleString("de-DE", { minimumFractionDigits: stellen, maximumFractionDigits: stellen });
  }

  function einheitVon(k) {
    if (k.einheitFest !== undefined) { return k.einheitFest; }
    if (k.format === "prozent") {
      if (k.ableitung === "yoy") { return "% YoY"; }
      if (k.ableitung === "qoq") { return "% QoQ"; }
      return "%";
    }
    if (k.format === "punkte") { return "Punkte"; }
    if (k.format === "tausendDiff") { return "Tsd."; }
    if (k.format === "dollar") { return "USD"; }
    return k.einheitFest || "";
  }

  function datumText(iso, frequenz) {
    var t = iso.split("-");
    var jahr = t[0], monat = parseInt(t[1], 10), tag = t[2];
    if (frequenz === "woche") { return tag + "." + t[1] + "." + jahr; }
    if (frequenz === "quartal") { return "Q" + (Math.floor((monat - 1) / 3) + 1) + " " + jahr; }
    if (frequenz === "tag") { return tag + "." + t[1] + "." + jahr; }
    return MONATE[monat - 1] + " " + jahr;
  }

  function frequenzArt(k) {
    var r = reihe(k);
    var f = (r && r.frequenz) ? r.frequenz.toLowerCase() : "monthly";
    if (f.indexOf("dai") >= 0) { return "tag"; }
    if (f.indexOf("week") >= 0) { return "woche"; }
    if (f.indexOf("quarter") >= 0) { return "quartal"; }
    return "monat";
  }

  // Einstufung gegen den Schwellenwert aus dem Trading Plan, z.B. "unter 50, Kontraktion".
  // Variante mit mehreren Bereichen: k.stufen = [ { ueber: 52, text }, { ab: 48, text }, { text } ]
  // von oben nach unten gelesen, der erste passende Bereich gilt ("ueber" = groesser,
  // "ab" = groesser oder gleich, ohne Grenze = Rest).
  function stufeText(k, wert) {
    if (wert === null || wert === undefined || isNaN(wert)) { return null; }
    if (k.stufen) {
      for (var i = 0; i < k.stufen.length; i++) {
        var b = k.stufen[i];
        if (b.ueber !== undefined && wert > b.ueber) { return b.text; }
        if (b.ab !== undefined && wert >= b.ab) { return b.text; }
        if (b.ueber === undefined && b.ab === undefined) { return b.text; }
      }
      return null;
    }
    if (!k.stufe) { return null; }
    var g = k.stufe.grenze;
    var gText = String(g).replace(".", ",");
    if (wert > g) { return "über " + gText + ", " + k.stufe.ueber; }
    if (wert < g) { return "unter " + gText + ", " + k.stufe.unter; }
    return "genau " + gText + ", Grenzwert";
  }

  // Beschreibung der zweiten Linie als eigene kleine Kachel-Konfiguration
  function zweitKonfig(k) {
    if (!k.zweitreihe) { return null; }
    return {
      quelle: k.zweitreihe.quelle || k.quelle,
      schluessel: k.zweitreihe.schluessel,
      ableitung: k.zweitreihe.ableitung,
      ableitungSchritt: k.zweitreihe.ableitungSchritt,
      format: k.format
    };
  }

  // Serien-Regeln aus dem Trading Plan, z.B. "3 Monate unter 47".
  // k.serien = [ { unter: 47, anzahl: 3, text: "anhaltende Kontraktion" } ] (oder "ueber")
  // Zaehlt, wie viele Perioden am Stueck bis zum aktuellen Wert die Bedingung erfuellen.
  function serienKennwerte(k, punkte, art) {
    if (!k.serien || !punkte.length) { return []; }
    var einheitName = art === "woche" ? ["Woche", "Wochen"] : art === "quartal" ? ["Quartal", "Quartale"] : ["Monat", "Monate"];
    return k.serien.map(function (s) {
      var grenze = s.unter !== undefined ? s.unter : s.ueber;
      var n = 0;
      for (var i = punkte.length - 1; i >= 0; i--) {
        var ok = s.unter !== undefined ? punkte[i].v < s.unter : punkte[i].v > s.ueber;
        if (!ok) { break; }
        n++;
      }
      var titel = s.anzahl + " " + einheitName[1] + " " + (s.unter !== undefined ? "unter " : "über ") +
        zahl(grenze, k.format);
      var wert;
      if (n >= s.anzahl) {
        wert = "erreicht (" + n + " in Folge): " + s.text;
      } else if (n === 0) {
        wert = "nicht erfüllt";
      } else {
        wert = n + " von " + s.anzahl + " " + einheitName[1];
      }
      // Reicht die Serie bis zum ersten gespeicherten Wert, ist sie evtl. laenger
      if (n > 0 && n === punkte.length && n < s.anzahl) { wert += " (Verlauf zu kurz)"; }
      return { titel: titel, wert: wert };
    });
  }

  // Echte Historie: mindestens zwei Jahre zwischen erstem und letztem Wert
  function hatHistorie(punkte) {
    if (punkte.length < 2) { return false; }
    var tage = (new Date(punkte[punkte.length - 1].d) - new Date(punkte[0].d)) / 86400000;
    return tage >= 730;
  }

  /* --- Verlaufslinie auf der Kachel -------------------------------------- */

  function funkenlinie(punkte, richtungFarbe) {
    var n = Math.min(punkte.length, 40);
    var teil = punkte.slice(punkte.length - n);
    var breite = 200, hoehe = 34;

    if (teil.length < 2) {
      var leer = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      leer.setAttribute("viewBox", "0 0 " + breite + " " + hoehe);
      return leer;
    }

    var werte = teil.map(function (p) { return p.v; });
    var min = Math.min.apply(null, werte), max = Math.max.apply(null, werte);
    var spanne = (max - min) || 1;

    function x(i) { return (i / (teil.length - 1)) * breite; }
    function y(v) { return hoehe - 4 - ((v - min) / spanne) * (hoehe - 8); }

    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 " + breite + " " + hoehe);
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("aria-hidden", "true");

    var d = "";
    for (var i = 0; i < teil.length; i++) {
      d += (i === 0 ? "M" : "L") + x(i).toFixed(1) + " " + y(teil[i].v).toFixed(1);
    }

    var pfad = document.createElementNS("http://www.w3.org/2000/svg", "path");
    pfad.setAttribute("d", d);
    pfad.setAttribute("fill", "none");
    pfad.setAttribute("stroke", "var(--serie-1)");
    pfad.setAttribute("stroke-width", "2");
    pfad.setAttribute("stroke-linejoin", "round");
    pfad.setAttribute("stroke-linecap", "round");
    pfad.setAttribute("vector-effect", "non-scaling-stroke");
    svg.appendChild(pfad);

    // Endpunkt mit Ring in Flaechenfarbe, damit er sich abhebt
    var ring = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    ring.setAttribute("cx", x(teil.length - 1).toFixed(1));
    ring.setAttribute("cy", y(teil[teil.length - 1].v).toFixed(1));
    ring.setAttribute("r", "4");
    ring.setAttribute("fill", "var(--serie-1)");
    ring.setAttribute("stroke", "var(--flaeche)");
    ring.setAttribute("stroke-width", "2");
    ring.setAttribute("vector-effect", "non-scaling-stroke");
    svg.appendChild(ring);

    return svg;
  }

  /* --- Kachel ------------------------------------------------------------ */

  function deltaKlasse(diff, richtung) {
    if (diff === 0 || richtung === "neutral") { return "delta-neutral"; }
    var gut = richtung === "hoch_gut" ? diff > 0 : diff < 0;
    return gut ? "delta-gut" : "delta-schlecht";
  }

  function baueKachel(k) {
    var r = reihe(k);
    var punkte = punkteVon(k);
    var knopf = el("button", "kachel");
    knopf.type = "button";

    if (!r || !punkte.length) {
      knopf.appendChild(el("div", "kachel-titel", k.titel));
      knopf.appendChild(el("div", "kachel-wert", "–"));
      knopf.appendChild(el("div", "kachel-fuss", "keine Daten"));
      return knopf;
    }

    var letzter = punkte[punkte.length - 1];
    var art = frequenzArt(k);

    knopf.appendChild(el("div", "kachel-titel", k.titel));

    var wertzeile = el("div", "kachel-wertzeile");
    wertzeile.appendChild(el("span", "kachel-wert", zahl(letzter.v, k.format)));
    var einheit = einheitVon(k);
    if (einheit) { wertzeile.appendChild(el("span", "kachel-einheit", einheit)); }

    // Veraenderung gegenueber der Vorperiode
    var schritt = k.vergleich || 1;
    if (k.vergleichArt === "vorwert") {
      if (punkte.length > 1) {
        wertzeile.appendChild(el("span", "delta delta-neutral",
          k.vergleichName + " " + zahl(punkte[punkte.length - 2].v, k.format)));
      }
    } else if (punkte.length > schritt) {
      var vorher = punkte[punkte.length - 1 - schritt];
      var diff = letzter.v - vorher.v;
      wertzeile.appendChild(el("span", "delta " + deltaKlasse(gerundet(diff, k.format), k.richtung),
        veraenderungText(diff, k.format)));
    } else if (k.quelle === "web" && r.veraenderung !== undefined) {
      var vz = r.veraenderung;
      wertzeile.appendChild(el("span", "delta " + deltaKlasse(vz, k.richtung),
        (vz > 0 ? "+" : "−") + Math.abs(vz).toLocaleString("de-DE") + " %"));
    }
    knopf.appendChild(wertzeile);

    if (punkte.length >= 2) {
      var funken = el("div", "kachel-funken");
      funken.appendChild(funkenlinie(punkte, k.richtung));
      knopf.appendChild(funken);
    } else {
      // Ohne Verlauf: Einstufung statt leerer Linie
      var stufe = stufeText(k, letzter.v);
      var ersatz = el("div", "kachel-einstufung",
        stufe || (r.vormonat !== undefined ? "Vormonat " + zahl(r.vormonat, k.format) : ""));
      knopf.appendChild(ersatz);
    }

    var fuss = el("div", "kachel-fuss");
    fuss.appendChild(el("span", null, "Stand " + datumText(letzter.d, art)));
    if (punkte.length < 3) {
      var m = el("span", "marke marke-warnung");
      m.appendChild(el("span", "marke-punkt"));
      m.appendChild(el("span", null, "Verlauf im Aufbau"));
      fuss.appendChild(m);
    }
    knopf.appendChild(fuss);

    knopf.addEventListener("click", function () { oeffneDetail(k); });
    return knopf;
  }

  /* --- Grosser Graph ----------------------------------------------------- */

  // Ersatz fuer den Graph, solange nur ein einzelner Wert vorliegt
  function baueEinzelwert(k, punkte) {
    var r = reihe(k);
    var box = el("div", "einzelwert");
    if (!punkte.length) {
      box.appendChild(el("p", "hinweis", "Keine Daten vorhanden."));
      return box;
    }
    var letzter = punkte[punkte.length - 1];
    var einheit = einheitVon(k);

    var zeile = el("div", "einzelwert-zeile");
    zeile.appendChild(el("span", "einzelwert-zahl", zahl(letzter.v, k.format)));
    if (einheit) { zeile.appendChild(el("span", "einzelwert-einheit", einheit)); }
    box.appendChild(zeile);

    box.appendChild(el("div", "einzelwert-monat",
      "Berichtsmonat " + datumText(letzter.d, frequenzArt(k))));

    var stufe = stufeText(k, letzter.v);
    if (stufe) {
      box.appendChild(el("div", "einzelwert-stufe", zahl(letzter.v, k.format) + " – " + stufe));
    }

    if (r && r.vormonat !== undefined) {
      var vergleich = "Vormonat " + zahl(r.vormonat, k.format);
      if (r.veraenderung !== undefined) {
        vergleich += " · Veränderung " + (r.veraenderung > 0 ? "+" : r.veraenderung < 0 ? "−" : "±") +
          Math.abs(r.veraenderung).toLocaleString("de-DE") + " %";
      }
      box.appendChild(el("div", "einzelwert-stufe", vergleich));
    }

    box.appendChild(el("p", "hinweis einzelwert-hinweis",
      "Noch kein Verlauf vorhanden. Das Dashboard speichert ab jetzt jeden Monatswert und baut den Graph selbst auf."));
    return box;
  }

  var aktuelleKachel = null;
  var aktuellerZeitraum = "alle";
  var tabelleSichtbar = false;

  function gefiltert(punkte, zeitraum) {
    if (zeitraum === "alle" || !punkte.length) { return punkte; }
    var jahre = parseInt(zeitraum, 10);
    var grenze = new Date(punkte[punkte.length - 1].d);
    grenze.setFullYear(grenze.getFullYear() - jahre);
    return punkte.filter(function (p) { return new Date(p.d) >= grenze; });
  }

  function zeichneGraph(k, punkte, zweit) {
    var behaelter = document.getElementById("graphBehaelter");
    behaelter.innerHTML = "";
    document.getElementById("graphLegende").innerHTML = "";
    if (punkte.length < 2) {
      behaelter.appendChild(baueEinzelwert(k, punkte));
      return;
    }

    var B = 860, H = 340;
    var randL = 56, randR = 18, randO = 16, randU = 34;
    var plotB = B - randL - randR, plotH = H - randO - randU;
    var art = frequenzArt(k);

    var alle = punkte.map(function (p) { return p.v; });
    if (zweit) { alle = alle.concat(zweit.punkte.map(function (p) { return p.v; })); }
    if (k.schwellen) {
      k.schwellen.forEach(function (s) { alle.push(s.wert); });
    }
    var min = Math.min.apply(null, alle), max = Math.max.apply(null, alle);
    var luft = (max - min) * 0.12 || 1;
    min -= luft; max += luft;

    function x(i, n) { return randL + (i / (n - 1)) * plotB; }
    function y(v) { return randO + plotH - ((v - min) / (max - min)) * plotH; }

    var NS = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 " + B + " " + H);
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "Verlauf " + k.titel);

    // Waagerechte Hilfslinien, bewusst zurueckhaltend und durchgezogen
    var stufen = 5;
    for (var s = 0; s <= stufen; s++) {
      var wert = min + ((max - min) / stufen) * s;
      var yy = y(wert);
      var linie = document.createElementNS(NS, "line");
      linie.setAttribute("x1", randL); linie.setAttribute("x2", B - randR);
      linie.setAttribute("y1", yy.toFixed(1)); linie.setAttribute("y2", yy.toFixed(1));
      linie.setAttribute("stroke", "var(--raster)");
      linie.setAttribute("stroke-width", "1");
      svg.appendChild(linie);

      var tick = document.createElementNS(NS, "text");
      tick.setAttribute("x", randL - 9);
      tick.setAttribute("y", (yy + 4).toFixed(1));
      tick.setAttribute("text-anchor", "end");
      tick.setAttribute("font-size", "11");
      tick.setAttribute("fill", "var(--text-stumm)");
      tick.setAttribute("style", "font-variant-numeric: tabular-nums");
      tick.textContent = zahl(wert, k.format === "tausendDiff" ? "tausend" : k.format);
      svg.appendChild(tick);
    }

    // Schwellenwerte aus dem Trading Plan
    if (k.schwellen) {
      k.schwellen.forEach(function (sch) {
        if (sch.wert < min || sch.wert > max) { return; }
        var sy = y(sch.wert);
        var sl = document.createElementNS(NS, "line");
        sl.setAttribute("x1", randL); sl.setAttribute("x2", B - randR);
        sl.setAttribute("y1", sy.toFixed(1)); sl.setAttribute("y2", sy.toFixed(1));
        sl.setAttribute("stroke", "var(--achse)");
        sl.setAttribute("stroke-width", "1.5");
        svg.appendChild(sl);

        var st = document.createElementNS(NS, "text");
        st.setAttribute("x", B - randR);
        st.setAttribute("y", (sy - 6).toFixed(1));
        st.setAttribute("text-anchor", "end");
        st.setAttribute("font-size", "11");
        st.setAttribute("fill", "var(--text-sekundaer)");
        st.textContent = sch.text;
        svg.appendChild(st);
      });
    }

    // Zeitachse: hoechstens sechs Beschriftungen
    var schrittX = Math.max(1, Math.floor(punkte.length / 6));
    for (var i = 0; i < punkte.length; i += schrittX) {
      var tx = document.createElementNS(NS, "text");
      tx.setAttribute("x", x(i, punkte.length).toFixed(1));
      tx.setAttribute("y", H - 12);
      tx.setAttribute("text-anchor", "middle");
      tx.setAttribute("font-size", "11");
      tx.setAttribute("fill", "var(--text-stumm)");
      tx.textContent = punkte[i].d.slice(0, 7).split("-").reverse().join("/");
      svg.appendChild(tx);
    }

    function linienPfad(daten, farbe, flaeche) {
      var d = "";
      for (var i = 0; i < daten.length; i++) {
        d += (i === 0 ? "M" : "L") + x(i, daten.length).toFixed(1) + " " + y(daten[i].v).toFixed(1);
      }
      if (flaeche) {
        var f = document.createElementNS(NS, "path");
        f.setAttribute("d", d + "L" + x(daten.length - 1, daten.length).toFixed(1) + " " + (randO + plotH) +
                            "L" + randL + " " + (randO + plotH) + "Z");
        f.setAttribute("fill", farbe);
        f.setAttribute("opacity", "0.10");
        svg.appendChild(f);
      }
      var p = document.createElementNS(NS, "path");
      p.setAttribute("d", d);
      p.setAttribute("fill", "none");
      p.setAttribute("stroke", farbe);
      p.setAttribute("stroke-width", "2");
      p.setAttribute("stroke-linejoin", "round");
      p.setAttribute("stroke-linecap", "round");
      svg.appendChild(p);
    }

    if (zweit) { linienPfad(zweit.punkte, "var(--serie-2)", false); }
    linienPfad(punkte, "var(--serie-1)", !zweit);

    // Fadenkreuz und Ablesepunkte
    var kreuz = document.createElementNS(NS, "line");
    kreuz.setAttribute("stroke", "var(--achse)");
    kreuz.setAttribute("stroke-width", "1");
    kreuz.setAttribute("y1", randO);
    kreuz.setAttribute("y2", randO + plotH);
    kreuz.setAttribute("opacity", "0");
    svg.appendChild(kreuz);

    function punktMarke(farbe) {
      var c = document.createElementNS(NS, "circle");
      c.setAttribute("r", "4.5");
      c.setAttribute("fill", farbe);
      c.setAttribute("stroke", "var(--flaeche)");
      c.setAttribute("stroke-width", "2");
      c.setAttribute("opacity", "0");
      svg.appendChild(c);
      return c;
    }
    var marke1 = punktMarke("var(--serie-1)");
    var marke2 = zweit ? punktMarke("var(--serie-2)") : null;

    behaelter.appendChild(svg);

    var tooltip = el("div", "tooltip");
    tooltip.style.display = "none";
    behaelter.appendChild(tooltip);

    function zeige(klientX) {
      var kasten = svg.getBoundingClientRect();
      var rel = (klientX - kasten.left) / kasten.width * B;
      var anteil = (rel - randL) / plotB;
      var idx = Math.round(anteil * (punkte.length - 1));
      if (idx < 0) { idx = 0; }
      if (idx > punkte.length - 1) { idx = punkte.length - 1; }

      var px = x(idx, punkte.length);
      kreuz.setAttribute("x1", px.toFixed(1));
      kreuz.setAttribute("x2", px.toFixed(1));
      kreuz.setAttribute("opacity", "1");

      marke1.setAttribute("cx", px.toFixed(1));
      marke1.setAttribute("cy", y(punkte[idx].v).toFixed(1));
      marke1.setAttribute("opacity", "1");

      tooltip.innerHTML = "";
      tooltip.appendChild(el("div", "tooltip-datum", datumText(punkte[idx].d, art)));

      function zeile(farbe, name, wert, einheit) {
        var z = el("div", "tooltip-zeile");
        var strich = el("span", "legende-strich");
        strich.style.background = farbe;
        z.appendChild(strich);
        z.appendChild(el("span", "tooltip-wert", zahl(wert, k.format) + (einheit ? " " + einheit : "")));
        z.appendChild(el("span", "tooltip-name", name));
        tooltip.appendChild(z);
      }
      zeile("var(--serie-1)", k.hauptName || k.titel, punkte[idx].v, einheitVon(k));

      if (zweit && zweit.punkte[idx]) {
        marke2.setAttribute("cx", px.toFixed(1));
        marke2.setAttribute("cy", y(zweit.punkte[idx].v).toFixed(1));
        marke2.setAttribute("opacity", "1");
        zeile("var(--serie-2)", zweit.name, zweit.punkte[idx].v, zweit.einheit);
      }

      tooltip.style.display = "block";
      var links = (px / B) * behaelter.clientWidth + 14;
      if (links + tooltip.offsetWidth > behaelter.clientWidth) {
        links = (px / B) * behaelter.clientWidth - tooltip.offsetWidth - 14;
      }
      tooltip.style.left = Math.max(0, links) + "px";
      tooltip.style.top = "10px";
    }

    function verstecke() {
      kreuz.setAttribute("opacity", "0");
      marke1.setAttribute("opacity", "0");
      if (marke2) { marke2.setAttribute("opacity", "0"); }
      tooltip.style.display = "none";
    }

    svg.addEventListener("pointermove", function (e) { zeige(e.clientX); });
    svg.addEventListener("pointerleave", verstecke);
    svg.addEventListener("pointerdown", function (e) { zeige(e.clientX); });

    // Legende nur bei zwei Reihen
    var legende = document.getElementById("graphLegende");
    legende.innerHTML = "";
    if (zweit) {
      [[k.hauptName || k.titel, "var(--serie-1)"], [zweit.name, "var(--serie-2)"]].forEach(function (eintrag) {
        var e2 = el("span", "legende-eintrag");
        var st2 = el("span", "legende-strich");
        st2.style.background = eintrag[1];
        e2.appendChild(st2);
        e2.appendChild(el("span", null, eintrag[0]));
        legende.appendChild(e2);
      });
    }
  }

  /* --- Tabellenansicht --------------------------------------------------- */

  function baueTabelle(k, punkte, zweit) {
    var behaelter = document.getElementById("tabelleBehaelter");
    behaelter.innerHTML = "";
    var art = frequenzArt(k);
    var tab = el("table");
    var kopf = el("thead");
    var kz = el("tr");
    kz.appendChild(el("th", null, "Zeitpunkt"));
    var thW = el("th", null, (k.hauptName || k.titel) + (einheitVon(k) ? " (" + einheitVon(k) + ")" : ""));
    thW.style.textAlign = "right";
    kz.appendChild(thW);
    if (zweit) {
      var thZ = el("th", null, zweit.name + (zweit.einheit ? " (" + zweit.einheit + ")" : ""));
      thZ.style.textAlign = "right";
      kz.appendChild(thZ);
    }
    kopf.appendChild(kz);
    tab.appendChild(kopf);

    var koerper = el("tbody");
    for (var i = punkte.length - 1; i >= 0; i--) {
      var z = el("tr");
      z.appendChild(el("td", null, datumText(punkte[i].d, art)));
      z.appendChild(el("td", "zahl", zahl(punkte[i].v, k.format)));
      if (zweit) { z.appendChild(el("td", "zahl", zahl(zweit.punkte[i].v, k.format))); }
      koerper.appendChild(z);
    }
    tab.appendChild(koerper);
    behaelter.appendChild(tab);
  }

  /* --- Kategorie-Aufschluesselung ---------------------------------------
     Balkenuebersicht unter dem Graph: je Kategorie die Veraenderungsrate zum
     gleichen Berichtsmonat wie der Hauptwert, sortiert nach Hoehe. Eine
     Serienfarbe, Nulllinie als Basis, senkrechte Linie fuer den Hauptwert.
     Konfiguration an der Kachel: aufschluesselung = { titel, hinweis,
     kategorien: [ { schluessel, name } ] }
     ---------------------------------------------------------------------- */

  function baueAufschluesselung(k) {
    var ziel = document.getElementById("aufschluesselung");
    if (!ziel) { return; }
    ziel.innerHTML = "";
    ziel.hidden = true;
    var a = k.aufschluesselung;
    if (!a) { return; }

    var haupt = punkteVon(k);
    if (!haupt.length) { return; }
    var hauptWert = haupt[haupt.length - 1].v;
    var stichtag = haupt[haupt.length - 1].d;
    var art = frequenzArt(k);
    var einheit = einheitVon(k);

    var zeilen = [];
    a.kategorien.forEach(function (kat) {
      var p = punkteVon({
        quelle: kat.quelle || k.quelle,
        schluessel: kat.schluessel,
        ableitung: k.ableitung,
        ableitungSchritt: k.ableitungSchritt
      });
      if (!p.length) { return; }
      var idx = -1;
      for (var i = p.length - 1; i >= 0; i--) {
        if (p[i].d === stichtag) { idx = i; break; }
      }
      var abweichend = idx < 0;
      if (abweichend) { idx = p.length - 1; }
      zeilen.push({
        name: kat.name,
        wert: p[idx].v,
        vorher: idx > 0 ? p[idx - 1].v : null,
        d: p[idx].d,
        abweichend: abweichend
      });
    });
    if (!zeilen.length) { return; }
    zeilen.sort(function (x, y) { return y.wert - x.wert; });

    var alle = zeilen.map(function (z) { return z.wert; }).concat([0, hauptWert]);
    var min = Math.min.apply(null, alle), max = Math.max.apply(null, alle);
    var spanne = (max - min) || 1;
    function pos(v) { return ((v - min) / spanne) * 100; }

    ziel.appendChild(el("h3", "aufschl-titel", a.titel + " · " + datumText(stichtag, art)));
    if (a.hinweis) { ziel.appendChild(el("p", "aufschl-hinweis", a.hinweis)); }

    var liste = el("div", "aufschl-liste");
    liste.setAttribute("role", "table");
    liste.setAttribute("aria-label", a.titel);

    // Kopfzeile mit Beschriftung der Hauptwert-Linie
    var kopf = el("div", "aufschl-zeile aufschl-kopf");
    kopf.setAttribute("role", "row");
    kopf.appendChild(el("span", "aufschl-name", "Kategorie"));
    var kopfSpur = el("span", "aufschl-spur");
    var marke = el("span", "aufschl-marke-text", (k.hauptName || k.titel) + " " + zahl(hauptWert, k.format) + " %");
    var markePos = pos(hauptWert);
    if (markePos > 60) {
      marke.style.right = (100 - markePos) + "%";
      marke.style.textAlign = "right";
    } else {
      marke.style.left = markePos + "%";
    }
    kopfSpur.appendChild(marke);
    kopf.appendChild(kopfSpur);
    kopf.appendChild(el("span", "aufschl-zahl", einheit));
    kopf.appendChild(el("span", "aufschl-zahl", "ggü. Vormonat"));
    liste.appendChild(kopf);

    var fussnote = false;
    zeilen.forEach(function (z) {
      var zeile = el("div", "aufschl-zeile");
      zeile.setAttribute("role", "row");
      zeile.appendChild(el("span", "aufschl-name", z.name + (z.abweichend ? " *" : "")));
      if (z.abweichend) { fussnote = true; }

      var spur = el("span", "aufschl-spur");
      var null0 = el("span", "aufschl-null");
      null0.style.left = pos(0) + "%";
      spur.appendChild(null0);

      var hauptLinie = el("span", "aufschl-hauptlinie");
      hauptLinie.style.left = pos(hauptWert) + "%";
      spur.appendChild(hauptLinie);

      var balken = el("span", "aufschl-balken" + (z.wert < 0 ? " negativ" : ""));
      var von = Math.min(pos(0), pos(z.wert));
      var breite = Math.abs(pos(z.wert) - pos(0));
      balken.style.left = von + "%";
      balken.style.width = breite + "%";
      spur.appendChild(balken);
      zeile.appendChild(spur);

      zeile.appendChild(el("span", "aufschl-zahl aufschl-wert", zahl(z.wert, k.format)));
      zeile.appendChild(el("span", "aufschl-zahl aufschl-diff",
        z.vorher === null ? "–" : veraenderungText(z.wert - z.vorher, k.format)));

      // Tooltip je Zeile
      zeile.addEventListener("pointerenter", function () { zeigeTipp(zeile, z); });
      zeile.addEventListener("pointerleave", versteckeTipp);
      zeile.addEventListener("pointerdown", function () { zeigeTipp(zeile, z); });
      liste.appendChild(zeile);
    });

    ziel.appendChild(liste);

    if (fussnote) {
      ziel.appendChild(el("p", "aufschl-hinweis",
        "* Für diese Kategorie liegt der Berichtsmonat noch nicht vor, gezeigt wird der letzte verfügbare Wert."));
    }

    var tipp = el("div", "tooltip");
    tipp.style.display = "none";
    ziel.appendChild(tipp);

    function zeigeTipp(zeile, z) {
      tipp.innerHTML = "";
      tipp.appendChild(el("div", "tooltip-datum", z.name + " · " + datumText(z.d, art)));
      var z1 = el("div", "tooltip-zeile");
      z1.appendChild(el("span", "tooltip-wert", zahl(z.wert, k.format) + " " + einheit));
      z1.appendChild(el("span", "tooltip-name", "aktuell"));
      tipp.appendChild(z1);
      if (z.vorher !== null) {
        var z2 = el("div", "tooltip-zeile");
        z2.appendChild(el("span", "tooltip-wert", zahl(z.vorher, k.format) + " " + einheit));
        z2.appendChild(el("span", "tooltip-name", "Vormonat"));
        tipp.appendChild(z2);
      }
      var z3 = el("div", "tooltip-zeile");
      z3.appendChild(el("span", "tooltip-wert", veraenderungText(z.wert - hauptWert, k.format)));
      z3.appendChild(el("span", "tooltip-name", "Prozentpunkte zum Hauptwert"));
      tipp.appendChild(z3);
      tipp.style.display = "block";
      tipp.style.top = (zeile.offsetTop + zeile.offsetHeight + 4) + "px";
      tipp.style.left = Math.max(0, ziel.clientWidth - tipp.offsetWidth) / 2 + "px";
    }
    function versteckeTipp() { tipp.style.display = "none"; }

    ziel.hidden = false;
  }

  /* --- Detailansicht ----------------------------------------------------- */

  function zeichneAlles() {
    var k = aktuelleKachel;
    var alle = punkteVon(k);
    var punkte = gefiltert(alle, aktuellerZeitraum);
    var zweit = null;

    // Zweite Linie: nur Zeitpunkte, die in beiden Reihen vorkommen
    var zk = zweitKonfig(k);
    if (zk) {
      var nachDatum = {};
      punkteVon(zk).forEach(function (p) { nachDatum[p.d] = p.v; });
      var gemeinsam = alle.filter(function (p) { return nachDatum[p.d] !== undefined; });
      if (gemeinsam.length >= 2) {
        punkte = gefiltert(gemeinsam, aktuellerZeitraum);
        zweit = {
          punkte: punkte.map(function (p) { return { d: p.d, v: nachDatum[p.d] }; }),
          name: k.zweitreihe.name,
          einheit: einheitVon(zk)
        };
      }
    }

    zeichneGraph(k, punkte, zweit);
    baueTabelle(k, punkte, zweit);
  }

  function kennwert(titel, wert) {
    var box = el("div", "kennwert");
    box.appendChild(el("div", "kennwert-titel", titel));
    box.appendChild(el("div", "kennwert-wert", wert));
    return box;
  }

  function oeffneDetail(k) {
    aktuelleKachel = k;
    aktuellerZeitraum = "alle";
    tabelleSichtbar = false;

    var r = reihe(k);
    var punkte = punkteVon(k);
    var art = frequenzArt(k);

    document.getElementById("detailTitel").textContent = k.titel;
    document.getElementById("detailUnter").textContent = k.untertitel;
    document.getElementById("detailFrage").textContent = k.frage;

    // Kennwerte
    var kw = document.getElementById("detailKennwerte");
    kw.innerHTML = "";
    // Bei nur einem Wert steht alles im Einzelwert-Block, Kennwerte waeren doppelt
    kw.hidden = punkte.length < 2;
    document.getElementById("steuerzeile").hidden = punkte.length < 2;
    if (punkte.length >= 2) {
      var letzter = punkte[punkte.length - 1];
      var einheit = einheitVon(k) ? " " + einheitVon(k) : "";
      kw.appendChild(kennwert("Aktuell", zahl(letzter.v, k.format) + einheit));
      kw.appendChild(kennwert("Berichtsstand", datumText(letzter.d, art)));

      var stufe = stufeText(k, letzter.v);
      if (stufe) { kw.appendChild(kennwert("Einstufung", stufe)); }

      serienKennwerte(k, punkte, art).forEach(function (s) {
        kw.appendChild(kennwert(s.titel, s.wert));
      });

      var zk = zweitKonfig(k);
      if (zk && k.zweitreihe.kennwert) {
        var zp = punkteVon(zk);
        if (zp.length) {
          kw.appendChild(kennwert(k.zweitreihe.kennwert,
            zahl(zp[zp.length - 1].v, k.format) + " " + einheitVon(zk)));
        }
      }

      var schritt = k.vergleich || 1;
      if (k.vergleichArt === "vorwert") {
        kw.appendChild(kennwert(k.vergleichName,
          zahl(punkte[punkte.length - 2].v, k.format) + einheit));
      } else if (punkte.length > schritt) {
        var diff = letzter.v - punkte[punkte.length - 1 - schritt].v;
        kw.appendChild(kennwert("Ggü. " + (k.vergleichName || "Vorperiode"),
          veraenderungText(diff, k.format) + einheit));
      }

      // Trend ueber ein festes Fenster, z.B. die 8 Wochen aus dem Trading Plan
      if (k.trendFenster && punkte.length > k.trendFenster) {
        var alt = punkte[punkte.length - 1 - k.trendFenster].v;
        var richtungText = letzter.v > alt ? "steigend" : letzter.v < alt ? "fallend" : "seitwärts";
        var fensterName = art === "woche" ? " Wochen" : art === "quartal" ? " Quartale" : " Monate";
        kw.appendChild(kennwert("Trend " + k.trendFenster + fensterName, richtungText));
      }

      // Spanne nur bei echter Historie, Startjahr aus den Daten statt fest "2015"
      if (hatHistorie(punkte)) {
        var werte = punkte.map(function (p) { return p.v; });
        kw.appendChild(kennwert("Spanne seit " + punkte[0].d.slice(0, 4),
          zahl(Math.min.apply(null, werte), k.format) + " – " + zahl(Math.max.apply(null, werte), k.format)));
      }
    }

    // Zeitraumknoepfe
    var zr = document.getElementById("zeitraum");
    zr.innerHTML = "";
    var optionen = art === "woche"
      ? [["1", "1 Jahr"], ["2", "2 Jahre"], ["5", "5 Jahre"], ["alle", "Alles"]]
      : [["1", "1 Jahr"], ["3", "3 Jahre"], ["5", "5 Jahre"], ["alle", "Alles"]];

    optionen.forEach(function (o) {
      var b = el("button", null, o[1]);
      b.type = "button";
      b.setAttribute("aria-pressed", o[0] === aktuellerZeitraum ? "true" : "false");
      b.addEventListener("click", function () {
        aktuellerZeitraum = o[0];
        Array.prototype.forEach.call(zr.children, function (c) {
          c.setAttribute("aria-pressed", c === b ? "true" : "false");
        });
        zeichneAlles();
      });
      zr.appendChild(b);
    });

    // Quelle und Einordnung
    var q = document.getElementById("detailQuelle");
    q.innerHTML = "";
    q.appendChild(document.createTextNode("Quelle: "));
    var a = el("a", null, r ? r.quelle : "–");
    if (r && r.quelleUrl) { a.href = r.quelleUrl; a.target = "_blank"; a.rel = "noopener"; }
    q.appendChild(a);
    if (r && r.aktualisiert) {
      q.appendChild(document.createTextNode(" · aktualisiert " + String(r.aktualisiert).slice(0, 10)));
    } else if (r && r.abgerufen) {
      q.appendChild(document.createTextNode(" · abgerufen " + String(r.abgerufen).slice(0, 10)));
    }

    document.getElementById("detailHinweis").textContent = k.einordnung;

    // Tabelle zuruecksetzen
    document.getElementById("tabelleBehaelter").hidden = true;
    document.getElementById("ansichtSchalter").textContent = "Tabelle anzeigen";

    document.getElementById("overlay").hidden = false;
    document.body.style.overflow = "hidden";
    zeichneAlles();
    baueAufschluesselung(k);
    document.getElementById("schliessen").focus();
  }

  function schliesseDetail() {
    document.getElementById("overlay").hidden = true;
    document.body.style.overflow = "";
  }

  /* --- Aufbau ------------------------------------------------------------ */

  function baueAlles() {
    var bereichsWurzel = document.getElementById("kachelbereiche");
    // Ohne Kachel-Grundgeruest (z.B. wenn motor.js nur zum Nachrechnen der
    // Werte fuer den PDF-Report geladen wird) gibt es hier nichts zu tun.
    if (!bereichsWurzel) { return; }

    // Abschnitte (Gruppen) dynamisch aus der Konfiguration aufbauen
    var raster = {};
    GRUPPEN.forEach(function (g) {
      var abschnitt = el("section", "gruppe");
      abschnitt.setAttribute("aria-labelledby", "g-" + g.id);
      var h2 = el("h2", null, g.titel);
      h2.id = "g-" + g.id;
      abschnitt.appendChild(h2);
      if (g.hinweis) { abschnitt.appendChild(el("p", "gruppe-hinweis", g.hinweis)); }
      var rasterDiv = el("div", "kachel-raster");
      rasterDiv.id = "raster-" + g.id;
      abschnitt.appendChild(rasterDiv);
      bereichsWurzel.appendChild(abschnitt);
      raster[g.id] = rasterDiv;
    });

    KACHELN.forEach(function (k) {
      var ziel = raster[k.gruppe];
      if (ziel) { ziel.appendChild(baueKachel(k)); }
    });

    // Fussstand: erste verfuegbare "erzeugt"-Angabe unter den Quellen
    var stand = "";
    for (var name in QUELLEN) {
      if (QUELLEN[name] && QUELLEN[name].erzeugt) { stand = QUELLEN[name].erzeugt; break; }
    }
    document.getElementById("fussStand").textContent = stand ? "Daten abgerufen: " + stand : "";

    document.getElementById("schliessen").addEventListener("click", schliesseDetail);
    document.getElementById("overlay").addEventListener("click", function (e) {
      if (e.target === this) { schliesseDetail(); }
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !document.getElementById("overlay").hidden) { schliesseDetail(); }
    });

    document.getElementById("ansichtSchalter").addEventListener("click", function () {
      tabelleSichtbar = !tabelleSichtbar;
      document.getElementById("tabelleBehaelter").hidden = !tabelleSichtbar;
      this.textContent = tabelleSichtbar ? "Tabelle ausblenden" : "Tabelle anzeigen";
    });

    var schalter = document.getElementById("themaSchalter");
    var gespeichert = null;
    try { gespeichert = localStorage.getItem("dashboard-thema"); } catch (e) { }
    if (gespeichert) { document.documentElement.setAttribute("data-theme", gespeichert); }
    schalter.addEventListener("click", function () {
      var neu = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", neu);
      try { localStorage.setItem("dashboard-thema", neu); } catch (e) { }
      if (!document.getElementById("overlay").hidden) { zeichneAlles(); }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", baueAlles);
  } else {
    baueAlles();
  }

  // Berechnungsfunktionen fuer Wiederverwendung ausserhalb der Kachel-Anzeige
  // (aktuell: pdf-report.js auf der Startseite). Bewusst keine Logik doppelt
  // gepflegt - der PDF-Report rechnet exakt so wie die Kacheln selbst.
  window.MOTOR = {
    reihe: reihe,
    punkteVon: punkteVon,
    zahl: zahl,
    veraenderungText: veraenderungText,
    gerundet: gerundet,
    deltaKlasse: deltaKlasse,
    stufeText: stufeText,
    einheitVon: einheitVon,
    datumText: datumText,
    frequenzArt: frequenzArt
  };

})();
