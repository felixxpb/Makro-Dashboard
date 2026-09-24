/* ===========================================================================
   Konfiguration Arbeitsmarkt
   Alles, was aus dem Trading Plan stammt, steht hier an einer Stelle:
   Pruef­frage, Schwellenwerte und Einordnung. Wird vor motor.js geladen.
   =========================================================================== */

window.QUELLEN = {
  fred: window.ARBEITSMARKT_DATEN,
  web:  window.WEBQUELLEN_DATEN
};

window.GRUPPEN = [
  { id: "harte",  titel: "Harte Daten", hinweis: "Tatsächlich gemessene Zahlen, keine Umfragen." },
  { id: "jolts",  titel: "JOLTS – Angebot und Nachfrage", hinweis: "Großer Abstand zwischen offenen Stellen und Neueinstellungen gilt laut Trading Plan als Warnsignal." },
  { id: "weiche", titel: "Weiche Daten und Vorlauf", hinweis: "Umfragen und Ankündigungen – sie laufen den harten Daten voraus." }
];

window.KACHELN = [
  {
    schluessel: "ICSA", quelle: "fred", gruppe: "harte",
    titel: "Initial Claims",
    untertitel: "Erstanträge auf Arbeitslosenhilfe",
    frage: "Zeigt der Arbeitsmarkt Anzeichen von Stress?",
    einordnung: "Mehr Jobverluste führen zu mehr Anträgen. Laut Trading Plan zählt der Trend der letzten 8 Wochen, nicht der einzelne Wert.",
    format: "tausend", richtung: "hoch_schlecht",
    vergleich: 8, vergleichName: "vor 8 Wochen",
    trendFenster: 8
  },
  {
    schluessel: "UNRATE", quelle: "fred", gruppe: "harte",
    titel: "Unemployment Rate",
    untertitel: "Arbeitslosenquote",
    frage: "Steigt oder sinkt die U-Rate?",
    einordnung: "Die U-Rate ist eine nachlaufende Größe. Sie bestätigt, was Claims und JOLTS vorher angezeigt haben.",
    format: "prozent", richtung: "hoch_schlecht",
    vergleich: 1, vergleichName: "Vormonat"
  },
  {
    schluessel: "PAYEMS", quelle: "fred", gruppe: "harte",
    titel: "Nonfarm Payrolls",
    untertitel: "Veränderung der Beschäftigung zum Vormonat",
    frage: "Wie entwickelt sich die Beschäftigung insgesamt?",
    einordnung: "Gezeigt wird die monatliche Veränderung, nicht der Bestand. Die Nulllinie trennt Aufbau von Abbau.",
    format: "tausendDiff", richtung: "hoch_gut",
    ableitung: "diff", schwellen: [{ wert: 0, text: "" }],
    // Der Wert ist schon eine Veraenderung. Daneben steht deshalb der
    // Vormonatswert, nicht die Differenz zweier Differenzen.
    vergleichArt: "vorwert", vergleichName: "Vormonat"
  },
  {
    // Quelle seit 2026-09-24 FRED CES0500000003 statt des TradingEconomics-
    // Seitenabrufs: gleiche Reihe, aber volle Historie und stabiler API-Abruf.
    schluessel: "CES0500000003", quelle: "fred", gruppe: "harte",
    titel: "Average Hourly Earnings",
    untertitel: "Durchschnittlicher Stundenlohn, Veränderung zum Vormonat",
    frage: "Wie stark steigen die Löhne?",
    einordnung: "Lohnwachstum ist im Makro-Kontext nicht eindeutig gut oder schlecht: es stützt den Konsum, kann aber gleichzeitig die Service-Inflation antreiben. Gezeigt wird die monatliche Veränderungsrate, nicht der Dollarbetrag.",
    format: "prozent", richtung: "neutral",
    schwellen: [{ wert: 0, text: "" }],
    // Der Wert ist schon eine Veraenderung (MoM %). Daneben steht deshalb der
    // Vormonatswert, nicht die Differenz zweier Differenzen (gleiches Muster
    // wie bei Nonfarm Payrolls).
    vergleichArt: "vorwert", vergleichName: "Vormonat",
    hauptName: "MoM (Vormonat)",
    // Zweite Linie: YoY, gerechnet aus der Dollar-Niveaureihe derselben
    // FRED-Serie. Beide Linien sind Prozent, also eine Wertachse (gleiches
    // Muster wie QoQ/YoY beim Employment Cost Index).
    zweitreihe: {
      schluessel: "CES0500000003_LVL", ableitung: "yoy", ableitungSchritt: 12,
      name: "YoY (Vorjahr)", kennwert: "YoY aktuell", luecken: true
    }
  },

  {
    schluessel: "JTSJOR", quelle: "fred", gruppe: "jolts",
    titel: "Job Openings Rate",
    untertitel: "Offene Stellen",
    frage: "Wie hoch ist die reine Nachfrage nach Arbeitskräften?",
    einordnung: "Steigende Zahl bedeutet hohen Wettbewerb um gute Leute. Sinkende Zahl bedeutet, der Markt entspannt sich.",
    format: "prozent", richtung: "hoch_gut",
    vergleich: 1, vergleichName: "Vormonat",
    zweitreihe: { schluessel: "JTSHIR", name: "Hires Rate" }
  },
  {
    schluessel: "JTSHIR", quelle: "fred", gruppe: "jolts",
    titel: "Hires Rate",
    untertitel: "Neueinstellungen",
    frage: "Wie viele Menschen haben wirklich einen Job gefunden?",
    einordnung: "Ein großer Abstand zwischen offenen Stellen und Neueinstellungen gilt laut Trading Plan als Warnsignal: Stellen werden ausgeschrieben, aber nicht besetzt.",
    format: "prozent", richtung: "hoch_gut",
    vergleich: 1, vergleichName: "Vormonat",
    zweitreihe: { schluessel: "JTSJOR", name: "Job Openings Rate" }
  },
  {
    schluessel: "JTSTSR", quelle: "fred", gruppe: "jolts",
    titel: "Total Separations Rate",
    untertitel: "Abgänge gesamt",
    frage: "Qualitative Bewertung des Arbeitsmarktes.",
    einordnung: "Hohe Abgänge bedeuten, Arbeit gibt es reichlich. Niedrige Abgänge bedeuten, die Leute klammern sich an ihren Job.",
    format: "prozent", richtung: "neutral",
    vergleich: 1, vergleichName: "Vormonat"
  },
  {
    schluessel: "JTSQUR", quelle: "fred", gruppe: "jolts",
    titel: "Quits Rate",
    untertitel: "Kündigungen durch Arbeitnehmer",
    frage: "Wie ist der Stand von Angebot und Nachfrage?",
    einordnung: "Hohe Rate: Leute finden sofort einen besseren Job, das ist ein Arbeitnehmermarkt und stützt die Lohnpreisinflation. Niedrige Rate: die Macht liegt beim Arbeitgeber.",
    format: "prozent", richtung: "hoch_gut",
    vergleich: 1, vergleichName: "Vormonat"
  },

  {
    schluessel: "ISM_MFG_EMP", quelle: "web", gruppe: "weiche",
    titel: "ISM Manufacturing Employment",
    untertitel: "Beschäftigungsindex Industrie",
    frage: "Was erwarten die Einkaufsmanager?",
    einordnung: "Werte über 50 bedeuten Expansion, unter 50 Kontraktion. Laut Trading Plan zählen Gesamttrend und die letzten 3 bis 4 Monate.",
    format: "punkte", richtung: "hoch_gut", pmiFarbe: true,
    schwellen: [{ wert: 50, text: "Expansion / Kontraktion" }],
    stufe: { grenze: 50, ueber: "Expansion", unter: "Kontraktion" }
  },
  {
    schluessel: "ISM_SVC_EMP", quelle: "web", gruppe: "weiche",
    titel: "ISM Services Employment",
    untertitel: "Beschäftigungsindex Dienstleistung",
    frage: "Was erwarten die Einkaufsmanager?",
    einordnung: "Werte über 50 bedeuten Expansion, unter 50 Kontraktion. Laut Trading Plan zählen Gesamttrend und die letzten 3 bis 4 Monate.",
    format: "punkte", richtung: "hoch_gut", pmiFarbe: true,
    schwellen: [{ wert: 50, text: "Expansion / Kontraktion" }],
    stufe: { grenze: 50, ueber: "Expansion", unter: "Kontraktion" }
  },
  {
    schluessel: "ECIALLCIV", quelle: "fred", gruppe: "weiche",
    titel: "Employment Cost Index",
    untertitel: "Lohnkosten, Veränderung zum Vorquartal (QoQ)",
    frage: "Wer kontrolliert die Nachfrage am Arbeitsmarkt?",
    einordnung: "Höhere Lohnkostenerhöhung bedeutet Macht bei den Arbeitnehmern. Ein hoher ECI stützt die Kerninflation, weil die Service-Inflation dann nicht sinken kann.",
    format: "prozent", richtung: "neutral",
    ableitung: "qoq", vergleichArt: "vorwert", vergleichName: "Vorquartal",
    hauptName: "QoQ (Vorquartal)",
    zweitreihe: { schluessel: "ECIALLCIV", ableitung: "yoy", ableitungSchritt: 4, name: "YoY (Vorjahr)", kennwert: "YoY aktuell" }
  },
  {
    schluessel: "CHALLENGER", quelle: "web", gruppe: "weiche",
    titel: "Challenger Job Cuts",
    untertitel: "Angekündigte Entlassungen",
    frage: "Haben Firmen vor, Personal zu entlassen?",
    einordnung: "Misst das Erdbeben, bevor es passiert: Unternehmen kündigen Entlassungen an, lange bevor sie in Claims und U-Rate auftauchen.",
    format: "ganz", richtung: "hoch_schlecht",
    vergleich: 1, vergleichName: "Vormonat",
    hauptName: "Ankündigungen",
    // Zweite Linie: derselbe Wert um zwoelf Monate versetzt. Bewusst NICHT die
    // YoY-Prozentreihe - die liefe in einer voellig anderen Groessenordnung als
    // die Stueckzahlen und waere auf der gemeinsamen Wertachse nicht ablesbar
    // (Gestaltungsregel: nie zwei Wertachsen in einem Graph). Die exakte
    // Prozentzahl steht stattdessen als Kennwert unter dem Graph.
    zweitreihe: {
      schluessel: "CHALLENGER", ableitung: "verschoben", ableitungSchritt: 12,
      name: "Vorjahresmonat", luecken: true
    },
    zusatzKennwerte: [
      { titel: "YoY aktuell", ableitung: "yoy", ableitungSchritt: 12, format: "prozent" }
    ]
  }
];
