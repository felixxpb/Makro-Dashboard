/* ===========================================================================
   Konfiguration Zinsen
   Grundlage: 02_Raw/03_Strategien/00_Mein_Trading_Plan.docx, Abschnitt
   "Bonds Framework" und "Quick Overview andere Waehrungen" (Leitzinsen +
   Zinserwartungen). Details je Quelle und alle Entscheidungen (inkl. warum
   sieben von acht Leitzinsen nur als Naeherung vorliegen) stehen in
   03_Doku/Datenquellen_Zinsen.md. Wird vor motor.js geladen.

   Die FED-Zinserwartung (FOMC Dot Plot) ist KEINE Kachel hier, sondern ein
   eigener Abschnitt, den zinsen.html direkt aus window.ZINSEN_DATEN.dotplot
   aufbaut (gleiches Muster wie die Regime-Klassifikation in regime.html) -
   Grund: FEDTARMD ist eine Zieljahr-Projektion, kein gewoehnlicher Verlauf.

   Richtung durchgehend "neutral": keine Farbbewertung von Zinsniveaus
   (CLAUDE.md Abschnitt 5).
   =========================================================================== */

window.QUELLEN = {
  zinsen: window.ZINSEN_DATEN,
  regime: window.REGIME_DATEN
};

window.GRUPPEN = [
  { id: "leitzins", titel: "Leitzinsen", hinweis: "Aktueller Leitzins je Notenbank. Nur die FED hat zusaetzlich eine freie, strukturierte Zinserwartung (FOMC Dot Plot, Abschnitt unten). Fuer die anderen sieben Notenbanken gibt es dafuer keine vergleichbare kostenlose Quelle." },
  { id: "realrendite", titel: "Realrendite & Breakeven (USA)", hinweis: "Realrendite plus Breakeven ergibt laut Trading Plan die Nominalrendite. Einordnungstabelle fuer den Breakeven steht als eigener Abschnitt unten." },
  { id: "zsk", titel: "Zinsstrukturkurve (USA)", hinweis: "Gleiche Reihen wie im Regime-Teil (2Y-/10Y-Rendite, Spread), hier zusammen mit Leitzins und Realrendite im Zinskontext gezeigt." }
];

