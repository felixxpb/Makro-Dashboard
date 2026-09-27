/* ===========================================================================
   Event-Kalender (Startseite, gebaut 2026-09-25)

   Zeigt die Wirtschaftstermine der laufenden Woche unter den Bereichs-Kacheln
   auf index.html. Aufbau nach Forex-Factory-Vorbild (Tagestrenner, farbige
   Impact-Punkte, kompakte Zeilen), aber in Farben und Typografie des
   Dashboards (Vorgabe Felix, 2026-09-25).

   Daten: daten/kalender.js (Forex-Factory-Feed, gefiltert auf Felix' acht
   Waehrungen). Siehe 03_Doku/Datenquellen_Kalender.md.

   ZEITEN: Der Feed liefert ISO-Zeitstempel mit Zeitzonen-Versatz
   (z. B. "2026-09-21T06:00:00-04:00"). new Date() rechnet das automatisch auf
   die lokale Zeit des Geraets um - auf Felix' Rechner und Handy also deutsche
   Zeit. Genau so gewuenscht, funktioniert auch unterwegs.
   =========================================================================== */
(function () {
  "use strict";

  var D = window.KALENDER_DATEN;
  var WURZEL = document.getElementById("kalenderBereich");
  if (!WURZEL) { return; }

  /* --- Impact-Stufen --------------------------------------------------------
     Die Schluessel sind die Werte, die der Feed liefert.                   */
  var STUFEN = [
    { id: "High", text: "Hoch", klasse: "imp-hoch" },
    { id: "Medium", text: "Mittel", klasse: "imp-mittel" },
    { id: "Low", text: "Niedrig", klasse: "imp-niedrig" },
    { id: "Holiday", text: "Feiertag", klasse: "imp-feiertag" }
  ];

  function stufeVon(id) {
    for (var i = 0; i < STUFEN.length; i++) {
      if (STUFEN[i].id === id) { return STUFEN[i]; }
    }
    return { id: id, text: id || "–", klasse: "imp-sonst" };
  }

  var WOCHENTAGE = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

  /* --- Zustand: welche Stufen sind eingeblendet ---------------------------- */
  var sichtbar = { High: true, Medium: true, Low: true, Holiday: true };

  function el(tag, klasse, text) {
    var n = document.createElement(tag);
    if (klasse) { n.className = klasse; }
    if (text !== undefined && text !== null) { n.textContent = String(text); }
    return n;
  }

  function zwei(n) { return (n < 10 ? "0" : "") + n; }

  function tagesSchluessel(dt) {
    return dt.getFullYear() + "-" + zwei(dt.getMonth() + 1) + "-" + zwei(dt.getDate());
  }

  function datumLang(dt) {
    return WOCHENTAGE[dt.getDay()] + ", " + zwei(dt.getDate()) + "." + zwei(dt.getMonth() + 1) + "." + dt.getFullYear();
  }

  function uhrzeit(dt) {
    return zwei(dt.getHours()) + ":" + zwei(dt.getMinutes());
  }

  /* --- Fehlender oder leerer Datenstand ------------------------------------ */
  if (!D || !D.termine || !D.termine.length) {
    var leer = el("section", "kalender");
    leer.appendChild(el("h2", null, "Termine dieser Woche"));
    leer.appendChild(el("p", "kalender-hinweis",
      "Noch keine Termine geladen. Bitte einmal " +
      "02_Datenskripte\\Daten-Abrufen-Kalender.ps1 ausführen."));
    WURZEL.appendChild(leer);
    return;
  }

  /* --- Termine vorbereiten -------------------------------------------------- */
  var termine = D.termine.map(function (t) {
    var dt = new Date(t.d);
    return {
      dt: dt,
      zeit: dt.getTime(),
      tag: tagesSchluessel(dt),
      waehrung: t.waehrung,
      titel: t.titel,
      impact: t.impact,
      prognose: t.prognose,
      vorher: t.vorher,
      ganztaegig: !!t.ganztaegig
    };
  }).filter(function (t) {
    return !isNaN(t.zeit);
  }).sort(function (a, b) {
    return a.zeit - b.zeit;
  });

  var jetzt = Date.now();
  var heute = tagesSchluessel(new Date());

  // Naechster anstehender Termin (fuer die "Als Naechstes"-Markierung).
  // Feiertage zaehlen dafuer nicht, die haben keine sinnvolle Uhrzeit.
  var naechsterZeitpunkt = null;
  termine.forEach(function (t) {
    if (t.ganztaegig || t.zeit < jetzt) { return; }
    if (naechsterZeitpunkt === null || t.zeit < naechsterZeitpunkt) {
      naechsterZeitpunkt = t.zeit;
    }
  });

  /* --- Geruest --------------------------------------------------------------- */
  var abschnitt = el("section", "kalender");
  abschnitt.setAttribute("aria-labelledby", "kal-titel");

  var kopf = el("div", "kalender-kopf");
  var kopfLinks = el("div");
  var h2 = el("h2", null, "Termine dieser Woche");
  h2.id = "kal-titel";
  kopfLinks.appendChild(h2);

  var erster = termine[0].dt, letzter = termine[termine.length - 1].dt;
  var spanne = zwei(erster.getDate()) + "." + zwei(erster.getMonth() + 1) + ". – " +
               zwei(letzter.getDate()) + "." + zwei(letzter.getMonth() + 1) + "." + letzter.getFullYear();
  kopfLinks.appendChild(el("p", "kalender-unter",
    spanne + " · alle Zeiten in deiner lokalen Zeit · " + D.waehrungen.join(", ")));
  kopf.appendChild(kopfLinks);

  /* Filter-Knoepfe je Impact-Stufe */
  var filter = el("div", "kalender-filter");
  filter.setAttribute("role", "group");
  filter.setAttribute("aria-label", "Nach Bedeutung filtern");
  STUFEN.forEach(function (s) {
    var anzahl = termine.filter(function (t) { return t.impact === s.id; }).length;
    if (!anzahl) { return; }
    var b = el("button", "filter-knopf aktiv");
    b.type = "button";
    b.dataset.stufe = s.id;
    b.setAttribute("aria-pressed", "true");
    b.appendChild(el("span", "imp-punkt " + s.klasse));
    b.appendChild(el("span", null, s.text));
    b.appendChild(el("span", "filter-anzahl", anzahl));
    b.addEventListener("click", function () {
      sichtbar[s.id] = !sichtbar[s.id];
      b.classList.toggle("aktiv", sichtbar[s.id]);
      b.setAttribute("aria-pressed", String(sichtbar[s.id]));
      zeichneListe();
    });
    filter.appendChild(b);
  });
  kopf.appendChild(filter);
  abschnitt.appendChild(kopf);

  var liste = el("div", "kalender-liste");
  abschnitt.appendChild(liste);

  var fuss = el("p", "kalender-fuss",
    "Quelle: " + (D.quelle || "Forex Factory") +
    (D.erzeugt ? " · Stand " + D.erzeugt.replace(" ", ", ") + " Uhr" : "") +
    " · Prognose und Vorwert wie veröffentlicht, ohne tatsächlichen Wert");
  abschnitt.appendChild(fuss);

  WURZEL.appendChild(abschnitt);

  /* --- Liste zeichnen ---------------------------------------------------------
     Bewusst EINE durchgehende Tabelle fuer die ganze Woche statt einer pro Tag:
     nur so fluchten die Spalten ueber alle Tage und es reicht ein einziger
     Tabellenkopf. Die Tagestrenner sind Zeilen mit colspan innerhalb der
     Tabelle.                                                                */
  function zeichneListe() {
    liste.innerHTML = "";

    var gezeigt = termine.filter(function (t) { return sichtbar[t.impact] !== false; });

    if (!gezeigt.length) {
      liste.appendChild(el("p", "kalender-hinweis",
        "Keine Termine mit den gewählten Stufen. Blende oben wieder eine Stufe ein."));
      return;
    }

    var tabelle = document.createElement("table");
    tabelle.className = "kalender-tabelle";

    var thead = document.createElement("thead");
    var kopfReihe = document.createElement("tr");
    [
      { t: "Zeit", k: "k-zeit" },
      { t: "Whg.", k: "k-waehrung" },
      { t: "", k: "k-impact" },
      { t: "Termin", k: "k-titel" },
      { t: "Prognose", k: "k-wert" },
      { t: "Vorwert", k: "k-wert k-vorher" }
    ].forEach(function (s) {
      var th = el("th", s.k, s.t);
      kopfReihe.appendChild(th);
    });
    thead.appendChild(kopfReihe);
    tabelle.appendChild(thead);

    var tbody = document.createElement("tbody");
    tabelle.appendChild(tbody);
    liste.appendChild(tabelle);

    var aktuellerTag = null;

    gezeigt.forEach(function (t) {
      if (t.tag !== aktuellerTag) {
        aktuellerTag = t.tag;

        var istHeute = t.tag === heute;
        var trTag = document.createElement("tr");
        trTag.className = "tag-zeile" + (istHeute ? " tag-heute" : "");
        var tdTag = document.createElement("td");
        tdTag.colSpan = 6;
        tdTag.appendChild(el("span", "tag-name", datumLang(t.dt)));
        if (istHeute) { tdTag.appendChild(el("span", "tag-heute-marke", "Heute")); }
        trTag.appendChild(tdTag);
        tbody.appendChild(trTag);
      }

      var s = stufeVon(t.impact);
      // Ganztaegige Eintraege haben keine sinnvolle Uhrzeit, deshalb wird bei
      // ihnen der Kalendertag verglichen statt des Zeitpunkts. Sonst blieben
      // laengst vergangene Feiertage als einzige Zeilen hell.
      var vorbei = t.ganztaegig ? (t.tag < heute) : (t.zeit < jetzt);
      var istNaechster = !t.ganztaegig && t.zeit === naechsterZeitpunkt;

      var tr = document.createElement("tr");
      tr.className = (vorbei ? "termin-vorbei " : "") + (istNaechster ? "termin-naechster" : "");

      var tdZeit = el("td", "k-zeit", t.ganztaegig ? "Ganztägig" : uhrzeit(t.dt));
      tr.appendChild(tdZeit);

      var tdW = el("td", "k-waehrung");
      tdW.appendChild(el("span", "waehrung-marke", t.waehrung));
      tr.appendChild(tdW);

      var tdI = el("td", "k-impact");
      var punkt = el("span", "imp-punkt " + s.klasse);
      punkt.title = "Bedeutung: " + s.text;
      punkt.setAttribute("aria-label", "Bedeutung: " + s.text);
      tdI.appendChild(punkt);
      tr.appendChild(tdI);

      var tdT = el("td", "k-titel");
      tdT.appendChild(el("span", null, t.titel));
      if (istNaechster) { tdT.appendChild(el("span", "naechster-marke", "Als Nächstes")); }
      tr.appendChild(tdT);

      tr.appendChild(el("td", "k-wert", t.prognose ? t.prognose : "–"));
      tr.appendChild(el("td", "k-wert k-vorher", t.vorher ? t.vorher : "–"));

      tbody.appendChild(tr);
    });
  }

  zeichneListe();
})();
