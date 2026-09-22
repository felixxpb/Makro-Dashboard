/* ===========================================================================
   Konfiguration Wachstum
   Grundlage: 02_Raw/03_Strategien/00_Mein_Trading_Plan.docx, Abschnitt
   "GDP-Analyse", und Makroanalyse_KW38.docx, Abschnitt "Wirtschaft &
   Auftragslage". Details je Quelle stehen in 03_Doku/Datenquellen_Wachstum.md.
   Wird vor motor.js geladen.

   Richtung durchgehend "neutral", wie bei Inflation: keine Farbbewertung von
   Veraenderungen (CLAUDE.md Abschnitt 5). Die Bereiche und Serien-Regeln
   (stufen, serien) geben nur die Schwellen aus dem Trading Plan wieder.
   =========================================================================== */

window.QUELLEN = {
  wachstum: window.WACHSTUM_DATEN,
  web:  window.WEBQUELLEN_DATEN
};

window.GRUPPEN = [
  { id: "gdp",       titel: "GDP", hinweis: "Realisiertes Wachstum und die laufende Prognose der Atlanta Fed, jeweils als annualisierte Veränderung zum Vorquartal." },
  { id: "auftraege", titel: "Auftragslage", hinweis: "Neue und unerledigte Bestellungen in Industrie und Dienstleistung sowie langlebige Güter. Zeigen, wohin die Produktion läuft." },
  { id: "konsument", titel: "Konsumenten und Kleinunternehmen", hinweis: "Weiche Daten aus Umfragen. Konsum macht rund 65 % des GDP aus. Laut Trading Plan immer zusammen mit den harten Daten betrachten." },
  { id: "bau",       titel: "Bau und Zinskontext", hinweis: "Baugenehmigungen reagieren innerhalb von 1 bis 3 Wochen auf Hypothekenzinsen, der GDP-Effekt folgt 6 bis 12 Monate später." },
  { id: "leading",   titel: "Aggregierter Leading-Index", hinweis: "Zusammengesetzter Frühindikator der OECD, 3 bis 12 Monate Vorlauf zur realen Konjunktur." }
];

