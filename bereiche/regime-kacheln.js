/* ===========================================================================
   Konfiguration Regime (Version 2, 2026-09-25)

   Grundlage: Felix' Vorgabe vom 2026-09-25 (02_Raw/Regime.pptx) sowie das
   Rohmaterial in 02_Raw/02_Informationen/02_Incentive/02_RegimeTheorie.
   Details und alle Entscheidungen: 03_Doku/Datenquellen_Regime.md.
   Wird vor motor.js geladen.

   Diese Datei deckt nur noch die vier Konjunkturzyklus-Fruehindikatoren ab.
   Der gesamte obere Teil der Seite (ZSK-Spread-Chart mit Regime-Hintergrund,
   US02Y- und US10Y-Chart, IPDA-Tabelle, die beiden Regime-Kaesten und die
   drei Nachschlage-Dialoge) wird von regime-ansicht.js aufgebaut, ebenso die
   historische Performance-Tabelle darunter.

   Weggefallen gegenueber Version 1 (Entscheidung Felix, 2026-09-25):
   - die drei ZSK-Kacheln (2Y, 10Y, Spread) - stehen jetzt als Charts oben
   - DXY und ZB1 samt Quadranten-Klassifikation - ersatzlos gestrichen
     ACHTUNG: DGS2, DGS10 und T10Y2Y bleiben in daten/regime.js erhalten,
     weil zinsen-kacheln.js sie mit quelle "regime" weiterverwendet.

   Richtung durchgehend "neutral": keine Farbbewertung von Veraenderungen
   (CLAUDE.md Abschnitt 5).
   =========================================================================== */

window.QUELLEN = {
  regime: window.REGIME_DATEN
};

window.GRUPPEN = [
  { id: "konjunktur", titel: "Konjunkturzyklus-Frühindikatoren", hinweis: "Vier ETF-Ratios als Frühindikatoren fuer Risk-On/Risk-Off und den Konjunkturzyklus. Steigt der Spread, dominiert tendenziell Risk On." }
];

window.KACHELN = [
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