window.KACHELN = [
  /* --- Leitzinsen ---------------------------------------------------------- */
  {
    schluessel: "FED_LEITZINS", quelle: "zinsen", gruppe: "leitzins",
    titel: "FED Leitzins",
    untertitel: "Fed Funds Target Range, Mitte aus Ober- und Untergrenze",
    frage: "Wo steht der US-Leitzins gerade?",
    einordnung: "Bezugspunkt fuer den Waehrungsvergleich im Trading Plan (Quick Overview: Leitzinsen + Zinserwartungen). Die FED-Erwartung (FOMC Dot Plot) steht als eigener Abschnitt unten auf der Seite.",
    format: "faktor", einheitFest: "%", richtung: "neutral",
    vergleich: 20, vergleichName: "vor 20 Handelstagen"
  },
  {
    schluessel: "ECBDFR", quelle: "zinsen", gruppe: "leitzins",
    titel: "EZB Leitzins",
    untertitel: "Einlagensatz (Deposit Facility Rate)",
    frage: "Wo steht der Leitzins im Euroraum gerade?",
    einordnung: "Seit der Umstellung des EZB-Handlungsrahmens 2022 ist der Einlagensatz die massgebliche Steuerungsgroesse, nicht mehr der Hauptrefinanzierungssatz.",
    format: "faktor", einheitFest: "%", richtung: "neutral",
    vergleich: 20, vergleichName: "vor 20 Handelstagen"
  },
  {
    schluessel: "IRSTCI01GBM156N", quelle: "zinsen", gruppe: "leitzins",
    titel: "BoE Leitzins (Naeherung)",
    untertitel: "Grossbritannien, Interbank-Tagesgeldsatz (OECD)",
    frage: "Wo steht der Leitzins in Grossbritannien ungefaehr?",
    einordnung: "Kein kostenloser, strukturierter Datenpunkt fuer den offiziellen Bank Rate verfuegbar. Der Interbank-Tagesgeldsatz folgt ihm in der Praxis sehr eng.",
    format: "faktor", einheitFest: "%", richtung: "neutral",
    vergleich: 1, vergleichName: "Vormonat"
  },
  {
    schluessel: "IRSTCI01JPM156N", quelle: "zinsen", gruppe: "leitzins",
    titel: "BoJ Leitzins (Naeherung)",
    untertitel: "Japan, Interbank-Tagesgeldsatz (OECD)",
    frage: "Wo steht der Leitzins in Japan ungefaehr?",
    einordnung: "Naeherung ueber den Interbank-Tagesgeldsatz, kein offiziell verkuendeter BoJ-Datenpunkt kostenlos verfuegbar.",
    format: "faktor", einheitFest: "%", richtung: "neutral",
    vergleich: 1, vergleichName: "Vormonat"
  },
  {
    schluessel: "IRSTCI01AUM156N", quelle: "zinsen", gruppe: "leitzins",
    titel: "RBA Leitzins (Naeherung)",
    untertitel: "Australien, Interbank-Tagesgeldsatz (OECD)",
    frage: "Wo steht der Leitzins in Australien ungefaehr?",
    einordnung: "Naeherung ueber den Interbank-Tagesgeldsatz, kein offiziell verkuendeter RBA-Datenpunkt kostenlos verfuegbar.",
    format: "faktor", einheitFest: "%", richtung: "neutral",
    vergleich: 1, vergleichName: "Vormonat"
  },
  {
    schluessel: "IRSTCI01CAM156N", quelle: "zinsen", gruppe: "leitzins",
    titel: "BoC Leitzins (Naeherung)",
    untertitel: "Kanada, Interbank-Tagesgeldsatz (OECD)",
    frage: "Wo steht der Leitzins in Kanada ungefaehr?",
    einordnung: "Naeherung ueber den Interbank-Tagesgeldsatz, kein offiziell verkuendeter BoC-Datenpunkt kostenlos verfuegbar.",
    format: "faktor", einheitFest: "%", richtung: "neutral",
    vergleich: 1, vergleichName: "Vormonat"
  },
  {
    schluessel: "IR3TIB01CHM156N", quelle: "zinsen", gruppe: "leitzins",
    titel: "SNB Leitzins (Naeherung)",
    untertitel: "Schweiz, 3-Monats-Interbankensatz (OECD)",
    frage: "Wo steht der Leitzins in der Schweiz ungefaehr?",
    einordnung: "Der Tagesgeldsatz ist bei FRED seit 2024 eingestellt, deshalb hier der 3-Monats-Interbankensatz als naechstbeste freie Naeherung - liegt etwas naeher am erwarteten Pfad als am aktuellen Leitzins selbst.",
    format: "faktor", einheitFest: "%", richtung: "neutral",
    vergleich: 1, vergleichName: "Vormonat"
  },
  {
    schluessel: "IR3TIB01NZM156N", quelle: "zinsen", gruppe: "leitzins",
    titel: "RBNZ Leitzins (Naeherung)",
    untertitel: "Neuseeland, 3-Monats-Interbankensatz (OECD)",
    frage: "Wo steht der Leitzins in Neuseeland ungefaehr?",
    einordnung: "Der Tagesgeldsatz ist bei FRED seit 2024 eingestellt, deshalb hier der 3-Monats-Interbankensatz als naechstbeste freie Naeherung - liegt etwas naeher am erwarteten Pfad als am aktuellen Leitzins (Official Cash Rate) selbst.",
    format: "faktor", einheitFest: "%", richtung: "neutral",
    vergleich: 1, vergleichName: "Vormonat"
  },

  /* --- Realrendite & Breakeven (USA) ---------------------------------------- */
  {
    schluessel: "DFII10", quelle: "zinsen", gruppe: "realrendite",
    titel: "Realrendite (10 Jahre)",
    untertitel: "US-Staatsanleihe, inflationsindexiert (TIPS), 10 Jahre",
    frage: "Wie hoch ist die tatsaechliche Verzinsung nach Inflation?",
    einordnung: "Realrendite plus Breakeven ergibt laut Trading Plan die Nominalrendite. Zusammen mit der Realrendite des Gegenspielers zeigt sich, wohin Kapital tendenziell fliesst.",
    format: "faktor", einheitFest: "%", richtung: "neutral",
    vergleich: 21, vergleichName: "vor rund einem Monat"
  },
  {
    schluessel: "T10YIE", quelle: "zinsen", gruppe: "realrendite",
    titel: "Breakeven-Inflation (10 Jahre)",
    untertitel: "Erwartete Inflation laut Anleihemarkt, 10 Jahre",
    frage: "Was preist der Anleihemarkt langfristig fuer Inflation ein?",
    einordnung: "Preis fuer Inflationsschutz. Einordnungstabelle aus dem Trading Plan (welcher Bereich als hoch/moderat/deflationaer gilt) steht als eigener Abschnitt unten auf der Seite.",
    format: "faktor", einheitFest: "%", richtung: "neutral",
    vergleich: 21, vergleichName: "vor rund einem Monat"
  },

  /* --- Zinsstrukturkurve (USA), wiederverwendet aus Regime ------------------ */
  {
    schluessel: "DGS2", quelle: "regime", gruppe: "zsk",
    titel: "2Y-Rendite",
    untertitel: "2-jaehrige US-Staatsanleihe, preist die Geldpolitik der FED ein",
    frage: "Was erwarten Anleger von der naechsten FED-Zinsentscheidung?",
    einordnung: "Gleiche Reihe wie im Regime-Teil. Erwarten Anleger Zinserhoehungen, steigt die 2Y-Rendite; erwarten sie Zinssenkungen, faellt sie.",
    format: "faktor", einheitFest: "%", richtung: "neutral",
    vergleich: 20, vergleichName: "vor 20 Handelstagen"
  },
  {
    schluessel: "DGS10", quelle: "regime", gruppe: "zsk",
    titel: "10Y-Rendite",
    untertitel: "10-jaehrige US-Staatsanleihe, preist Wachstum und Inflation ein",
    frage: "Was erwarten Anleger fuer Wachstum und Inflation?",
    einordnung: "Gleiche Reihe wie im Regime-Teil. Steigende Wachstums- und Inflationserwartungen lassen die 10Y-Rendite steigen, fallende Erwartungen lassen sie fallen.",
    format: "faktor", einheitFest: "%", richtung: "neutral",
    vergleich: 20, vergleichName: "vor 20 Handelstagen"
  },
  {
    schluessel: "T10Y2Y", quelle: "regime", gruppe: "zsk",
    titel: "10Y-2Y-Spread",
    untertitel: "Zinsstrukturkurve, Spread zwischen 10Y- und 2Y-Rendite",
    frage: "Wie steil oder flach ist die Zinsstrukturkurve, und ist sie invertiert?",
    einordnung: "Gleiche Reihe wie im Regime-Teil. Unter 0 ist die Kurve invertiert (kurzfristige Renditen hoeher als langfristige), historisch ein Rezessionssignal. Die Kurvenform (Bull/Bear Steepener/Flattener) steht als Klassifikation im Regime-Teil.",
    format: "faktor", einheitFest: "%-Punkte", richtung: "neutral",
    schwellen: [{ wert: 0, text: "Invertiert" }],
    vergleich: 20, vergleichName: "vor 20 Handelstagen"
  }
];
