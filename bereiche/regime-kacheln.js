/* ===========================================================================
   Konfiguration Regime
   Grundlage: 02_Raw/03_Strategien/00_Mein_Trading_Plan.docx, Abschnitt
   "ZB1! + Sentiment & Regime", sowie das Rohmaterial in
   02_Raw/02_Informationen/02_Incentive/02_RegimeTheorie (Makro_Regime_Research.docx,
   Regime Theorie Zusammenfassung.docx, MakroRegime.xlsx, Regime Berechnung
   KOPIE.xlsx). Details und alle Entscheidungen: 03_Doku/Datenquellen_Regime.md.
   Wird vor motor.js geladen.

   Diese Kachel-Liste deckt nur die neun numerischen Zeitreihen ab (ZSK,
   DXY/ZB1, vier Konjunktur-Spreads). Die drei Regime-Klassifikationen
   (ZSK-Kurvenform, Makro-Regime, DXY/ZB1-Quadrant) und die historische
   Referenztabelle sind keine gewoehnlichen Kacheln, sondern eigene
   Abschnitte, die regime.html direkt aus window.REGIME_DATEN.klassifikation
   und .referenz aufbaut (siehe Skript am Ende von regime.html).

   Richtung durchgehend "neutral": keine Farbbewertung von Veraenderungen
   (CLAUDE.md Abschnitt 5).
   =========================================================================== */

window.QUELLEN = {
  regime: window.REGIME_DATEN
};

window.GRUPPEN = [
  { id: "zsk", titel: "Zinsstrukturkurve (ZSK)", hinweis: "2Y-Rendite preist die Geldpolitik der FED ein, 10Y-Rendite preist Wachstums- und Inflationserwartungen ein. Der Spread zeigt die Kurvenform (Steepening/Flattening)." },
  { id: "quadrant", titel: "DXY + ZB1 Quadrant", hinweis: "Marktregime aus DXY-Trend und ZB1-Trend (30Y-T-Bond-Future). Das Regime gibt laut Trading Plan das BIAS, der Chart den Entry." },
  { id: "konjunktur", titel: "Konjunkturzyklus-Frühindikatoren", hinweis: "Vier ETF-Ratios als Frühindikatoren fuer Risk-On/Risk-Off und den Konjunkturzyklus. Steigt der Spread, dominiert tendenziell Risk On." }
];