window.KACHELN = [
  /* --- GDP ------------------------------------------------------------- */
  {
    schluessel: "GDPNOW", quelle: "wachstum", gruppe: "gdp",
    titel: "GDPNow",
    untertitel: "Wachstumsprognose der Atlanta Fed für das laufende Quartal, % annualisiert",
    frage: "Welches Wachstum zeichnet sich für das laufende Quartal ab?",
    einordnung: "GDPNow wird während des Quartals nach jeder relevanten Datenveröffentlichung neu berechnet. Der Wert auf der Kachel ist die aktuellste Schätzung, frühere Quartale zeigen die letzte Schätzung vor der offiziellen GDP-Zahl. Aus der KW38-Analyse: entscheidend ist, wie nachhaltig der Konsum hinter der Prognose ist.",
    format: "prozent", einheitFest: "% ann.", richtung: "neutral",
    schwellen: [{ wert: 0, text: "" }],
    vergleichArt: "vorwert", vergleichName: "Vorquartal"
  },
  {
    schluessel: "A191RL1Q225SBEA", quelle: "wachstum", gruppe: "gdp",
    titel: "Real GDP",
    untertitel: "Realisiertes Wachstum, Veränderung zum Vorquartal, annualisiert (BEA)",
    frage: "Wie stark ist die US-Wirtschaft im letzten Quartal tatsächlich gewachsen?",
    einordnung: "Gesamtwert aller produzierten Endgüter und Dienstleistungen, preisbereinigt. Im Detail liegt die GDPNow-Schätzung als zweite Linie daneben: so ist sichtbar, wie weit Prognose und tatsächliche Zahl je Quartal auseinanderlagen.",
    format: "prozent", einheitFest: "% ann.", richtung: "neutral",
    schwellen: [{ wert: 0, text: "" }],
    vergleichArt: "vorwert", vergleichName: "Vorquartal",
    hauptName: "Real GDP (BEA)",
    zweitreihe: { schluessel: "GDPNOW", quelle: "wachstum", name: "GDPNow (letzte Schätzung)" }
  },

  /* --- Auftragslage ---------------------------------------------------- */
  {
    schluessel: "ISM_MFG_NO", quelle: "web", gruppe: "auftraege",
    titel: "ISM Manufacturing New Orders",
    untertitel: "Neue Bestellungen, Einkaufsmanager Industrie",
    frage: "Wohin läuft die Produktion?",
    einordnung: "Neue Bestellungen sagen voraus, wo die Produktion hinläuft. Laut Trading Plan: 48 bis 52 Normalbereich, über 52 Expansion, 3 Monate unter 47 anhaltende Kontraktion, 6 Monate unter 48 starkes Warnsignal. Im Detail liegt der Backlog Index als zweite Linie daneben: bewegen sich beide gleich, ist die Vorhersagekraft größer.",
    format: "punkte", richtung: "neutral", pmiFarbe: true,
    schwellen: [{ wert: 52, text: "52 Expansion" }, { wert: 48, text: "48" }, { wert: 47, text: "47" }],
    stufen: [
      { ueber: 52, text: "über 52, Expansion" },
      { ab: 48, text: "48 bis 52, Normalbereich" },
      { text: "unter 48" }
    ],
    serien: [
      { unter: 47, anzahl: 3, text: "anhaltende Kontraktion" },
      { unter: 48, anzahl: 6, text: "starkes Warnsignal" }
    ],
    vergleich: 1, vergleichName: "Vormonat",
    hauptName: "New Orders",
    zweitreihe: { schluessel: "ISM_MFG_BACKLOG", quelle: "web", name: "Backlog of Orders" }
  },
  {
    schluessel: "ISM_MFG_BACKLOG", quelle: "web", gruppe: "auftraege",
    titel: "ISM Backlog of Orders",
    untertitel: "Unerledigte Bestellungen, Einkaufsmanager Industrie",
    frage: "Können unerledigte Aufträge sinkende New Orders abfedern?",
    einordnung: "Sinkende New Orders können laut Trading Plan durch Aufträge im Backlog abgefedert werden. Sinken New Orders und Backlog gemeinsam, wird weniger produziert und das GDP sinkt. Der Trading Plan nennt für den Backlog keine eigenen Schwellen.",
    format: "punkte", richtung: "neutral", pmiFarbe: true,
    vergleich: 1, vergleichName: "Vormonat",
    hauptName: "Backlog of Orders",
    zweitreihe: { schluessel: "ISM_MFG_NO", quelle: "web", name: "New Orders" }
  },
  {
    schluessel: "ISM_SVC_BUSACT", quelle: "web", gruppe: "auftraege",
    titel: "ISM Services Business Activity",
    untertitel: "Geschäftsaktivität, Einkaufsmanager Dienstleistung",
    frage: "Wie aktiv ist der Dienstleistungssektor?",
    einordnung: "Service PMI laut Trading Plan: 50,5 bis 54,5 Normalbereich, über 54,5 Expansion, 3 Monate unter 49,5 anhaltende Kontraktion, 6 Monate unter 50,5 starkes Warnsignal. Gezeigt wird der Teilindex Business Activity, wie im ursprünglich verlinkten MacroMicro-Chart.",
    format: "punkte", richtung: "neutral", pmiFarbe: true,
    schwellen: [{ wert: 54.5, text: "54,5 Expansion" }, { wert: 50.5, text: "50,5" }, { wert: 49.5, text: "49,5" }],
    stufen: [
      { ueber: 54.5, text: "über 54,5, Expansion" },
      { ab: 50.5, text: "50,5 bis 54,5, Normalbereich" },
      { text: "unter 50,5" }
    ],
    serien: [
      { unter: 49.5, anzahl: 3, text: "anhaltende Kontraktion" },
      { unter: 50.5, anzahl: 6, text: "starkes Warnsignal" }
    ],
    vergleich: 1, vergleichName: "Vormonat"
  },
  {
    schluessel: "DGORDER", quelle: "wachstum", gruppe: "auftraege",
    titel: "Durable Goods Orders",
    untertitel: "Aufträge für langlebige Güter, Veränderung zum Vormonat",
    frage: "Investieren Unternehmen in Produktion und Maschinen?",
    einordnung: "Aufträge für langlebige Güter (Maschinen, Ausrüstung) zeigen die wirtschaftliche Aktivität von Unternehmen. Steigende Orders bedeuten laut Trading Plan Investitionen in Produktion und Maschinen. Hauptwert ist die Veränderung zum Vormonat (so wird die Zahl üblicherweise gemeldet), im Detail als zweite Linie die Veränderung zum Vorjahr.",
    format: "prozent", einheitFest: "% MoM", richtung: "neutral",
    ableitung: "qoq",
    vergleichArt: "vorwert", vergleichName: "Vormonat",
    hauptName: "MoM (Vormonat)",
    zweitreihe: { schluessel: "DGORDER", quelle: "wachstum", ableitung: "yoy", ableitungSchritt: 12, name: "YoY (Vorjahr)", kennwert: "YoY aktuell" }
  },
  {
    schluessel: "DG_ORDER_SHIP", quelle: "wachstum", gruppe: "auftraege",
    titel: "Order-to-Shipment Ratio",
    untertitel: "Neue Aufträge je ausgelieferter Einheit, langlebige Güter",
    frage: "Kommen mehr Aufträge herein, als ausgeliefert werden kann?",
    einordnung: "Berechnet aus New Orders geteilt durch Shipments (beide Census M3 Survey über FRED). Laut Trading Plan: deutlich über 1 (über 1,3 über längere Zeit) wachsen Aufträge schneller als die Auslieferung, um 1,0 Normalbereich, deutlich unter 1 (unter 0,9 über längere Zeit) schwach.",
    format: "faktor", einheitFest: "", richtung: "neutral",
    schwellen: [{ wert: 1.3, text: "1,3" }, { wert: 1.0, text: "1,0" }, { wert: 0.9, text: "0,9" }],
    stufen: [
      { ueber: 1.3, text: "über 1,3, deutlich über 1" },
      { ab: 0.9, text: "0,9 bis 1,3, um 1,0" },
      { text: "unter 0,9, deutlich unter 1" }
    ],
    serien: [
      { ueber: 1.3, anzahl: 3, text: "über längere Zeit über 1,3" },
      { unter: 0.9, anzahl: 3, text: "über längere Zeit unter 0,9" }
    ],
    vergleich: 1, vergleichName: "Vormonat"
  },

  /* --- Konsumenten und Kleinunternehmen -------------------------------- */
  {
    schluessel: "CB_CCI", quelle: "web", gruppe: "konsument",
    titel: "Consumer Confidence Index",
    untertitel: "Conference Board, Einschätzung der nächsten 6 Monate",
    frage: "Wie schätzen Konsumenten die Wirtschaft in den nächsten 6 Monaten ein?",
    einordnung: "Laut Trading Plan: über 100 sehr optimistisch, 80 bis 100 normal, unter 80 Warnung, unter 65 kritisch. Konsumenten sind die treibende Kraft für New Orders, lassen sich aber leicht durch Nachrichten beeinflussen. Zwischen harten Daten und Erwartung kann eine Lücke entstehen.",
    format: "punkte", richtung: "neutral",
    schwellen: [{ wert: 100, text: "100" }, { wert: 80, text: "80" }, { wert: 65, text: "65" }],
    stufen: [
      { ueber: 100, text: "über 100, sehr optimistisch" },
      { ab: 80, text: "80 bis 100, normal" },
      { ab: 65, text: "unter 80, Warnung" },
      { text: "unter 65, kritisch" }
    ],
    vergleich: 1, vergleichName: "Vormonat"
  },
  {
    schluessel: "MICH_ICE", quelle: "wachstum", gruppe: "konsument",
    titel: "Michigan Consumer Expectations",
    untertitel: "University of Michigan, Index of Consumer Expectations",
    frage: "Was erwarten Konsumenten für Finanzen, Arbeitsmarkt und Wirtschaft?",
    einordnung: "Monatliche Umfrage zu den Erwartungen der Konsumenten, 1 bis 5 Jahre voraus. Laut Trading Plan: 100 optimistisch, 80 bis 100 normal, 60 bis 80 Achtung, unter 60 Warnung. Enthält nur finale Monatswerte, die Vorablesung zur Monatsmitte fehlt.",
    format: "punkte", richtung: "neutral",
    schwellen: [{ wert: 80, text: "80" }, { wert: 60, text: "60" }],
    stufen: [
      { ab: 100, text: "100 und mehr, optimistisch" },
      { ab: 80, text: "80 bis 100, normal" },
      { ab: 60, text: "60 bis 80, Achtung" },
      { text: "unter 60, Warnung" }
    ],
    vergleich: 1, vergleichName: "Vormonat"
  },
  {
    schluessel: "NFIB", quelle: "web", gruppe: "konsument",
    titel: "NFIB Small Business Optimism",
    untertitel: "Zuversicht von Kleinunternehmen",
    frage: "Wie zuversichtlich sind Kleinunternehmen?",
    einordnung: "Kleinunternehmen stehen für rund 50 % der US-Wirtschaft. Laut Trading Plan: ab 105 sehr optimistisch, 100 bis 105 optimistisch, 95 bis 100 normal, 90 bis 95 Achtung, unter 90 Warnung.",
    format: "punkte", richtung: "neutral",
    schwellen: [{ wert: 105, text: "105" }, { wert: 100, text: "100" }, { wert: 95, text: "95" }, { wert: 90, text: "90" }],
    stufen: [
      { ab: 105, text: "ab 105, sehr optimistisch" },
      { ab: 100, text: "100 bis 105, optimistisch" },
      { ab: 95, text: "95 bis 100, normal" },
      { ab: 90, text: "90 bis 95, Achtung" },
      { text: "unter 90, Warnung" }
    ],
    vergleich: 1, vergleichName: "Vormonat"
  },

  /* --- Bau und Zinskontext --------------------------------------------- */
  {
    schluessel: "PERMIT", quelle: "wachstum", gruppe: "bau",
    titel: "Baugenehmigungen",
    untertitel: "Genehmigte Wohneinheiten, Jahresrate in Tausend",
    frage: "Haben Konsumenten die finanzielle Sicherheit für den Hausbau?",
    einordnung: "Mehr Genehmigungen deuten laut Trading Plan auf finanzielle Sicherheit der Konsumenten hin, weniger auf Unsicherheit. Kette: weniger Permits, weniger Baubeginne, weniger Bauarbeitsplätze, weniger Konsum. 6 bis 12 Monate Verzögerung zum GDP. Immer zusammen mit dem Hypothekenzins lesen.",
    format: "tausend", einheitFest: "Tsd.", richtung: "neutral",
    vergleich: 1, vergleichName: "Vormonat"
  },
  {
    schluessel: "MORTGAGE30US", quelle: "wachstum", gruppe: "bau",
    titel: "30Y Fixed Mortgage Rate",
    untertitel: "Durchschnittlicher 30-jähriger Hypothekenzins, wöchentlich",
    frage: "Wie teuer sind Kredite für den Häusermarkt?",
    einordnung: "Laut Trading Plan: liegt die 30Y-Rate 4 Wochen über 6,5 %, fangen die Baugenehmigungen an zu fallen. Baugenehmigungen reagieren innerhalb von 1 bis 3 Wochen auf Änderungen beim Hypothekenzins.",
    format: "faktor", einheitFest: "%", richtung: "neutral",
    schwellen: [{ wert: 6.5, text: "6,5 %" }],
    stufe: { grenze: 6.5, ueber: "Permit-Schwelle", unter: "Permit-Schwelle" },
    serien: [{ ueber: 6.5, anzahl: 4, text: "Permit-Signal" }],
    vergleich: 4, vergleichName: "vor 4 Wochen"
  },

  /* --- Aggregierter Leading-Index -------------------------------------- */
  {
    schluessel: "OECD_CLI", quelle: "wachstum", gruppe: "leading",
    titel: "OECD Composite Leading Indicator",
    untertitel: "Frühindikator USA, 100 = langfristiger Trend",
    frage: "Wo steht die Wirtschaft im Zyklus?",
    einordnung: "Laut Trading Plan: 100 ist die Baseline (langfristiger Durchschnitt), darüber expansiv, darunter kühlt die Wirtschaft ab. Ein Richtungswechsel über 3 bis 6 Monate gilt als wirtschaftlicher Turning-Point. 3 bis 12 Monate Vorlauf zur realen Konjunktur. Quelle direkt OECD, da die FRED-Kopie seit Januar 2024 nicht mehr aktualisiert wird.",
    format: "punkte", einheitFest: "", richtung: "neutral",
    schwellen: [{ wert: 100, text: "100 Baseline" }],
    stufe: { grenze: 100, ueber: "expansiv", unter: "kühlt ab" },
    vergleich: 1, vergleichName: "Vormonat",
    trendFenster: 3
  }, {
  schluessel: "ISM_PMI_MFG",
  quelle: "wachstum",
  gruppe: "leading",
  titel: "ISM Manufacturing PMI",
  untertitel: "Einkaufsmanagerindex Industrie (USA)",
  frage: "Expandiert oder kontrahiert die US-Industrie?",
  einordnung: "Über 50 = Expansion, unter 50 = Kontraktion.",
  format: "punkte",
  einheitFest: "Index",
  richtung: "neutral",
  schwellen: [{ wert: 50, text: "50 Baseline" }],
  stufen: [
    { ueber: 54.5, text: "über 54,5, Expansion" },
    { ab: 50.5, text: "50,5 bis 54,5, Normalbereich" },
    { text: "unter 50,5, Kontraktion" },
  ],
  serien: [
    { unter: 47, anzahl: 3, text: "anhaltende Kontraktion" },
    { unter: 48, anzahl: 6, text: "starkes Warnsignal" },
  ],
  vergleich: 1,
  vergleichName: "Vormonat",
  trendFenster: 3,
}, {
    schluessel: "ISM_PMI_MFG",
    quelle: "wachstum",
    gruppe: "leading",
    titel: "ISM Manufacturing PMI",
    untertitel: "Einkaufsmanagerindex Industrie (USA)",
    frage: "Expandiert oder kontrahiert die US-Industrie?",
    einordnung: "Über 50 = Expansion, unter 50 = Kontraktion.",
    format: "punkte",
    einheitFest: "Index",
    richtung: "neutral",
    schwellen: [{ wert: 50, text: "50 Baseline" }],
    stufen: [
      { ueber: 54.5, text: "über 54,5, Expansion" },
      { ab: 50.5, text: "50,5 bis 54,5, Normalbereich" },
      { text: "unter 50,5, Kontraktion" },
    ],
    serien: [
      { unter: 47, anzahl: 3, text: "anhaltende Kontraktion" },
      { unter: 48, anzahl: 6, text: "starkes Warnsignal" },
    ],
    vergleich: 1,
    vergleichName: "Vormonat",
    trendFenster: 3,
  }
];
