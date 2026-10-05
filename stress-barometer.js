/* ===========================================================================
   Stress-Barometer Plumbing - Anzeige
   Halbkreis-Barometer (0-100), Liste der Kennzahlen mit Balken (wo kommt der
   Stress her), Stress-Kette und Historie-Knoepfe (Aktuell, vor 1 Monat,
   3 Monaten, 6 Monaten, 1 Jahr). Rechenteil: stress-score.js.
   Beschriftungen sind rein beschreibend, keine Marktbewertung
   (CLAUDE.md Abschnitt 5).
   =========================================================================== */

(function () {
  "use strict";

  var NS = "http://www.w3.org/2000/svg";
  var wurzel = document.getElementById("stressBarometer");
  if (!wurzel || !window.STRESS) { return; }

  var STRESS = window.STRESS;
  var zeitpunkte = STRESS.zeitpunkte();
  var auswahl = "heute";
  var fokusAufKnopf = false;   /* nach Klick Fokus erhalten (Tastaturbedienung) */

  /* --- Helfer ------------------------------------------------------------ */

  function el(tag, klasse, text) {
    var e = document.createElement(tag);
    if (klasse) { e.className = klasse; }
    if (text !== undefined && text !== null) { e.textContent = text; }
    return e;
  }

  function svgEl(tag, attribute) {
    var e = document.createElementNS(NS, tag);
    for (var a in attribute) { e.setAttribute(a, attribute[a]); }
    return e;
  }

  function zahl(wert, dez) {
    return wert.toLocaleString("de-DE", { minimumFractionDigits: dez, maximumFractionDigits: dez });
  }

  function datumText(iso) {
    return iso.slice(8, 10) + "." + iso.slice(5, 7) + "." + iso.slice(0, 4);
  }

  function vorzeichen(wert, dez) {
    var t = zahl(Math.abs(wert), dez);
    return (wert < 0 ? "−" : "") + t;
  }

  /* --- Halbkreis --------------------------------------------------------- */

  var MX = 130, MY = 124, R = 100;

  function punktAuf(v, r) {
    var winkel = Math.PI * (1 - v / 100);
    return { x: MX + r * Math.cos(winkel), y: MY - r * Math.sin(winkel) };
  }

  function bogen(v1, v2) {
    var a = punktAuf(v1, R), b = punktAuf(v2, R);
    return "M " + a.x.toFixed(2) + " " + a.y.toFixed(2) +
           " A " + R + " " + R + " 0 0 1 " + b.x.toFixed(2) + " " + b.y.toFixed(2);
  }

  function baueHalbkreis(ergebnis) {
    var svg = svgEl("svg", {
      viewBox: "0 0 260 176", "class": "bm-halbkreis", role: "img",
      "aria-label": "Stress-Barometer " + zahl(ergebnis.barometer, 0) + " von 100, Zone " + ergebnis.zone.name
    });

    STRESS.ZONEN.forEach(function (z) {
      var pfad = svgEl("path", {
        d: bogen(z.von + 0.5, z.bis - 0.5),
        fill: "none", stroke: z.farbe, "stroke-width": 20, "stroke-linecap": "butt",
        "class": "bm-zone" + (z.id === ergebnis.zone.id ? " bm-zone-aktiv" : "")
      });
      svg.appendChild(pfad);
    });

    /* Skalenmarken 0 / 20 / 40 / 60 / 80 / 100 */
    [0, 20, 40, 60, 80, 100].forEach(function (v) {
      var p = punktAuf(v, R + 19);
      var t = svgEl("text", {
        x: p.x.toFixed(1), y: (p.y + 4).toFixed(1), "class": "bm-skala",
        "text-anchor": v === 0 ? "end" : (v === 100 ? "start" : "middle")
      });
      t.textContent = v;
      svg.appendChild(t);
    });

    /* Nadel: zeigt nach oben und wird per CSS um den Mittelpunkt gedreht */
    var winkel = -90 + ergebnis.barometer * 1.8;
    var nadel = svgEl("g", { "class": "bm-nadel" });
    nadel.style.transformOrigin = MX + "px " + MY + "px";
    nadel.style.transform = "rotate(" + winkel.toFixed(2) + "deg)";
    nadel.appendChild(svgEl("line", { x1: MX, y1: MY, x2: MX, y2: MY - R + 14, "class": "bm-nadel-linie" }));
    svg.appendChild(nadel);
    svg.appendChild(svgEl("circle", { cx: MX, cy: MY, r: 6, "class": "bm-nabe" }));

    var wert = svgEl("text", { x: MX, y: MY + 44, "class": "bm-wert", "text-anchor": "middle" });
    wert.setAttribute("fill", ergebnis.zone.text);
    wert.textContent = zahl(ergebnis.barometer, 0);
    svg.appendChild(wert);
    return svg;
  }

  /* --- Stress-Kette ------------------------------------------------------ */

  function baueKette(kette) {
    var box = el("div", "bm-kette");
    var kopf = el("div", "bm-kette-kopf");
    kopf.appendChild(el("span", "bm-kette-titel", "Stress-Kette"));
    kopf.appendChild(el("span", "bm-kette-zahl", kette.anzahl + " von " + kette.von));
    box.appendChild(kopf);

    var chips = el("div", "bm-kette-chips");
    kette.liste.forEach(function (c) {
      var chip = el("span", "bm-chip" + (c.stress ? " bm-chip-an" : ""));
      chip.appendChild(el("span", "bm-chip-punkt"));
      chip.appendChild(document.createTextNode(c.name));
      chip.title = c.score === null ? "keine Daten"
        : c.name + ": Score " + zahl(c.score, 0) + (c.stress ? " (ab " + kette.schwelle + " = zeigt Stress)" : "");
      chips.appendChild(chip);
    });
    box.appendChild(chips);
    box.appendChild(el("p", "bm-kette-text",
      "VIX, HY-Spread und FFSI ab " + kette.schwelle + " Punkten. Zeigen mehrere gemeinsam Stress, ist er breiter im System; " +
      "steigt nur einer, kann es ein kurzer Ausschlag sein."));
    return box;
  }

  /* --- Liste der Bereiche ------------------------------------------------ */

  var GRUPPEN = [
    { id: "markt",   titel: "Marktumfeld", sub: "Absicherung und Risikoaufschlag" },
    { id: "funding", titel: "USD-Funding", sub: "Kosten und Knappheit kurzfristigen Geldes" }
  ];

  function rohText(b) {
    if (!b.verfuegbar) { return "keine Daten"; }
    var t = vorzeichen(b.roh, b.dez);
    if (b.id === "sofr" || b.id === "rel") { t = (b.roh > 0 ? "+" : "") + t; }
    return t + b.einheit + (b.schnitt ? " (Ø 5 Tage)" : "");
  }

  function baueZeile(b) {
    var zeile = el("li", "bm-zeile" + (b.verfuegbar ? "" : " bm-zeile-leer"));

    var kopf = el("div", "bm-zeile-kopf");
    var name = el("span", "bm-name", b.name);
    name.title = b.lang;
    kopf.appendChild(name);
    kopf.appendChild(el("span", "bm-gewicht", b.gewicht + " %"));
    zeile.appendChild(kopf);

    var spur = el("div", "bm-spur");
    if (b.verfuegbar) {
      var zone = STRESS.zoneVon(b.score);
      spur.setAttribute("role", "meter");
      spur.setAttribute("aria-valuemin", "0");
      spur.setAttribute("aria-valuemax", "100");
      spur.setAttribute("aria-valuenow", zahl(b.score, 0));
      spur.setAttribute("aria-label", b.name + " Score, Zone " + zone.name);
      var fuell = el("div", "bm-fuell");
      fuell.style.width = Math.max(b.score, 0.8).toFixed(1) + "%";
      fuell.style.background = zone.farbe;
      spur.appendChild(fuell);
      [20, 40, 60, 80].forEach(function (m) {
        var strich = el("span", "bm-marke");
        strich.style.left = m + "%";
        spur.appendChild(strich);
      });
    }
    zeile.appendChild(spur);

    var fuss = el("div", "bm-zeile-fuss");
    if (b.verfuegbar) {
      fuss.appendChild(el("span", "bm-roh", rohText(b)));
      fuss.appendChild(el("span", "bm-teile",
        "Wert " + zahl(b.wert, 0) + " · Trend " + zahl(b.trend, 0) + " · Tempo " + zahl(b.tempo, 0)));
    } else {
      fuss.appendChild(el("span", "bm-roh", "Für diesen Zeitpunkt liegen nicht genug Daten vor."));
    }
    zeile.appendChild(fuss);

    var zahlen = el("div", "bm-zahlen");
    var score = el("span", "bm-score", b.verfuegbar ? zahl(b.score, 0) : "–");
    if (b.verfuegbar) { score.style.color = STRESS.zoneVon(b.score).text; }
    zahlen.appendChild(score);
    zahlen.appendChild(el("span", "bm-beitrag",
      b.verfuegbar ? "+" + zahl(b.beitrag, 1) + " Pkt." : ""));
    zeile.appendChild(zahlen);
    return zeile;
  }

  function baueListe(ergebnis) {
    var box = el("div", "bm-liste");
    GRUPPEN.forEach(function (g) {
      var teil = ergebnis.bereiche.filter(function (b) { return b.gruppe === g.id; });
      var beitrag = 0, maximum = 0;
      teil.forEach(function (b) { beitrag += b.beitrag; maximum += b.maxBeitrag; });

      var kopf = el("div", "bm-gruppe-kopf");
      var links = el("div");
      links.appendChild(el("h3", "bm-gruppe-titel", g.titel));
      links.appendChild(el("p", "bm-gruppe-sub", g.sub));
      kopf.appendChild(links);
      kopf.appendChild(el("div", "bm-gruppe-summe",
        zahl(beitrag, 1) + " von max. " + zahl(maximum, 1) + " Pkt."));
      box.appendChild(kopf);

      var ul = el("ul", "bm-zeilen");
      teil.forEach(function (b) { ul.appendChild(baueZeile(b)); });
      box.appendChild(ul);
    });
    return box;
  }

  /* --- Historie-Knoepfe -------------------------------------------------- */

  function baueKnoepfe() {
    var leiste = el("div", "bm-historie");
    leiste.setAttribute("role", "group");
    leiste.setAttribute("aria-label", "Zeitpunkt wählen");
    zeitpunkte.forEach(function (z) {
      var e = STRESS.berechne(z.datum);
      var knopf = el("button", "bm-knopf");
      knopf.type = "button";
      knopf.setAttribute("aria-pressed", z.id === auswahl ? "true" : "false");
      knopf.appendChild(el("span", "bm-knopf-label", z.label));
      var wertZeile = el("span", "bm-knopf-wert");
      if (e) {
        var punkt = el("span", "bm-knopf-punkt");
        punkt.style.background = e.zone.farbe;
        wertZeile.appendChild(punkt);
        wertZeile.appendChild(document.createTextNode(zahl(e.barometer, 0) + " · " + e.zone.name));
      } else {
        wertZeile.textContent = "keine Daten";
      }
      knopf.appendChild(wertZeile);
      knopf.addEventListener("click", function () { auswahl = z.id; fokusAufKnopf = true; zeichne(); });
      leiste.appendChild(knopf);
    });
    return leiste;
  }

  /* --- Rechenweg --------------------------------------------------------- */

  function baueRechenweg() {
    var d = el("details", "bm-rechenweg");
    d.appendChild(el("summary", null, "So wird gerechnet"));
    var p1 = el("p", null,
      "Jede Kennzahl bekommt einen Score von 0 bis 100: 50 % Wert (wo steht sie), 25 % Trend (Veränderung über 20, 40 und 60 Tage) " +
      "und 25 % Tempo (Veränderung über 8 und 14 Tage). Beim FFSI zählen Wochen statt Tage. Es zählt nur die Stressrichtung, " +
      "Entspannung gibt 0 Punkte. Die Schwellen legte Felix anhand der Historie fest (Dokumentation: Stress_Barometer_Entwurf).");
    var p2 = el("p", null,
      "Barometer = gewichtete Summe der Scores × " + zahl(STRESS.HEBEL, 1) + ", bei 100 gedeckelt. Gewichte: " +
      STRESS.KENNZAHLEN.map(function (k) { return k.name + " " + k.gewicht + " %"; }).join(", ") + ".");
    var p3 = el("p", null,
      "Zonen: " + STRESS.ZONEN.map(function (z) { return z.von + "–" + z.bis + " " + z.name; }).join(", ") +
      ". Die Balken rechts nutzen dieselben Zonen und Farben für den Score der einzelnen Kennzahl. " +
      "Die Zonen beschreiben nur die Höhe der Kennzahlen, keine Einschätzung des Marktes.");
    d.appendChild(p1); d.appendChild(p2); d.appendChild(p3);
    return d;
  }

  /* --- Gesamtaufbau ------------------------------------------------------ */

  function zeichne() {
    var z = null;
    zeitpunkte.forEach(function (t) { if (t.id === auswahl) { z = t; } });
    var e = z ? STRESS.berechne(z.datum) : null;

    wurzel.textContent = "";
    var kopf = el("div", "bm-kopf");
    var h2 = el("h2", "bm-titel", "Stress-Barometer");
    h2.id = "barometerTitel";
    kopf.appendChild(h2);
    kopf.appendChild(el("p", "bm-unter",
      "Wie hoch ist der Stress im Plumbing-System laut den sieben Kennzahlen? 0 = kein Stress, 100 = totaler Systemstress."));
    wurzel.appendChild(kopf);

    if (!e) {
      wurzel.appendChild(el("p", "bm-leer", "Für das Barometer liegen keine ausreichenden Daten vor."));
      return;
    }

    wurzel.appendChild(baueKnoepfe());

    var raster = el("div", "bm-raster");

    var links = el("div", "bm-links");
    links.appendChild(baueHalbkreis(e));
    var zoneZeile = el("div", "bm-zone-zeile");
    var zoneName = el("span", "bm-zone-name", e.zone.name);
    zoneName.style.color = e.zone.text;
    zoneZeile.appendChild(zoneName);
    zoneZeile.appendChild(el("span", "bm-zone-datum",
      (auswahl === "heute" ? "Stand " : z.label + " · ") + datumText(e.datum)));
    links.appendChild(zoneZeile);
    links.appendChild(baueKette(e.kette));
    raster.appendChild(links);

    raster.appendChild(baueListe(e));
    wurzel.appendChild(raster);
    wurzel.appendChild(baueRechenweg());

    if (fokusAufKnopf) {
      var aktiv = wurzel.querySelector('.bm-knopf[aria-pressed="true"]');
      if (aktiv) { aktiv.focus(); }
      fokusAufKnopf = false;
    }
  }

  zeichne();
})();
