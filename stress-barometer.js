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
  var heute = STRESS.stand();
  var auswahl = heute;          /* gewaehlter Tag (ISO) */
  var kalenderOffen = false;
  var anzeigeMonat = heute ? heute.slice(0, 7) : null;   /* "JJJJ-MM" */
  var fokusAufKnopf = false;   /* nach Klick Fokus erhalten (Tastaturbedienung) */
  var MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
  var WOCHENTAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

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

  function zweiStellig(n) { return (n < 10 ? "0" : "") + n; }

  function monatVerschieben(ym, delta) {
    var g = Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1 + delta;
    var j = Math.floor(g / 12);
    return j + "-" + zweiStellig(g - j * 12 + 1);
  }

  function baueKalender() {
    var frueh = STRESS.fruehesterTag();
    var minMonat = frueh ? frueh.slice(0, 7) : anzeigeMonat;
    var maxMonat = heute.slice(0, 7);

    var kal = el("div", "bm-kalender");
    kal.setAttribute("role", "dialog");
    kal.setAttribute("aria-label", "Kalender mit Tageswerten");

    var kopf = el("div", "bm-kal-kopf");
    var zurueck = el("button", "bm-kal-nav", "‹");
    zurueck.type = "button";
    zurueck.setAttribute("aria-label", "Vorheriger Monat");
    zurueck.setAttribute("data-fokus", "nav-zurueck");
    zurueck.disabled = anzeigeMonat <= minMonat;
    zurueck.addEventListener("click", function () {
      anzeigeMonat = monatVerschieben(anzeigeMonat, -1); fokusAufKnopf = "nav-zurueck"; zeichne();
    });
    var vor = el("button", "bm-kal-nav", "›");
    vor.type = "button";
    vor.setAttribute("aria-label", "Nächster Monat");
    vor.setAttribute("data-fokus", "nav-vor");
    vor.disabled = anzeigeMonat >= maxMonat;
    vor.addEventListener("click", function () {
      anzeigeMonat = monatVerschieben(anzeigeMonat, 1); fokusAufKnopf = "nav-vor"; zeichne();
    });
    kopf.appendChild(zurueck);
    kopf.appendChild(el("span", "bm-kal-monat",
      MONATE[Number(anzeigeMonat.slice(5, 7)) - 1] + " " + anzeigeMonat.slice(0, 4)));
    kopf.appendChild(vor);
    kal.appendChild(kopf);

    var raster = el("div", "bm-kal-raster");
    WOCHENTAGE.forEach(function (w) { raster.appendChild(el("span", "bm-kal-wt", w)); });

    var jahr = Number(anzeigeMonat.slice(0, 4)), monat = Number(anzeigeMonat.slice(5, 7));
    var ersterWt = (new Date(Date.UTC(jahr, monat - 1, 1)).getUTCDay() + 6) % 7;   /* Montag = 0 */
    var tage = new Date(Date.UTC(jahr, monat, 0)).getUTCDate();
    for (var l = 0; l < ersterWt; l++) { raster.appendChild(el("span", "bm-kal-leer")); }

    for (var t = 1; t <= tage; t++) {
      (function (tag) {
        var iso = anzeigeMonat + "-" + zweiStellig(tag);
        var e = (iso <= heute && (!frueh || iso >= frueh)) ? STRESS.berechne(iso) : null;
        var zelle = el("button", "bm-tag");
        zelle.type = "button";
        zelle.appendChild(el("span", "bm-tag-nr", String(tag)));
        if (e) {
          var istHandelstag = STRESS.hatBeobachtung(iso);
          zelle.appendChild(el("span", "bm-tag-wert", zahl(e.barometer, 0)));
          zelle.style.setProperty("--zone", e.zone.farbe);
          if (!istHandelstag) { zelle.className += " bm-tag-ohne"; }
          if (iso === auswahl) { zelle.className += " bm-tag-aktiv"; zelle.setAttribute("aria-pressed", "true"); }
          zelle.title = datumText(iso) + ": " + zahl(e.barometer, 0) + " · " + e.zone.name +
            (istHandelstag ? "" : " (kein neuer Handelstag, Stand des letzten Handelstags)");
          zelle.setAttribute("aria-label", datumText(iso) + ", Barometer " + zahl(e.barometer, 0) + ", " + e.zone.name);
          zelle.addEventListener("click", function () {
            auswahl = iso; kalenderOffen = false; fokusAufKnopf = "kachel"; zeichne();
          });
        } else {
          zelle.disabled = true;
          zelle.className += " bm-tag-leer";
          zelle.appendChild(el("span", "bm-tag-wert", "–"));
        }
        raster.appendChild(zelle);
      })(t);
    }
    kal.appendChild(raster);
    kal.appendChild(el("p", "bm-kal-hinweis",
      "Gedämpfte Tage (Wochenende, Feiertag) zeigen den Wert des letzten Handelstags."));
    return kal;
  }

  function baueKnoepfe(e) {
    var leiste = el("div", "bm-historie");
    leiste.setAttribute("role", "group");
    leiste.setAttribute("aria-label", "Zeitpunkt wählen");

    var eh = STRESS.berechne(heute);
    var aktuell = el("button", "bm-knopf");
    aktuell.type = "button";
    aktuell.setAttribute("aria-pressed", auswahl === heute ? "true" : "false");
    aktuell.setAttribute("data-fokus", "aktuell");
    aktuell.appendChild(el("span", "bm-knopf-label", "Aktuell"));
    var aw = el("span", "bm-knopf-wert");
    if (eh) {
      var p1 = el("span", "bm-knopf-punkt");
      p1.style.background = eh.zone.farbe;
      aw.appendChild(p1);
      aw.appendChild(document.createTextNode(zahl(eh.barometer, 0) + " · " + eh.zone.name));
    }
    aktuell.appendChild(aw);
    aktuell.addEventListener("click", function () {
      auswahl = heute; anzeigeMonat = heute.slice(0, 7); kalenderOffen = false;
      fokusAufKnopf = "aktuell"; zeichne();
    });
    leiste.appendChild(aktuell);

    var kachel = el("button", "bm-knopf bm-knopf-kal");
    kachel.type = "button";
    kachel.setAttribute("aria-expanded", kalenderOffen ? "true" : "false");
    kachel.setAttribute("aria-pressed", auswahl !== heute ? "true" : "false");
    kachel.setAttribute("data-fokus", "kachel");
    kachel.appendChild(el("span", "bm-knopf-label", "Kalender · Verlauf"));
    var kw = el("span", "bm-knopf-wert");
    var p2 = el("span", "bm-knopf-punkt");
    p2.style.background = e.zone.farbe;
    kw.appendChild(p2);
    kw.appendChild(document.createTextNode(datumText(e.datum) + " · " + zahl(e.barometer, 0) + " · " + e.zone.name));
    kachel.appendChild(kw);
    kachel.addEventListener("click", function () {
      kalenderOffen = !kalenderOffen;
      if (kalenderOffen) { anzeigeMonat = auswahl.slice(0, 7); }
      fokusAufKnopf = "kachel"; zeichne();
    });
    leiste.appendChild(kachel);

    if (kalenderOffen) { leiste.appendChild(baueKalender()); }
    return leiste;
  }

  /* --- Rechenweg --------------------------------------------------------- */

  function baueRechenweg() {
    var d = el("details", "bm-rechenweg");
    d.appendChild(el("summary", null, "So wird gerechnet"));
    var p1 = el("p", null,
      "Jede Kennzahl bekommt einen Score von 0 bis 100: 50 % Wert (wo steht sie), 25 % Trend (Veränderung über 20, 40 und 60 Tage) " +
      "und 25 % Tempo (Veränderung über 8 und 14 Tage). Beim FFSI zählen Wochen statt Tage. Es zählt nur die Stressrichtung, " +
      "Entspannung gibt 0 Punkte. Die Schwellen legte Felix anhand der Historie fest und senkte sie am 11.10.2026 für alle drei Bestandteile ab (Dokumentation: Stress_Barometer_Entwurf).");
    var p2 = el("p", null,
      "Barometer = gewichtete Summe der Scores × " + zahl(STRESS.HEBEL, 1) + " (SOFR × 1,6), bei 100 gedeckelt. Gewichte: " +
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
    var e = auswahl ? STRESS.berechne(auswahl) : null;

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

    wurzel.appendChild(baueKnoepfe(e));

    var raster = el("div", "bm-raster");

    var links = el("div", "bm-links");
    links.appendChild(baueHalbkreis(e));
    var zoneZeile = el("div", "bm-zone-zeile");
    var zoneName = el("span", "bm-zone-name", e.zone.name);
    zoneName.style.color = e.zone.text;
    zoneZeile.appendChild(zoneName);
    zoneZeile.appendChild(el("span", "bm-zone-datum",
      (auswahl === heute ? "Stand " : "Verlauf · ") + datumText(e.datum)));
    links.appendChild(zoneZeile);
    links.appendChild(baueKette(e.kette));
    raster.appendChild(links);

    raster.appendChild(baueListe(e));
    wurzel.appendChild(raster);
    wurzel.appendChild(baueRechenweg());

    if (fokusAufKnopf) {
      var aktiv = wurzel.querySelector('[data-fokus="' + fokusAufKnopf + '"]');
      if (aktiv && !aktiv.disabled) { aktiv.focus(); }
      fokusAufKnopf = false;
    }
  }

  zeichne();
})();
