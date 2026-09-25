/* ===========================================================================
   Regime-Ansicht (Version 2, 2026-09-25)

   Baut den kompletten oberen Teil der Regime-Seite: ZSK-Spread-Chart mit
   Regime-Hintergrund, die beiden Renditecharts (US02Y, US10Y), die
   IPDA-Tabelle mit Abgleichspalte, die beiden Regime-Kaesten und die drei
   Nachschlage-Dialoge (Sharp Ratios, Core Setups, Info).

   Grundlage: Felix' Vorgabe vom 2026-09-25 (Regime.pptx in 02_Raw) und die
   Berechnungslogik aus seiner Excel-Tabelle.

   Die Regime-Berechnung liegt bewusst hier im Browser und nicht im
   PowerShell-Skript: Beim Umschalten zwischen D1 und W1 wird das Regime auf
   der jeweiligen Zeitebene neu gerechnet, das geht nur zur Laufzeit.

   Zwei Zeitfenster, gleiche Regel:
     IPDA-Regime  = aktueller Wert minus Wert vor 20 Perioden (IPDA-Zyklus)
     Tages-Regime = aktueller Wert minus Wert vor  3 Perioden

   Einstufung (identisch zu Felix' Excel):
     beide Renditen steigen + Spread weitet  = Bear Steepener
     beide Renditen steigen + Spread verengt = Bear Flattener
     beide Renditen fallen  + Spread weitet  = Bull Steepener
     beide Renditen fallen  + Spread verengt = Bull Flattener
     Renditen gegenlaeufig, Spread weitet    = Steepenertwist
     Renditen gegenlaeufig, Spread verengt   = Flattenertwist
   =========================================================================== */
