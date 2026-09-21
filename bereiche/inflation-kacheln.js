/* ===========================================================================
   Konfiguration Inflation
   Grundlage: 02_Raw/03_Strategien/00_Mein_Trading_Plan.docx, Abschnitt
   "CPI-Analyse", und Makroanalyse_KW38.docx, Abschnitt "PMI & Inflation".
   Details je Quelle stehen in 03_Doku/Datenquellen_Inflation.md.
   Wird vor motor.js geladen.

   Richtung bewusst durchgehend "neutral": Inflation ist im Makro-Kontext
   nicht eindeutig "gut" oder "schlecht" wie eine Arbeitslosenquote, sondern
   abhaengig vom Regime. Keine vorgefertigte Bewertung (CLAUDE.md Abschnitt 5).
   =========================================================================== */

window.QUELLEN = {
  fred:          window.INFLATION_DATEN,
  web:           window.WEBQUELLEN_DATEN,
  arbeitsmarkt:  window.ARBEITSMARKT_DATEN,
  cpiKategorien: window.CPI_KATEGORIEN_DATEN
};

window.GRUPPEN = [
  { id: "realisiert", titel: "Realisierte Inflation", hinweis: "CPI und PPI, jeweils Headline und Core, als Veraenderung zum Vorjahr (YoY)." },
  { id: "vorlauf",    titel: "Vorlaufindikatoren", hinweis: "Laufen der realisierten Inflation voraus: Einkaufsmanager-Preise, Lieferketten, Rohoel, Geldmenge." },
  { id: "markt",      titel: "Markterwartung", hinweis: "Was der Anleihemarkt und Konsumenten fuer die Zukunft erwarten." },
  { id: "arbeitsmarkt_bezug", titel: "Bezug zum Arbeitsmarkt", hinweis: "Lohnkosten als Bruecke zwischen Arbeitsmarkt und Service-Inflation." }
];

