/* ===========================================================================
   Makro-Dashboard - PDF-Report
   Baut auf Knopfdruck ein PDF mit allen aktuellen Kacheln-Werten, Bereich fuer
   Bereich. Nur auf index.html eingebunden.

   Funktionsweise: Fuer jeden Bereich werden die gleichen Dateien geladen, die
   auch die jeweilige Unterseite laedt (daten/*.js + bereiche/*-kacheln.js).
   Das setzt window.KACHELN / window.GRUPPEN / window.QUELLEN neu. Die Werte
   werden dann mit genau den Funktionen berechnet, die auch die Kacheln selbst
   benutzen (window.MOTOR, siehe motor.js) - keine zweite Rechenlogik, also
   niemals ein Unterschied zwischen Website und PDF.
   Voraussetzung: motor.js ist auf index.html eingebunden (nur zur Berechnung,
   baut auf dieser Seite keine Kacheln, siehe Schutz in motor.js).
   =========================================================================== */

(function () {
  "use strict";

  // Reihenfolge und Quelldateien je Bereich. Sentiment (verworfene Version 1,
  // siehe README Abschnitt 1) und Zinsen (noch nicht gebaut) sind bewusst
  // aussen vor - hier ergaenzen, sobald sie fertig online sind.
  var BEREICHE = [
    {
      name: "Arbeitsmarkt",
      frage: "Zeigt der Arbeitsmarkt Anzeichen von Stress, und wer hat die Macht – Arbeitnehmer oder Arbeitgeber?",
      dateien: ["daten/arbeitsmarkt.js", "daten/webquellen.js", "bereiche/arbeitsmarkt-kacheln.js"]
    },
    {
      name: "Inflation",
      frage: "Wie stark schlagen die vorlaufenden Indikatoren in die realisierte Inflation durch, und was preist der Markt für die Zukunft ein?",
      dateien: ["daten/arbeitsmarkt.js", "daten/webquellen.js", "daten/inflation.js", "bereiche/inflation-kacheln.js"]
    },
    {
      name: "Wachstum",
      frage: "Wo steht die US-Wirtschaft? Reicht die Nachfrage von Konsumenten und Unternehmen, damit weiter mehr Güter und Dienstleistungen produziert werden?",
      dateien: ["daten/webquellen.js", "daten/wachstum.js", "bereiche/wachstum-kacheln.js"]
    },
    {
      name: "Plumbing",
      frage: "Wie läuft es hinter den Kulissen des Finanzsystems? Ist USD-Funding locker oder unter Stress, und wie angespannt ist das Marktumfeld insgesamt?",
      dateien: ["daten/plumbing.js", "bereiche/plumbing-kacheln.js"]
    },
    {
      name: "Regime",
      frage: "In welchem Zinskurven- und Marktregime befinden wir uns, und welche Assets performen erfahrungsgemäß in diesem Umfeld?",
      dateien: ["daten/regime.js", "bereiche/regime-kacheln.js"],
      klassifikation: true
    }
  ];

  var FARBE_GUT = [30, 120, 70];
  var FARBE_SCHLECHT = [180, 60, 50];
  var FARBE_KOPF = [40, 60, 90];

  /* --- Skripte nachladen --------------------------------------------------- */

  var geladeneTags = [];

  function ladeSkript(pfad, bereichsname) {
    return new Promise(function (resolve, reject) {
      var tag = document.createElement("script");
      tag.src = pfad;
      tag.onload = function () { resolve(); };
      tag.onerror = function () {
        reject(new Error("Datei nicht gefunden: " + pfad + " (Bereich " + bereichsname + ")"));
      };
      document.head.appendChild(tag);
      geladeneTags.push(tag);
    });
  }

  async function ladeDateienNacheinander(dateien, bereichsname) {
    for (var i = 0; i < dateien.length; i++) {
      await ladeSkript(dateien[i], bereichsname);
    }
  }

  function aufraeumen() {
    geladeneTags.forEach(function (tag) {
      if (tag.parentNode) { tag.parentNode.removeChild(tag); }
    });
    geladeneTags = [];
  }

  /* --- Werte je Kachel, exakt wie auf der Website -------------------------- */

  function standAusQuellen(quellen) {
    for (var name in quellen) {
      if (quellen[name] && quellen[name].erzeugt) { return quellen[name].erzeugt; }
    }
    return "";
  }

  function standHuebsch(iso) {
    if (!iso) { return ""; }
    var teile = iso.split(" ");
    var datum = teile[0].split("-");
    if (datum.length !== 3) { return iso; }
    return datum[2] + "." + datum[1] + "." + datum[0] + (teile[1] ? ", " + teile[1] + " Uhr" : "");
  }

  function kachelZeile(k) {
    var M = window.MOTOR;
    var r = M.reihe(k);
    var punkte = M.punkteVon(k);

    if (!r || !punkte.length) {
      return { titel: k.titel, wert: "–", veraenderung: "–", stand: "keine Daten", farbe: null };
    }

    var letzter = punkte[punkte.length - 1];
    var art = M.frequenzArt(k);
    var wertText = M.zahl(letzter.v, k.format);
    var einheit = M.einheitVon(k);
    if (einheit) { wertText += " " + einheit; }

    var veraenderung = "";
    var farbe = null;
    var schritt = k.vergleich || 1;

    if (k.vergleichArt === "vorwert") {
      if (punkte.length > 1) {
        veraenderung = k.vergleichName + " " + M.zahl(punkte[punkte.length - 2].v, k.format);
      }
    } else if (punkte.length > schritt) {
      var vorher = punkte[punkte.length - 1 - schritt];
      var diff = letzter.v - vorher.v;
      veraenderung = M.veraenderungText(diff, k.format) + " (" + k.vergleichName + ")";
      var klasse = M.deltaKlasse(M.gerundet(diff, k.format), k.richtung);
      if (klasse === "delta-gut") { farbe = FARBE_GUT; }
      else if (klasse === "delta-schlecht") { farbe = FARBE_SCHLECHT; }
    } else if (k.quelle === "web" && r.veraenderung !== undefined) {
      var vz = r.veraenderung;
      veraenderung = (vz > 0 ? "+" : "−") + Math.abs(vz).toLocaleString("de-DE") + " %";
    }

    // Ohne Verlauf steht auf der Kachel die Einstufung statt der Linie
    if (punkte.length < 2) {
      var stufe = M.stufeText(k, letzter.v);
      if (stufe) { veraenderung = veraenderung ? veraenderung + " · " + stufe : stufe; }
    }

    return {
      titel: k.titel,
      wert: wertText,
      veraenderung: veraenderung || "–",
      stand: "Stand " + M.datumText(letzter.d, art),
      farbe: farbe
    };
  }

  function leseKlassifikation(daten) {
    if (!daten || !daten.klassifikation) { return null; }
    function datumText(iso) {
      if (!iso) { return "–"; }
      var t = iso.split("-");
      return t[2] + "." + t[1] + "." + t[0];
    }
    var k = daten.klassifikation;
    var eintraege = [
      { titel: "ZSK-Kurvenform", k: k.zsk },
      { titel: "Makro-Regime", k: k.makro },
      { titel: "DXY/ZB1-Quadrant", k: k.quadrant }
    ];
    return eintraege.filter(function (e) { return e.k; }).map(function (e) {
      return {
        titel: e.titel,
        wert: e.k.label,
        seit: "seit " + datumText(e.k.seitDatum) + " (" + e.k.handelstage + " Handelstage)"
      };
    });
  }

  async function ladeBereichsDaten(bereich) {
    await ladeDateienNacheinander(bereich.dateien, bereich.name);

    var kacheln = window.KACHELN || [];
    var gruppen = (window.GRUPPEN || [])
      .map(function (g) {
        return {
          titel: g.titel,
          kacheln: kacheln.filter(function (k) { return k.gruppe === g.id; }).map(kachelZeile)
        };
      })
      .filter(function (g) { return g.kacheln.length; });

    // Falls eine Konfiguration mal ohne Gruppen auskommt: alles in eine Gruppe
    if (!gruppen.length && kacheln.length) {
      gruppen = [{ titel: null, kacheln: kacheln.map(kachelZeile) }];
    }

    var ergebnis = {
      name: bereich.name,
      frage: bereich.frage,
      stand: standHuebsch(standAusQuellen(window.QUELLEN || {})),
      gruppen: gruppen,
      klassifikation: bereich.klassifikation ? leseKlassifikation(window.REGIME_DATEN) : null
    };
    return ergebnis;
  }

  /* --- PDF zusammenbauen ---------------------------------------------------- */

  // Neue Seite, falls fuer den naechsten Block (Ueberschrift + mind. eine
  // Tabellenzeile) nicht mehr genug Platz auf der aktuellen Seite ist.
  function platzPruefen(doc, y, minHoehe) {
    var seitenHoehe = doc.internal.pageSize.getHeight();
    if (y + minHoehe > seitenHoehe - 15) {
      doc.addPage();
      return 20;
    }
    return y;
  }

  function baueUndSpeicherePdf(ergebnisse) {
    var jsPDF = window.jspdf && window.jspdf.jsPDF;
    if (!jsPDF) { throw new Error("PDF-Bibliothek (jsPDF) konnte nicht geladen werden - Internetverbindung prüfen."); }

    var doc = new jsPDF({ unit: "mm", format: "a4" });
    var jetzt = new Date();
    var datumLang = jetzt.toLocaleDateString("de-DE") + ", " +
      jetzt.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) + " Uhr";

    doc.setFontSize(18);
    doc.setTextColor(20);
    doc.text("Makro-Dashboard – Report", 14, 18);
    doc.setFontSize(10);
    doc.setTextColor(110);
    doc.text("Erzeugt am " + datumLang, 14, 25);
    doc.text("Werte identisch mit der Website, je Bereich der zuletzt abgerufene Datenstand.", 14, 30);

    ergebnisse.forEach(function (bereich, idx) {
      var y;
      if (idx === 0) {
        y = 40;
      } else {
        doc.addPage();
        y = 20;
      }

      doc.setFontSize(14);
      doc.setTextColor(20);
      doc.text(bereich.name, 14, y);
      y += 6;

      if (bereich.frage) {
        doc.setFontSize(9);
        doc.setTextColor(90);
        var zeilenFrage = doc.splitTextToSize(bereich.frage, 180);
        doc.text(zeilenFrage, 14, y);
        y += zeilenFrage.length * 4 + 2;
      }

      if (bereich.stand) {
        doc.setFontSize(8);
        doc.setTextColor(130);
        doc.text("Datenstand: " + bereich.stand, 14, y);
        y += 6;
      } else {
        y += 2;
      }

      bereich.gruppen.forEach(function (gruppe) {
        y = platzPruefen(doc, y, 20);
        if (gruppe.titel) {
          doc.setFontSize(10);
          doc.setTextColor(60);
          doc.text(gruppe.titel, 14, y);
          y += 4;
        }

        var body = gruppe.kacheln.map(function (k) {
          return [k.titel, k.wert, k.veraenderung, k.stand];
        });
        var farben = gruppe.kacheln.map(function (k) { return k.farbe; });

        doc.autoTable({
          startY: y,
          head: [["Kennzahl", "Wert", "Veränderung", "Stand"]],
          body: body,
          styles: { fontSize: 8, cellPadding: 2, textColor: [30, 30, 30] },
          headStyles: { fillColor: FARBE_KOPF, textColor: 255 },
          alternateRowStyles: { fillColor: [245, 245, 242] },
          margin: { left: 14, right: 14 },
          didParseCell: function (data) {
            if (data.section === "body" && data.column.index === 2) {
              var farbe = farben[data.row.index];
              if (farbe) { data.cell.styles.textColor = farbe; }
            }
          }
        });

        y = doc.lastAutoTable.finalY + 7;
      });

      if (bereich.klassifikation && bereich.klassifikation.length) {
        y = platzPruefen(doc, y, 30);
        doc.setFontSize(11);
        doc.setTextColor(20);
        doc.text("Aktuelle Regime-Einstufung", 14, y);
        y += 4;
        doc.autoTable({
          startY: y,
          head: [["Einstufung", "Wert", "Seit"]],
          body: bereich.klassifikation.map(function (e) { return [e.titel, e.wert, e.seit]; }),
          styles: { fontSize: 8, cellPadding: 2, textColor: [30, 30, 30] },
          headStyles: { fillColor: FARBE_KOPF, textColor: 255 },
          margin: { left: 14, right: 14 }
        });
      }
    });

    var dateiDatum = jetzt.toISOString().slice(0, 10);
    doc.save("Makro-Report-" + dateiDatum + ".pdf");
  }

  /* --- Knopf ----------------------------------------------------------------- */

  async function erzeugeReport(knopf) {
    var textVorher = knopf.textContent;
    knopf.disabled = true;
    try {
      var ergebnisse = [];
      for (var i = 0; i < BEREICHE.length; i++) {
        knopf.textContent = "Lade " + BEREICHE[i].name + " …";
        ergebnisse.push(await ladeBereichsDaten(BEREICHE[i]));
      }
      knopf.textContent = "Baue PDF …";
      baueUndSpeicherePdf(ergebnisse);
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