(function () {
  "use strict";

  var D = window.REGIME_DATEN;
  if (!D || !D.reihen || !D.reihen.DGS2 || !D.reihen.DGS10) { return; }

  var WURZEL = document.getElementById("regimeKopf");
  if (!WURZEL) { return; }

  var FENSTER_IPDA = 20;
  var FENSTER_TAG = 3;

  /* Welches Regime faerbt den Hintergrund des ZSK-Charts?
     "tag"  = 3-Perioden-Regime (Vorgabe Felix, 2026-09-25)
     "ipda" = 20-Perioden-Regime (breitere, ruhigere Baender)
     Eine Zeile aendern genuegt, der Rest der Seite bleibt gleich. */
  var BAND_FELD = "tag";

  /* --- Regime-Stammdaten ---------------------------------------------------
     Zuordnung Regime -> Quadrant nach der Info-Tabelle aus Regime.pptx.
     Farben: Bull Steepener orange, Bear Steepener hellgruen,
     Bull Flattener hellrot, Bear Flattener dunkelrot, Twist grau.        */
  var REGIME = {
    "Bull Steepener": { klasse: "r-bullsteep", quadrant: "Q1: Goldilocks" },
    "Bear Steepener": { klasse: "r-bearsteep", quadrant: "Q2: Reflation" },
    "Bull Flattener": { klasse: "r-bullflat", quadrant: "Q3: Stagflation" },
    "Bear Flattener": { klasse: "r-bearflat", quadrant: "Q4: Deflation" },
    "Steepenertwist": { klasse: "r-twist", quadrant: "Übergang" },
    "Flattenertwist": { klasse: "r-twist", quadrant: "Übergang" },
    "Neutral": { klasse: "r-twist", quadrant: "–" }
  };

  function regimeKlasse(label) {
    return (label && REGIME[label]) ? REGIME[label].klasse : "r-leer";
  }

  /* --- Kleine Helfer -------------------------------------------------------- */
  function el(tag, klasse, text) {
    var n = document.createElement(tag);
    if (klasse) { n.className = klasse; }
    if (text !== undefined && text !== null) { n.textContent = String(text); }
    return n;
  }

  function datumText(iso) {
    if (!iso) { return "–"; }
    var t = iso.split("-");
    return t[2] + "." + t[1] + "." + t[0];
  }

  // Erst runden, dann Vorzeichen setzen (Projektkonvention: "±0,00" statt "−0,00")
  function zahl(v, dez) {
    if (v === null || v === undefined || isNaN(v)) { return "–"; }
    return v.toFixed(dez).replace(".", ",");
  }

  function zahlDelta(v, dez) {
    if (v === null || v === undefined || isNaN(v)) { return "–"; }
    var g = Number(v.toFixed(dez));
    var txt = Math.abs(g).toFixed(dez).replace(".", ",");
    if (g > 0) { return "+" + txt; }
    if (g < 0) { return "−" + txt; }
    return "±0" + (dez > 0 ? "," + new Array(dez + 1).join("0") : "");
  }

  function deltaKlasse(v) {
    if (v === null || v === undefined || isNaN(v)) { return ""; }
    var g = Number(v.toFixed(4));
    if (g > 0) { return "dz-plus"; }
    if (g < 0) { return "dz-minus"; }
    return "dz-null";
  }

  // Rundet Rechenrauschen weg. Renditen haben zwei Nachkommastellen,
  // vier Stellen sind also sicher und verhindern falsche Vorzeichen
  // durch Gleitkomma-Reste wie 5.0 - 4.74 = 0.2600000000000002.
  function r4(v) { return Math.round(v * 10000) / 10000; }

  /* --- Einstufung ----------------------------------------------------------- */
  function klassifiziere(d2, d10, dSpread) {
    d2 = r4(d2); d10 = r4(d10); dSpread = r4(dSpread);
    if (d2 > 0 && d10 > 0) { return dSpread >= 0 ? "Bear Steepener" : "Bear Flattener"; }
    if (d2 < 0 && d10 < 0) { return dSpread >= 0 ? "Bull Steepener" : "Bull Flattener"; }
    if (d2 > 0 && d10 < 0) { return "Flattenertwist"; }
    if (d2 < 0 && d10 > 0) { return "Steepenertwist"; }
    return "Neutral";
  }

  /* --- Datenaufbereitung ---------------------------------------------------- */
  // ZSK wird bewusst selbst gerechnet (10Y minus 2Y), nicht aus FRED T10Y2Y
  // uebernommen: so kann der Spread nie zu einem Tag gehoeren, an dem eine
  // der beiden Renditen fehlt.
  function baueBasis() {
    var m2 = {}, reihe = [];
    (D.reihen.DGS2.punkte || []).forEach(function (p) { m2[p.d] = p.v; });
    (D.reihen.DGS10.punkte || []).forEach(function (p) {
      if (m2[p.d] === undefined || p.v === null) { return; }
      reihe.push({ d: p.d, y2: m2[p.d], y10: p.v, sp: r4(p.v - m2[p.d]) });
    });
    return reihe;
  }

  // Wochenwert = letzter Handelstag der Kalenderwoche (in der Regel Freitag)
  function wochenSchluessel(iso) {
    var t = new Date(iso + "T00:00:00Z");
    var tag = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - tag);
    var jahrStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    var kw = Math.ceil((((t - jahrStart) / 86400000) + 1) / 7);
    return t.getUTCFullYear() + "-" + (kw < 10 ? "0" : "") + kw;
  }

  function zuWochen(basis) {
    var map = {}, folge = [];
    basis.forEach(function (p) {
      var k = wochenSchluessel(p.d);
      if (!(k in map)) { folge.push(k); }
      map[k] = p;
    });
    return folge.map(function (k) { return map[k]; });
  }

  function annotiere(reihe) {
    return reihe.map(function (p, i) {
      var o = { d: p.d, y2: p.y2, y10: p.y10, sp: p.sp, ipda: null, tag: null, di: null, dt: null };
      if (i >= FENSTER_IPDA) {
        var b = reihe[i - FENSTER_IPDA];
        o.di = { y2: r4(p.y2 - b.y2), y10: r4(p.y10 - b.y10), sp: r4(p.sp - b.sp), ab: b.d };
        o.ipda = klassifiziere(o.di.y2, o.di.y10, o.di.sp);
      }
      if (i >= FENSTER_TAG) {
        var c = reihe[i - FENSTER_TAG];
        o.dt = { y2: r4(p.y2 - c.y2), y10: r4(p.y10 - c.y10), sp: r4(p.sp - c.sp), ab: c.d };
        o.tag = klassifiziere(o.dt.y2, o.dt.y10, o.dt.sp);
      }
      return o;
    });
  }

  var BASIS_D1 = baueBasis();
  var BASIS_W1 = zuWochen(BASIS_D1);
  var DATEN = {
    D1: annotiere(BASIS_D1),
    W1: annotiere(BASIS_W1)
  };

  /* --- Zustand -------------------------------------------------------------- */
  var zustand = {
    tf: "D1",
    spanne: "6M"   // 3M, 6M, 1J, 3J, alle
  };

  var SPANNEN = [
    { id: "3M", text: "3M", monate: 3 },
    { id: "6M", text: "6M", monate: 6 },
    { id: "1J", text: "1J", monate: 12 },
    { id: "3J", text: "3J", monate: 36 },
    { id: "alle", text: "Alle", monate: 0 }
  ];

  function aktuelleReihe() { return DATEN[zustand.tf]; }

  function sichtbareReihe() {
    var r = aktuelleReihe();
    if (!r.length) { return r; }
    var monate = 6;
    SPANNEN.forEach(function (s) { if (s.id === zustand.spanne) { monate = s.monate; } });
    if (!monate) { return r; }
    var grenze = new Date(r[r.length - 1].d + "T00:00:00Z");
    grenze.setUTCMonth(grenze.getUTCMonth() - monate);
    return r.filter(function (p) { return new Date(p.d + "T00:00:00Z") >= grenze; });
  }

  function periodeWort(mehrzahl) {
    if (zustand.tf === "W1") { return mehrzahl ? "Wochen" : "Woche"; }
    return mehrzahl ? "Handelstage" : "Handelstag";
  }

  /* =========================================================================
     Chart
     ========================================================================= */
  var NS = "http://www.w3.org/2000/svg";

  function svgEl(name, attr) {
    var n = document.createElementNS(NS, name);
    if (attr) { Object.keys(attr).forEach(function (k) { n.setAttribute(k, attr[k]); }); }
    return n;
  }

  /* opt: { feld, titel, einheit, dez, baender } */
  function zeichne(behaelter, punkte, opt, gross) {
    behaelter.innerHTML = "";
    if (!punkte || punkte.length < 2) {
      behaelter.appendChild(el("p", "chart-leer", "Zu wenige Datenpunkte für diesen Zeitraum."));
      return;
    }

    var B = gross ? 1440 : 900;
    var H = gross ? 660 : (opt.baender ? 340 : 250);
    var randL = 14, randR = gross ? 74 : 62, randO = 16, randU = 30;
    var plotB = B - randL - randR, plotH = H - randO - randU;

    var werte = punkte.map(function (p) { return p[opt.feld]; });
    var min = Math.min.apply(null, werte), max = Math.max.apply(null, werte);
    var luft = (max - min) * 0.14 || 0.1;
    min -= luft; max += luft;

    function x(i) { return randL + (i / (punkte.length - 1)) * plotB; }
    function y(v) { return randO + plotH - ((v - min) / (max - min)) * plotH; }

    var svg = svgEl("svg", {
      viewBox: "0 0 " + B + " " + H,
      role: "img",
      "aria-label": "Verlauf " + opt.titel
    });

    /* Regime-Hintergrund: zusammenhaengende Abschnitte gleicher Einstufung */
    if (opt.baender) {
      var start = 0;
      for (var i = 1; i <= punkte.length; i++) {
        var jetzt = i < punkte.length ? punkte[i][BAND_FELD] : null;
        if (jetzt !== punkte[start][BAND_FELD] || i === punkte.length) {
          var label = punkte[start][BAND_FELD];
          if (label) {
            var xa = x(start) - (start > 0 ? (plotB / (punkte.length - 1)) / 2 : 0);
            var xb = x(i - 1) + ((i - 1) < punkte.length - 1 ? (plotB / (punkte.length - 1)) / 2 : 0);
            var band = svgEl("rect", {
              x: xa.toFixed(1), y: randO,
              width: Math.max(1, xb - xa).toFixed(1), height: plotH,
              class: "chart-band " + regimeKlasse(label)
            });
            band.appendChild(svgEl("title")).textContent =
              label + " · " + datumText(punkte[start].d) + " bis " + datumText(punkte[i - 1].d);
            svg.appendChild(band);
          }
          start = i;
        }
      }
    }

    /* Waagerechte Hilfslinien, Beschriftung rechts (wie im Mockup) */
    var stufen = gross ? 8 : 5;
    for (var s = 0; s <= stufen; s++) {
      var wert = min + ((max - min) / stufen) * s;
      var yy = y(wert);
      svg.appendChild(svgEl("line", {
        x1: randL, x2: B - randR, y1: yy.toFixed(1), y2: yy.toFixed(1),
        stroke: "var(--raster)", "stroke-width": "1"
      }));
      var tick = svgEl("text", {
        x: B - randR + 8, y: (yy + 4).toFixed(1),
        "text-anchor": "start", "font-size": gross ? "13" : "11",
        fill: "var(--text-stumm)", style: "font-variant-numeric: tabular-nums"
      });
      tick.textContent = zahl(wert, opt.dez) + " " + opt.einheit;
      svg.appendChild(tick);
    }

    /* Nulllinie hervorheben, wenn sie im Bild liegt (invertierte Kurve) */
    if (min < 0 && max > 0) {
      svg.appendChild(svgEl("line", {
        x1: randL, x2: B - randR, y1: y(0).toFixed(1), y2: y(0).toFixed(1),
        stroke: "var(--achse)", "stroke-width": "1.5"
      }));
    }

    /* Zeitachse: Monatsbeschriftung, doppelte Monate werden uebersprungen */
    var schritt = Math.max(1, Math.ceil(punkte.length / (gross ? 12 : 7)));
    var letzterMonat = "";
    for (var j = 0; j < punkte.length; j += schritt) {
      var monat = punkte[j].d.slice(0, 7);
      if (monat === letzterMonat) { continue; }
      letzterMonat = monat;
      var tx = svgEl("text", {
        x: x(j).toFixed(1), y: H - 10,
        "text-anchor": "middle", "font-size": gross ? "13" : "11",
        fill: "var(--text-stumm)"
      });
      tx.textContent = monat.split("-").reverse().join("/");
      svg.appendChild(tx);
    }

    /* Linie */
    var d = "";
    punkte.forEach(function (p, i) {
      d += (i ? "L" : "M") + x(i).toFixed(1) + " " + y(p[opt.feld]).toFixed(1);
    });
    svg.appendChild(svgEl("path", {
      d: d, fill: "none", stroke: "var(--serie-1)",
      "stroke-width": gross ? "2.4" : "2",
      "stroke-linejoin": "round", "stroke-linecap": "round"
    }));

    /* Letzter Punkt */
    var letzt = punkte[punkte.length - 1];
    svg.appendChild(svgEl("circle", {
      cx: x(punkte.length - 1).toFixed(1), cy: y(letzt[opt.feld]).toFixed(1),
      r: gross ? "5" : "4", fill: "var(--serie-1)",
      stroke: "var(--flaeche)", "stroke-width": "2"
    }));

    /* Fadenkreuz */
    var kreuz = svgEl("line", {
      stroke: "var(--achse)", "stroke-width": "1",
      y1: randO, y2: randO + plotH, opacity: "0"
    });
    svg.appendChild(kreuz);
    var marke = svgEl("circle", {
      r: "4.5", fill: "var(--serie-1)", stroke: "var(--flaeche)",
      "stroke-width": "2", opacity: "0"
    });
    svg.appendChild(marke);

    behaelter.appendChild(svg);

    var tip = el("div", "chart-tip");
    tip.style.display = "none";
    behaelter.appendChild(tip);

    function zeige(klientX) {
      var kasten = svg.getBoundingClientRect();
      var rel = (klientX - kasten.left) / kasten.width * B;
      var anteil = (rel - randL) / plotB;
      var idx = Math.round(anteil * (punkte.length - 1));
      if (idx < 0) { idx = 0; }
      if (idx > punkte.length - 1) { idx = punkte.length - 1; }
      var p = punkte[idx];
      var px = x(idx), py = y(p[opt.feld]);
      kreuz.setAttribute("x1", px.toFixed(1));
      kreuz.setAttribute("x2", px.toFixed(1));
      kreuz.setAttribute("opacity", "1");
      marke.setAttribute("cx", px.toFixed(1));
      marke.setAttribute("cy", py.toFixed(1));
      marke.setAttribute("opacity", "1");

      tip.innerHTML = "";
      tip.appendChild(el("div", "chart-tip-datum", datumText(p.d)));
      tip.appendChild(el("div", "chart-tip-wert", zahl(p[opt.feld], opt.dez) + " " + opt.einheit));
      if (opt.baender && p[BAND_FELD]) {
        tip.appendChild(el("div", "chart-tip-regime " + regimeKlasse(p[BAND_FELD]), p[BAND_FELD]));
      }
      tip.style.display = "block";
      var links = (px / B) * kasten.width;
      tip.style.left = Math.min(Math.max(links, 8), kasten.width - tip.offsetWidth - 8) + "px";
      tip.style.top = Math.max(4, (py / H) * kasten.height - tip.offsetHeight - 14) + "px";
    }

    function verstecke() {
      kreuz.setAttribute("opacity", "0");
      marke.setAttribute("opacity", "0");
      tip.style.display = "none";
    }

    svg.addEventListener("mousemove", function (e) { zeige(e.clientX); });
    svg.addEventListener("mouseleave", verstecke);
    svg.addEventListener("touchstart", function (e) { zeige(e.touches[0].clientX); }, { passive: true });
    svg.addEventListener("touchmove", function (e) { zeige(e.touches[0].clientX); }, { passive: true });
    svg.addEventListener("touchend", verstecke);
  }

  /* =========================================================================
     Aufbau der Oberflaeche
     ========================================================================= */
  var CHARTS = [
    { id: "zsk", feld: "sp", titel: "ZSK · 10Y − 2Y Spread", einheit: "%", dez: 2, baender: true },
    { id: "us02y", feld: "y2", titel: "US02Y · 2-jährige Rendite", einheit: "%", dez: 2, baender: false },
    { id: "us10y", feld: "y10", titel: "US10Y · 10-jährige Rendite", einheit: "%", dez: 2, baender: false }
  ];

  var knoten = {};

  function baueGeruest() {
    var abschnitt = el("section", "regime-tafel");
    abschnitt.setAttribute("aria-label", "Zinsstrukturkurve und Regime");

    /* --- Kopfzeile: Zeitebene und Zeitraum --- */
    var kopf = el("div", "tafel-kopf");
    var tfGruppe = el("div", "tf-schalter");
    tfGruppe.setAttribute("role", "group");
    tfGruppe.setAttribute("aria-label", "Zeitebene");
    ["W1", "D1"].forEach(function (id) {
      var b = el("button", "tf-knopf", id);
      b.type = "button";
      b.dataset.tf = id;
      b.setAttribute("aria-pressed", String(zustand.tf === id));
      if (zustand.tf === id) { b.classList.add("aktiv"); }
      b.addEventListener("click", function () {
        zustand.tf = id;
        zeichneAlles();
      });
      tfGruppe.appendChild(b);
    });
    kopf.appendChild(tfGruppe);

    var spGruppe = el("div", "spanne-schalter");
    spGruppe.setAttribute("role", "group");
    spGruppe.setAttribute("aria-label", "Zeitraum");
    SPANNEN.forEach(function (s) {
      var b = el("button", "spanne-knopf", s.text);
      b.type = "button";
      b.dataset.spanne = s.id;
      b.setAttribute("aria-pressed", String(zustand.spanne === s.id));
      if (zustand.spanne === s.id) { b.classList.add("aktiv"); }
      b.addEventListener("click", function () {
        zustand.spanne = s.id;
        zeichneAlles();
      });
      spGruppe.appendChild(b);
    });
    kopf.appendChild(spGruppe);
    abschnitt.appendChild(kopf);

    /* --- Hauptraster: links Charts, rechts Tabelle --- */
    var raster = el("div", "tafel-raster");

    /* Linke Spalte */
    var links = el("div", "tafel-links");

    var zskKarte = baueChartKarte(CHARTS[0], "gross");
    links.appendChild(zskKarte);

    var kleinReihe = el("div", "chart-paar");
    kleinReihe.appendChild(baueChartKarte(CHARTS[1], "klein"));
    kleinReihe.appendChild(baueChartKarte(CHARTS[2], "klein"));
    links.appendChild(kleinReihe);

    knoten.regimeTag = el("div", "regime-kasten");
    links.appendChild(knoten.regimeTag);

    raster.appendChild(links);

    /* Rechte Spalte */
    var rechts = el("div", "tafel-rechts");

    var tabKarte = el("div", "karte tabellen-karte");
    var tabKopf = el("div", "karte-kopf");
    tabKopf.appendChild(el("h3", null, "Renditen, Veränderung und Regime"));
    knoten.tabHinweis = el("p", "karte-unter");
    tabKopf.appendChild(knoten.tabHinweis);
    tabKarte.appendChild(tabKopf);

    knoten.tabelle = el("div", "regime-tabelle");
    tabKarte.appendChild(knoten.tabelle);
    rechts.appendChild(tabKarte);

    /* Abgleich-Kasten */
    knoten.regimeIpda = el("div", "regime-kasten");
    var kastenReihe = el("div", "kasten-reihe");
    kastenReihe.appendChild(knoten.regimeIpda);
    var infoKnopf = el("button", "tafel-knopf tafel-knopf-schmal", "Info");
    infoKnopf.type = "button";
    infoKnopf.addEventListener("click", function () { oeffneDialog("info"); });
    kastenReihe.appendChild(infoKnopf);
    rechts.appendChild(kastenReihe);

    /* Nachschlage-Knoepfe */
    var knopfReihe = el("div", "knopf-reihe");
    var kSharp = el("button", "tafel-knopf", "Sharp Ratios");
    kSharp.type = "button";
    kSharp.addEventListener("click", function () { oeffneDialog("sharp"); });
    var kCore = el("button", "tafel-knopf", "Core Setups");
    kCore.type = "button";
    kCore.addEventListener("click", function () { oeffneDialog("core"); });
    knopfReihe.appendChild(kSharp);
    knopfReihe.appendChild(kCore);
    rechts.appendChild(knopfReihe);

    raster.appendChild(rechts);
    abschnitt.appendChild(raster);
    WURZEL.appendChild(abschnitt);
  }

  function baueChartKarte(cfg, groesse) {
    var karte = el("figure", "karte chart-karte chart-" + groesse);
    var kopf = el("figcaption", "karte-kopf");
    kopf.appendChild(el("h3", null, cfg.titel));
    knoten[cfg.id + "Stand"] = el("p", "karte-unter");
    kopf.appendChild(knoten[cfg.id + "Stand"]);
    karte.appendChild(kopf);

    var box = el("div", "chart-box");
    box.tabIndex = 0;
    box.setAttribute("role", "button");
    box.setAttribute("aria-label", cfg.titel + " im Vollbild anzeigen");
    box.title = "Klicken für Vollbild";
    knoten[cfg.id] = box;
    box.addEventListener("click", function () { oeffneVollbild(cfg); });
    box.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); oeffneVollbild(cfg); }
    });
    karte.appendChild(box);

    var lupe = el("span", "chart-lupe", "⤢");
    lupe.setAttribute("aria-hidden", "true");
    karte.appendChild(lupe);
    return karte;
  }

  /* --- Tabelle --------------------------------------------------------------- */
  function baueTabelle() {
    var reihe = aktuelleReihe();
    knoten.tabelle.innerHTML = "";

    knoten.tabHinweis.textContent =
      "Veränderung jeweils gegenüber " + FENSTER_IPDA + " " + periodeWort(true) +
      " davor (IPDA-Zyklus). Punkt rechts: stimmt das IPDA-Regime mit dem " +
      FENSTER_TAG + "-" + periodeWort(true) + "-Regime überein?";

    var tab = document.createElement("table");
    var thead = document.createElement("thead");
    var tr = document.createElement("tr");
    [
      { t: "Datum", k: "" },
      { t: "2Y", k: "zahl" },
      { t: "10Y", k: "zahl" },
      { t: "10Y−2Y", k: "zahl" },
      { t: "Δ Spread", k: "zahl" },
      { t: "Δ 10Y", k: "zahl" },
      { t: "Δ 2Y", k: "zahl" },
      { t: "IPDA-Regime", k: "" },
      { t: "⟺", k: "mitte" }
    ].forEach(function (s) {
      var th = document.createElement("th");
      th.textContent = s.t;
      if (s.k) { th.className = s.k; }
      if (s.t === "⟺") { th.title = "Abgleich IPDA-Regime gegen " + FENSTER_TAG + "-" + periodeWort(true) + "-Regime"; }
      tr.appendChild(th);
    });
    thead.appendChild(tr);
    tab.appendChild(thead);

    var tbody = document.createElement("tbody");
    // Neuester Tag oben
    for (var i = reihe.length - 1; i >= 0; i--) {
      var p = reihe[i];
      var z = document.createElement("tr");
      z.appendChild(el("td", "datum", datumText(p.d)));
      z.appendChild(el("td", "zahl", zahl(p.y2, 2)));
      z.appendChild(el("td", "zahl", zahl(p.y10, 2)));
      z.appendChild(el("td", "zahl", zahl(p.sp, 2)));

      if (p.di) {
        z.appendChild(el("td", "zahl " + deltaKlasse(p.di.sp), zahlDelta(p.di.sp, 2)));
        z.appendChild(el("td", "zahl " + deltaKlasse(p.di.y10), zahlDelta(p.di.y10, 2)));
        z.appendChild(el("td", "zahl " + deltaKlasse(p.di.y2), zahlDelta(p.di.y2, 2)));
      } else {
        z.appendChild(el("td", "zahl", "–"));
        z.appendChild(el("td", "zahl", "–"));
        z.appendChild(el("td", "zahl", "–"));
      }

      var tdR = el("td", "regime-zelle");
      if (p.ipda) {
        tdR.appendChild(el("span", "regime-pille " + regimeKlasse(p.ipda), p.ipda));
      } else {
        tdR.textContent = "–";
      }
      z.appendChild(tdR);

      var tdP = el("td", "mitte");
      if (p.ipda && p.tag) {
        var passt = p.ipda === p.tag;
        var punkt = el("span", "abgleich-punkt " + (passt ? "ap-gut" : "ap-schlecht"));
        punkt.title = passt
          ? "Übereinstimmung: " + p.ipda
          : "Abweichung: IPDA " + p.ipda + " gegen " + FENSTER_TAG + "-" + periodeWort(true) + "-Regime " + p.tag;
        punkt.setAttribute("aria-label", punkt.title);
        tdP.appendChild(punkt);
      }
      z.appendChild(tdP);
      tbody.appendChild(z);
    }
    tab.appendChild(tbody);
    knoten.tabelle.appendChild(tab);
  }

  /* --- Regime-Kaesten -------------------------------------------------------- */
  function laufzeit(reihe, feld) {
    var ende = reihe.length - 1;
    while (ende >= 0 && !reihe[ende][feld]) { ende--; }
    if (ende < 0) { return null; }
    var label = reihe[ende][feld];
    var start = ende;
    while (start > 0 && reihe[start - 1][feld] === label) { start--; }
    return { label: label, seit: reihe[start].d, perioden: ende - start + 1, stand: reihe[ende].d };
  }

  function baueKasten(ziel, titel, info, zusatz) {
    ziel.innerHTML = "";
    ziel.className = "regime-kasten " + regimeKlasse(info && info.label);
    ziel.appendChild(el("span", "kasten-titel", titel));
    ziel.appendChild(el("span", "kasten-wert", info ? info.label : "–"));
    if (info) {
      var meta = REGIME[info.label];
      ziel.appendChild(el("span", "kasten-meta",
        (meta ? meta.quadrant + " · " : "") +
        "seit " + datumText(info.seit) + " (" + info.perioden + " " +
        (info.perioden === 1 ? periodeWort(false) : periodeWort(true)) + ")"));
    }
    if (zusatz) { ziel.appendChild(zusatz); }
  }

  function baueKaesten() {
    var reihe = aktuelleReihe();
    var tag = laufzeit(reihe, "tag");
    var ipda = laufzeit(reihe, "ipda");

    baueKasten(knoten.regimeTag,
      "Regime · " + FENSTER_TAG + " " + periodeWort(true), tag);

    var abgleich = null;
    if (tag && ipda) {
      var passt = tag.label === ipda.label;
      abgleich = el("span", "kasten-abgleich " + (passt ? "ap-gut-text" : "ap-schlecht-text"));
      abgleich.appendChild(el("span", "abgleich-punkt " + (passt ? "ap-gut" : "ap-schlecht")));
      abgleich.appendChild(el("span", null, passt
        ? "stimmt mit dem " + FENSTER_TAG + "-" + periodeWort(true) + "-Regime überein"
        : "weicht ab: " + FENSTER_TAG + "-" + periodeWort(true) + "-Regime ist " + tag.label));
    }
    baueKasten(knoten.regimeIpda,
      "IPDA-Regime · " + FENSTER_IPDA + " " + periodeWort(true), ipda, abgleich);
  }

  /* --- Zeichnen -------------------------------------------------------------- */
  function zeichneAlles() {
    WURZEL.querySelectorAll(".tf-knopf").forEach(function (b) {
      var an = b.dataset.tf === zustand.tf;
      b.classList.toggle("aktiv", an);
      b.setAttribute("aria-pressed", String(an));
    });
    WURZEL.querySelectorAll(".spanne-knopf").forEach(function (b) {
      var an = b.dataset.spanne === zustand.spanne;
      b.classList.toggle("aktiv", an);
      b.setAttribute("aria-pressed", String(an));
    });

    var sicht = sichtbareReihe();
    CHARTS.forEach(function (cfg) {
      zeichne(knoten[cfg.id], sicht, cfg, false);
      var letzt = sicht.length ? sicht[sicht.length - 1] : null;
      knoten[cfg.id + "Stand"].textContent = letzt
        ? zahl(letzt[cfg.feld], cfg.dez) + " " + cfg.einheit + " · Stand " + datumText(letzt.d)
        : "";
    });
    baueTabelle();
    baueKaesten();
  }

  /* =========================================================================
     Vollbild-Chart
     ========================================================================= */
  function oeffneVollbild(cfg) {
    var overlay = document.getElementById("vollbild");
    document.getElementById("vollbildTitel").textContent = cfg.titel;
    document.getElementById("vollbildUnter").textContent =
      zustand.tf + " · " + (cfg.baender
        ? "Hintergrundfarbe = " + FENSTER_TAG + "-" + periodeWort(true) + "-Regime"
        : "Renditeverlauf");
    var box = document.getElementById("vollbildChart");
    overlay.hidden = false;
    document.body.classList.add("dialog-offen");
    zeichne(box, sichtbareReihe(), cfg, true);
    document.getElementById("vollbildSchliessen").focus();
  }

  /* =========================================================================
     Nachschlage-Dialoge (statische Tabellen aus Regime.pptx, Folie 2)
     ========================================================================= */
  var SPALTEN = [
    { titel: "Q1: Goldilocks", unter: "Bull Steepener", klasse: "r-bullsteep" },
    { titel: "Q2: Reflation", unter: "Bear Steepener", klasse: "r-bearsteep" },
    { titel: "Q3: Stagflation", unter: "Bull Flattener", klasse: "r-bullflat" },
    { titel: "Q4: Deflation", unter: "Bear Flattener", klasse: "r-bearflat" }
  ];

  // Sharp Ratios: Einzelwerte je Regime, absteigend sortiert
  var SHARP = [
    [["Bitcoin", 1.3], ["US500", 0.8], ["Gold", 0.7], ["CAD", 0.7], ["Oil", 0.5], ["GBP", 0.5], ["JPY", 0.5], ["CHF", 0.2], ["EUR", 0.1], ["AUD", 0.1], ["USD", -0.5]],
    [["Gold", 1.5], ["Bitcoin", 1.3], ["Oil", 1.2], ["US500", 0.7], ["CAD", 0.3], ["AUD", 0.3], ["GBP", 0.1], ["EUR", -0.2], ["CHF", -0.5], ["JPY", -1.0], ["USD", -1.2]],
    [["Oil", 1.5], ["Gold", 1.1], ["JPY", 0.6], ["USD", 0.6], ["US500", 0.2], ["CHF", 0.1], ["CAD", -0.1], ["GBP", -0.1], ["EUR", -0.2], ["AUD", -0.5], ["Bitcoin", -0.8]],
    [["USD", 0.7], ["JPY", 0.5], ["CHF", 0.1], ["US500", 0.0], ["Bitcoin", 0.0], ["Gold", -0.7], ["CAD", -0.8], ["EUR", -0.8], ["AUD", -0.9], ["GBP", -0.9], ["Oil", -2.1]]
  ];

  // Core Setups: Long- und Short-Seite je Regime. true = im Original hervorgehoben
  var CORE_LONG = [
    [["Bitcoin", 1.3, true], ["GBP/USD", 1.0], ["US 500", 0.8], ["AUD/USD", 0.6], ["EUR/USD", 0.6]],
    [["AUD/USD", 1.5, true], ["AUD/JPY", 1.3], ["CAD/JPY", 1.3], ["GBP/USD", 1.3], ["EUR/USD", 1.0], ["AUD/CHF", 0.8]],
    [["JPY/EUR", 0.8], ["USD/CAD", 0.7]],
    [["USD/CAD", 1.5], ["JPY/GBP", 1.4], ["JPY/EUR", 1.3]]
  ];
  var CORE_SHORT = [
    [["USD/CAD", 1.2, true], ["USD/JPY", 1.0], ["USD/CHF", 0.7]],
    [["USD/CAD", 1.5, true], ["EUR/CAD", 0.5], ["EUR/AUD", 0.5]],
    [["AUD/USD", 1.1, true], ["AUD/JPY", 1.1, true], ["EUR/USD", 0.8], ["GBP/USD", 0.7], ["GBP/JPY", 0.7], ["CAD/JPY", 0.7], ["AUD/CHF", 0.6]],
    [["AUD/USD", 1.6, true], ["GBP/USD", 1.6, true], ["EUR/USD", 1.5], ["AUD/JPY", 1.4], ["CAD/JPY", 1.3], ["AUD/CHF", 1.0], ["GBP/CHF", 1.0], ["CAD/CHF", 0.9], ["EUR/CHF", 0.9]]
  ];

  // Info: Steckbrief je Regime
  var INFO_ZEILEN = [
    ["Regime Type", "Bull Steepener", "Bear Steepener", "Bull Flattener", "Bear Flattener"],
    ["Main Char.", "Growth + | Infl. −", "Growth + | Infl. +", "Growth − | Infl. +", "Growth − | Infl. −"],
    ["PMI", "PMI > 50", "PMI > 50", "PMI < 50", "PMI << 50"],
    ["Inflation", "CPI fällt", "CPI steigt", "CPI hoch", "CPI fällt"],
    ["VIX Range", "VIX 10–14", "VIX 15–20", "VIX 25–40", "VIX 40+"],
    ["Oil Level", "Oil Moderate", "Oil > $80", "Oil $60–100", "Oil < $50"],
    ["Strong Currency", "EUR | GBP | AUD", "AUD | CAD | USD", "JPY | CHF | USD", "JPY | CHF | USD"],
    ["Weak Currency", "JPY | CHF", "JPY | CHF", "AUD | NZD | CAD", "AUD | NZD | CAD"],
    ["Risk Level", "Low", "Moderate", "High", "Extreme"]
  ];

  function spaltenKopf(tab) {
    var thead = document.createElement("thead");
    var tr = document.createElement("tr");
    tr.appendChild(el("th", "nk-ecke", "Regime:"));
    SPALTEN.forEach(function (s) {
      var th = el("th", "nk-kopf " + s.klasse);
      th.colSpan = 2;
      th.appendChild(el("span", "nk-kopf-titel", s.titel));
      th.appendChild(el("span", "nk-kopf-unter", s.unter));
      tr.appendChild(th);
    });
    thead.appendChild(tr);
    tab.appendChild(thead);
  }

  function paarBloecke(bloecke, beschriftung) {
    var tbody = document.createElement("tbody");
    var max = 0;
    bloecke.forEach(function (b) { if (b.length > max) { max = b.length; } });

    var kopf = document.createElement("tr");
    kopf.appendChild(el("td", "nk-seite", beschriftung || ""));
    SPALTEN.forEach(function () {
      kopf.appendChild(el("td", "nk-unterkopf", "Währung"));
      kopf.appendChild(el("td", "nk-unterkopf zahl", "Sharp Ratio"));
    });
    tbody.appendChild(kopf);

    for (var i = 0; i < max; i++) {
      var tr = document.createElement("tr");
      tr.appendChild(el("td", "nk-seite", ""));
      bloecke.forEach(function (block, sp) {
        var e = block[i];
        if (!e) {
          tr.appendChild(el("td", "nk-leer", ""));
          tr.appendChild(el("td", "nk-leer", ""));
          return;
        }
        var kl = "nk-wert" + (e[2] ? " nk-top" : "");
        tr.appendChild(el("td", kl, e[0]));
        tr.appendChild(el("td", kl + " zahl", zahl(e[1], 1)));
      });
      tbody.appendChild(tr);
    }
    return tbody;
  }

  function baueSharpTabelle() {
    var tab = document.createElement("table");
    tab.className = "nachschlag-tabelle";
    spaltenKopf(tab);
    tab.appendChild(paarBloecke(SHARP, ""));
    return tab;
  }

  function baueCoreTabelle() {
    var tab = document.createElement("table");
    tab.className = "nachschlag-tabelle";
    spaltenKopf(tab);
    var langBody = paarBloecke(CORE_LONG, "Long");
    langBody.classList.add("nk-long");
    tab.appendChild(langBody);
    var kurzBody = paarBloecke(CORE_SHORT, "Short");
    kurzBody.classList.add("nk-short");
    tab.appendChild(kurzBody);
    return tab;
  }

  function baueInfoTabelle() {
    var tab = document.createElement("table");
    tab.className = "nachschlag-tabelle info-tabelle";
    var thead = document.createElement("thead");
    var tr = document.createElement("tr");
    tr.appendChild(el("th", "nk-ecke", "Characteristics"));
    SPALTEN.forEach(function (s) {
      var th = el("th", "nk-kopf " + s.klasse);
      th.appendChild(el("span", "nk-kopf-titel", s.titel));
      tr.appendChild(th);
    });
    thead.appendChild(tr);
    tab.appendChild(thead);

    var tbody = document.createElement("tbody");
    INFO_ZEILEN.forEach(function (z) {
      var reihe = document.createElement("tr");
      reihe.appendChild(el("th", "nk-zeile", z[0]));
      for (var i = 1; i <= 4; i++) {
        reihe.appendChild(el("td", "nk-feld " + SPALTEN[i - 1].klasse + "-weich", z[i]));
      }
      tbody.appendChild(reihe);
    });
    tab.appendChild(tbody);
    return tab;
  }

  var DIALOGE = {
    sharp: {
      titel: "Sharp Ratios je Regime",
      unter: "Einzelwerte, sortiert nach Sharpe Ratio. Historische Statistik aus dem Rohmaterial, keine Handelsempfehlung.",
      bau: baueSharpTabelle
    },
    core: {
      titel: "Core Setups je Regime",
      unter: "Währungspaare mit der historisch besten Sharpe Ratio je Regime, getrennt nach Long- und Short-Seite. Historische Statistik, keine Handelsempfehlung.",
      bau: baueCoreTabelle
    },
    info: {
      titel: "Regime-Steckbrief",
      unter: "Typische Merkmale der vier Regime nach deiner Regime-Methodik. Einordnungshilfe, keine Handelsempfehlung.",
      bau: baueInfoTabelle
    }
  };

  function oeffneDialog(id) {
    var cfg = DIALOGE[id];
    if (!cfg) { return; }
    document.getElementById("nachschlagTitel").textContent = cfg.titel;
    document.getElementById("nachschlagUnter").textContent = cfg.unter;
    var inhalt = document.getElementById("nachschlagInhalt");
    inhalt.innerHTML = "";
    inhalt.appendChild(cfg.bau());
    document.getElementById("nachschlag").hidden = false;
    document.body.classList.add("dialog-offen");
    document.getElementById("nachschlagSchliessen").focus();
  }

  /* --- Dialoge schliessen ---------------------------------------------------- */
  function schliesse(id) {
    document.getElementById(id).hidden = true;
    if (document.getElementById("nachschlag").hidden &&
        document.getElementById("vollbild").hidden) {
      document.body.classList.remove("dialog-offen");
    }
  }

  ["nachschlag", "vollbild"].forEach(function (id) {
    var ov = document.getElementById(id);
    if (!ov) { return; }
    ov.addEventListener("click", function (e) { if (e.target === ov) { schliesse(id); } });
    var knopf = document.getElementById(id + "Schliessen");
    if (knopf) { knopf.addEventListener("click", function () { schliesse(id); }); }
  });

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") { return; }
    if (!document.getElementById("vollbild").hidden) { schliesse("vollbild"); return; }
    if (!document.getElementById("nachschlag").hidden) { schliesse("nachschlag"); }
  });

  /* =========================================================================
     Historische Performance je Regime (unter den Kacheln)
     ========================================================================= */
  function bauePerformance() {
    if (!D.referenz || !D.referenz.zeilen || !D.referenz.zeilen.length) { return; }
    var ziel = document.getElementById("kachelbereiche");
    if (!ziel) { return; }

    var abschnitt = el("section", "gruppe");
    abschnitt.setAttribute("aria-labelledby", "g-referenz");
    var h2 = el("h2", null, "Historische Performance je Regime");
    h2.id = "g-referenz";
    abschnitt.appendChild(h2);
    abschnitt.appendChild(el("p", "referenz-hinweis",
      "Historische Performance je Regime aus dem Rohmaterial (Regime Theorie Zusammenfassung.docx). " +
      "Statistische Rückschau, keine aktuelle Handelsempfehlung."));

    var box = el("div", "referenz-tabelle");
    var tab = document.createElement("table");
    var thead = document.createElement("thead");
    var kz = document.createElement("tr");
    ["Regime", "Asset", "Performance"].forEach(function (t) {
      var th = document.createElement("th");
      th.textContent = t;
      kz.appendChild(th);
    });
    thead.appendChild(kz);
    tab.appendChild(thead);

    var tbody = document.createElement("tbody");
    D.referenz.zeilen.forEach(function (z) {
      var tr = document.createElement("tr");
      tr.appendChild(el("td", "regime-spalte " + regimeKlasse(z.regime), z.regime));
      tr.appendChild(el("td", null, z.asset));
      tr.appendChild(el("td", "zahl", (z.performance > 0 ? "+" : "") + z.performance + " %"));
      tbody.appendChild(tr);
    });
    tab.appendChild(tbody);
    box.appendChild(tab);
    abschnitt.appendChild(box);
    ziel.appendChild(abschnitt);
  }

  /* --- Start -----------------------------------------------------------------
     Gleiches Muster wie motor.js. Wichtig ist die Reihenfolge: motor.js haengt
     zuerst die Kachel-Gruppen (Konjunkturzyklus-Fruehindikatoren) in
     #kachelbereiche, erst danach kommt die Performance-Tabelle darunter.
     Da motor.js vorher geladen wird, feuert dessen DOMContentLoaded-Zuhoerer
     auch zuerst.                                                            */
  function start() {
    baueGeruest();
    zeichneAlles();
    bauePerformance();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