window.KACHELN = [
  {
    schluessel: "CPIAUCSL", quelle: "fred", gruppe: "realisiert",
    titel: "CPI (Headline)",
    untertitel: "Verbraucherpreise gesamt, Veraenderung zum Vorjahr",
    frage: "Wie stark steigen die Verbraucherpreise insgesamt?",
    einordnung: "CPI ist der Benchmark, an dem sich zeigt, wie stark die vorlaufenden Indikatoren tatsaechlich durchschlagen. Ein Rueckgang allein im Headline-Wert reicht laut Trading Plan nicht aus.",
    format: "prozent", richtung: "neutral",
    ableitung: "yoy", ableitungSchritt: 12,
    vergleich: 1, vergleichName: "Vormonat",
    // Entscheidung Felix, 2026-09-21: die CPI-Kategorie-Aufschluesselung kommt
    // jetzt von BLS statt FRED (17 statt 5 Kategorien, 12-Monats-Navigation).
    // Ersetzt das bisherige "aufschluesselung"-Feld NUR bei dieser Kachel.
    // Die FRED-Aufschluesselung (baueAufschluesselung) bleibt als Mechanismus
    // unveraendert bestehen und wird weiter von der PPI-Kachel benutzt.
    aufschluesselungBLS: {
      titel: "CPI nach Kategorien (BLS), YoY",
      hinweis: "Veränderungsrate je Kategorie zum Vorjahr, nicht ihr Gewicht im Gesamtwert, direkt von BLS (nicht saisonbereinigt). Mit den Pfeilen lassen sich die letzten 12 Monate durchblättern, je Monat zusätzlich der Vormonat zum Vergleich. Core Services (Services less energy services) enthält Shelter.",
      quelle: "cpiKategorien"
    }
  },
  {
    schluessel: "CPILFESL", quelle: "fred", gruppe: "realisiert",
    titel: "Core CPI",
    untertitel: "Verbraucherpreise ohne Nahrungsmittel und Energie, YoY",
    frage: "Wie hartnaeckig ist die Kerninflation?",
    einordnung: "Die FED schaut auf konstante Rueckgaenge im Core-Wert. Ohne Core-Rueckgang laut Trading Plan keine Zinsschritte der FED.",
    format: "prozent", richtung: "neutral",
    ableitung: "yoy", ableitungSchritt: 12,
    vergleich: 1, vergleichName: "Vormonat"
  },
  {
    schluessel: "PPIFIS", quelle: "fred", gruppe: "realisiert",
    titel: "PPI (Final Demand)",
    untertitel: "Erzeugerpreise gesamt, Veraenderung zum Vorjahr",
    frage: "Wie stark steigen die Preise auf Erzeugerseite?",
    einordnung: "PPI-Erhoehungen werden laut Trading Plan zeitverzoegert an den CPI weitergegeben (Kostenschubmechanismus). Faustregel: +1 % PPI erhoeht CPI um rund +0,39 %.",
    format: "prozent", richtung: "neutral",
    ableitung: "yoy", ableitungSchritt: 12,
    vergleich: 1, vergleichName: "Vormonat",
    aufschluesselung: {
      titel: "PPI nach Kategorien, YoY",
      hinweis: "Die sechs Bausteine von PPI Final Demand. Veränderungsrate je Kategorie zum Vorjahr, nicht ihr Gewicht im Gesamtwert. Die gestrichelte Linie markiert den Headline-Wert.",
      kategorien: [
        { schluessel: "PPIDFS",   name: "Food" },
        { schluessel: "PPIDES",   name: "Energy" },
        { schluessel: "WPSFD413", name: "Core Goods" },
        { schluessel: "PPITSS",   name: "Trade Services" },
        { schluessel: "PPIAWS",   name: "Transport und Lager" },
        { schluessel: "PPITWS",   name: "Übrige Services" }
      ]
    }
  },
  {
    schluessel: "PPIFES", quelle: "fred", gruppe: "realisiert",
    titel: "Core PPI",
    untertitel: "Erzeugerpreise ohne Nahrungsmittel und Energie, YoY",
    frage: "Wie hartnaeckig ist die Inflation auf Erzeugerseite?",
    einordnung: "Core PPI schlaegt laut Trading Plan mit 4 bis 5 Monaten Verzoegerung auf Core CPI durch - deutlich traeger als die Headline-Werte, dafuer haltbarer.",
    format: "prozent", richtung: "neutral",
    ableitung: "yoy", ableitungSchritt: 12,
    vergleich: 1, vergleichName: "Vormonat"
  },

  {
    schluessel: "ISM_MFG_PRICE", quelle: "web", gruppe: "vorlauf",
    titel: "ISM Manufacturing Prices",
    untertitel: "Preisindex der Einkaufsmanager, Industrie",
    frage: "Was erwarten die Einkaufsmanager fuer die Preise?",
    einordnung: "Werte ueber 50 gelten laut Trading Plan als inflationaer. Steigend = hoehere Inflation erwartet, sinkend = niedrigere.",
    format: "punkte", richtung: "neutral", pmiFarbe: true,
    schwellen: [{ wert: 50, text: "inflationaer / nicht inflationaer" }],
    stufe: { grenze: 50, ueber: "inflationaer", unter: "nicht inflationaer" },
    vergleich: 1, vergleichName: "Vormonat"
  },
  {
    schluessel: "ISM_SVC_PRICE", quelle: "web", gruppe: "vorlauf",
    titel: "ISM Services Prices",
    untertitel: "Preisindex der Einkaufsmanager, Dienstleistung",
    frage: "Was erwarten die Einkaufsmanager fuer die Preise?",
    einordnung: "Werte ueber 50 gelten laut Trading Plan als inflationaer. Steigend = hoehere Inflation erwartet, sinkend = niedrigere.",
    format: "punkte", richtung: "neutral", pmiFarbe: true,
    schwellen: [{ wert: 50, text: "inflationaer / nicht inflationaer" }],
    stufe: { grenze: 50, ueber: "inflationaer", unter: "nicht inflationaer" },
    vergleich: 1, vergleichName: "Vormonat"
  },
  {
    schluessel: "GSCPI", quelle: "web", gruppe: "vorlauf",
    titel: "Global Supply Chain Pressure Index",
    untertitel: "Lieferkettendruck, New York Fed",
    frage: "Entsteht Inflation gerade auf der Angebotsseite?",
    einordnung: "Ueber 0: Lieferkette verlaengert sich, Angebot verknappt sich, mehr Inflation bei gleicher Nachfrage. Unter 0: Lieferkette verkuerzt sich, Angebot erhoeht sich, weniger Inflation.",
    format: "punkte", einheitFest: "", richtung: "neutral",
    schwellen: [{ wert: 0, text: "" }],
    stufe: { grenze: 0, ueber: "Lieferkette angespannt", unter: "Lieferkette entspannt" },
    vergleich: 1, vergleichName: "Vormonat"
  },
  {
    schluessel: "DCOILBRENTEU", quelle: "fred", gruppe: "vorlauf",
    titel: "Brent-Rohoel",
    untertitel: "Rohoelpreis, taeglich",
    frage: "Verteuert Energie gerade Transport und Produktion?",
    einordnung: "Ein Anstieg von +10 % in 30 Tagen erhoeht laut Trading Plan saemtliche Transport- und Produktionskosten. In jedem Produkt steckt Rohoel drin.",
    format: "dollar", richtung: "neutral",
    vergleich: 21, vergleichName: "vor rund einem Monat"
  },
  {
    schluessel: "M2SL", quelle: "fred", gruppe: "vorlauf",
    titel: "M2 Geldmenge",
    untertitel: "Geldmengenwachstum, Veraenderung zum Vorjahr",
    frage: "Wie viel Geld ist im Umlauf?",
    einordnung: "Steigende Geldmenge bedeutet laut Trading Plan mehr Geld im Umlauf und damit Aufwaertsdruck auf die Preise.",
    format: "prozent", richtung: "neutral",
    ableitung: "yoy", ableitungSchritt: 12,
    vergleich: 1, vergleichName: "Vormonat"
  },

  {
    schluessel: "T5YIE", quelle: "fred", gruppe: "markt",
    titel: "TIPS-Breakeven (5 Jahre)",
    untertitel: "Erwartete Inflation laut Anleihemarkt, taeglich",
    frage: "Worauf wettet der Anleihemarkt bei der Inflation?",
    einordnung: "TIPS werden primaer von Smart Money gehandelt. Steigende TIPS = Wette auf steigende Inflation. Faustregel aus dem Trading Plan: TIPS +1 % entspricht CPI YoY +2,4 % nach rund 2 Monaten.",
    format: "prozent", richtung: "neutral",
    vergleich: 21, vergleichName: "vor rund einem Monat"
  },
  {
    schluessel: "T5YIFR", quelle: "fred", gruppe: "markt",
    titel: "5y5y Forward Breakeven",
    untertitel: "Erwartete Inflation in 5 Jahren fuer die folgenden 5 Jahre",
    frage: "Wie ist die langfristige Inflationserwartung des Marktes verankert?",
    einordnung: "Aus der KW38-Analyse: der 5y5y-Breakeven zeigt einen eigenen Trend, unabhaengig vom kurzfristigen TIPS-Wert. Steigt er auf Jahreshoechststaende, gilt das als bullischer Inflationstrend.",
    format: "prozent", richtung: "neutral",
    vergleich: 21, vergleichName: "vor rund einem Monat"
  },
  {
    schluessel: "MICH", quelle: "fred", gruppe: "markt",
    titel: "Michigan Inflationserwartung",
    untertitel: "Erwartete Inflation der Konsumenten, 12 Monate",
    frage: "Was erwarten Konsumenten fuer die Inflation?",
    einordnung: "Schaetzt die zukuenftigen Inflationserwartungen von Konsumenten. Im Gegensatz zu TIPS kein Markt mit Informationsvorteil, sondern eine Umfrage.",
    format: "prozent", richtung: "neutral",
    vergleich: 1, vergleichName: "Vormonat"
  },

  {
    schluessel: "ECIALLCIV", quelle: "arbeitsmarkt", gruppe: "arbeitsmarkt_bezug",
    titel: "Employment Cost Index",
    untertitel: "Lohnkosten, Veraenderung zum Vorquartal (QoQ)",
    frage: "Stuetzen die Lohnkosten die Kerninflation?",
    einordnung: "Hoher ECI stuetzt laut Trading Plan die Core-Inflation, weil die Service-Inflation dann nicht sinken kann. Gleiche Reihe wie im Arbeitsmarkt-Teil, hier mit Blick auf die Inflationsseite.",
    format: "prozent", richtung: "neutral",
    ableitung: "qoq", vergleichArt: "vorwert", vergleichName: "Vorquartal",
    hauptName: "QoQ (Vorquartal)",
    zweitreihe: { schluessel: "ECIALLCIV", quelle: "arbeitsmarkt", ableitung: "yoy", ableitungSchritt: 4, name: "YoY (Vorjahr)", kennwert: "YoY aktuell" }
  }
];