window.KACHELN = [
  /* --- Zinsstrukturkurve (ZSK) -------------------------------------------- */
  {
    schluessel: "DGS2", quelle: "regime", gruppe: "zsk",
    titel: "2Y-Rendite",
    untertitel: "2-jährige US-Staatsanleihe, preist die Geldpolitik der FED ein",
    frage: "Was erwarten Anleger von der nächsten FED-Zinsentscheidung?",
    einordnung: "Die 2Y-Rendite läuft laut Research vorlaufend zu den Leitzinsen der FED. Erwarten Anleger Zinserhöhungen, verkaufen sie Anleihen mit geringerer Rendite und die 2Y-Rendite steigt. Erwarten sie Zinssenkungen, kaufen sie Anleihen und die Rendite fällt.",
    format: "faktor", einheitFest: "%", richtung: "neutral",
    vergleich: 20, vergleichName: "vor 20 Handelstagen"
  },
  {
    schluessel: "DGS10", quelle: "regime", gruppe: "zsk",
    titel: "10Y-Rendite",
    untertitel: "10-jährige US-Staatsanleihe, preist Wachstum und Inflation ein",
    frage: "Was erwarten Anleger für Wachstum und Inflation?",
    einordnung: "Steigende Wachstums- und Inflationserwartungen lassen laut Research die 10Y-Rendite steigen, fallende Erwartungen lassen sie fallen.",
    format: "faktor", einheitFest: "%", richtung: "neutral",
    vergleich: 20, vergleichName: "vor 20 Handelstagen"
  },
  {
    schluessel: "T10Y2Y", quelle: "regime", gruppe: "zsk",
    titel: "10Y-2Y-Spread",
    untertitel: "Zinsstrukturkurve, Spread zwischen 10Y- und 2Y-Rendite",
    frage: "Wie steil oder flach ist die Zinsstrukturkurve, und ist sie invertiert?",
    einordnung: "Steigt der Spread, wird die Kurve steiler (Steepening). Fällt er, flacht sie ab (Flattening). Unter 0 ist die Kurve invertiert (kurzfristige Renditen höher als langfristige), historisch ein Rezessionssignal. Die genaue Kurvenform (Bull/Bear Steepener/Flattener) steht als eigener Abschnitt unten auf der Seite.",
    format: "faktor", einheitFest: "%-Punkte", richtung: "neutral",
    schwellen: [{ wert: 0, text: "Invertiert" }],
    vergleich: 20, vergleichName: "vor 20 Handelstagen"
  },

  /* --- DXY + ZB1 Quadrant -------------------------------------------------- */
  {
    schluessel: "DXY", quelle: "regime", gruppe: "quadrant",
    titel: "DXY",
    untertitel: "ICE US Dollar Index",
    frage: "Wie stark oder schwach steht der USD gegenüber einem Währungskorb da?",
    einordnung: "Bezugsgröße für die USD-Stärke im Quadranten-Regime (Kachel unten: DXY-Trend kombiniert mit ZB1-Trend).",
    format: "faktor", einheitFest: "Punkte", richtung: "neutral",
    vergleich: 20, vergleichName: "vor 20 Handelstagen"
  },
  {
    schluessel: "ZB1", quelle: "regime", gruppe: "quadrant",
    titel: "ZB1 (30Y T-Bond-Future)",
    untertitel: "Naechster Kontrakt, Preis (nicht Rendite)",
    frage: "Steigen oder fallen die Bondpreise, und was sagt das über die Renditen?",
    einordnung: "ZB1 steigt = Bondpreise steigen = Renditen fallen. ZB1 fällt = Bondpreise fallen = Renditen steigen. Zweite Bezugsgröße für den Quadranten unten.",
    format: "faktor", einheitFest: "Punkte", richtung: "neutral",
    vergleich: 20, vergleichName: "vor 20 Handelstagen"
  },

  /* --- Konjunkturzyklus-Fruehindikatoren ----------------------------------- */
  {
    schluessel: "XLY_XLP", quelle: "regime", gruppe: "konjunktur",
    titel: "XLY/XLP",
    untertitel: "Nicht-Basiskonsum vs. Basiskonsum",
    frage: "Kaufen Konsumenten eher Luxus oder Grundbedarf?",
    einordnung: "Steigt der Spread, werden vermehrt Nicht-Basisgüter gekauft (Konsumenten haben Geld für 'Luxus'), das treibt das Wirtschaftswachstum. Fällt der Spread, dominiert der stabile Basiskonsum, ein Zeichen für Zurückhaltung.",
    format: "faktor", richtung: "neutral",
    vergleich: 20, vergleichName: "vor 20 Handelstagen"
  },
  {
    schluessel: "IYT_XLU", quelle: "regime", gruppe: "konjunktur",
    titel: "IYT/XLU",
    untertitel: "Transportsektor vs. Versorgersektor",
    frage: "Wächst der Handel und die Produktion, oder dominiert der stabile Grundbedarf?",
    einordnung: "Steigt der Spread, entwickelt sich der Transportsektor besser als der Versorgersektor - Zeichen für Aufschwung (mehr Güter werden produziert und transportiert). Fällt der Spread, schwächelt die Wirtschaft, der stabile Versorgersektor hält sich besser.",
    format: "faktor", richtung: "neutral",
    vergleich: 20, vergleichName: "vor 20 Handelstagen"
  },
  {
    schluessel: "HYG_TLT", quelle: "regime", gruppe: "konjunktur",
    titel: "HYG/TLT",
    untertitel: "High-Yield-Unternehmensanleihen vs. lange Staatsanleihen",
    frage: "Suchen Investoren Risiko oder Sicherheit am Anleihenmarkt?",
    einordnung: "Steigt der Spread, steigen risikoreichere High-Yield-Bonds stärker als sichere lange Staatsanleihen - Zeichen für Wirtschaftsoptimismus und mehr Risikobereitschaft. Fällt der Spread, suchen Investoren Sicherheit - Zeichen für Unsicherheit oder Rezessionsangst.",
    format: "faktor", richtung: "neutral",
    vergleich: 20, vergleichName: "vor 20 Handelstagen"
  },
  {
    schluessel: "VUG_VTV", quelle: "regime", gruppe: "konjunktur",
    titel: "VUG/VTV",
    untertitel: "Large Cap Growth vs. Large Cap Value",
    frage: "Setzen Anleger auf zukünftiges Wachstum oder auf stabile, günstig bewertete Substanzwerte?",
    einordnung: "Steigt der Spread, outperformt Growth (z. B. Tech) - Zeichen für frühen Aufschwung. Fällt der Spread, outperformt Value (stabile Cashflows, oft Dividenden) - Anleger werden defensiver.",
    format: "faktor", richtung: "neutral",
    vergleich: 20, vergleichName: "vor 20 Handelstagen"
  }
];
