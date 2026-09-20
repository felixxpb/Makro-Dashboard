/* ===========================================================================
   Konfiguration Sentiment
   Grundlage: 02_Raw/03_Strategien/00_Mein_Trading_Plan.docx, Abschnitt
   "Marktteilnehmer & Interessen (COT)", und
   02_Raw/03_Strategien/01_Makro/COT Edge.docx. Details und alle
   Entscheidungen: 03_Doku/Datenquellen_Sentiment.md. Wird vor motor.js
   geladen.

   WICHTIG: Nur Rohdaten (Netto-Positionen der drei COT-Parteien), KEINE
   Extremposition- oder COT-Flip-Einstufung. Die genauen Schwellenregeln aus
   COT Edge.docx sind nicht eindeutig, Felix hat entschieden: erstmal nur
   Rohdaten zeigen (2026-09-18). Richtung durchgehend "neutral" (CLAUDE.md
   Abschnitt 5).

   Jede Kachel zeigt die Netto-Position (Long minus Short) der Large
   Speculators (Non-Commercial, meist Hedgefonds/CTAs) als Hauptlinie und die
   Netto-Position der Commercials (Banken/Hedger) als zweite Linie - die
   uebliche COT-Chart-Darstellung. Small Speculators (Nonreportable) und Open
   Interest sind mit abgerufen, stehen aber vorerst nicht als eigene Kacheln.
   =========================================================================== */

window.QUELLEN = {
  sentiment: window.SENTIMENT_DATEN
};

window.GRUPPEN = [
  { id: "fx", titel: "FX-Futures", hinweis: "CFTC Legacy Futures Only, wöchentlich (Stand Dienstag, veröffentlicht Freitag). Netto-Position = Long minus Short je Partei." },
  { id: "sonstige", titel: "DXY und Gold", hinweis: "Gleiche Quelle und Methodik wie die FX-Futures oben." }
];

function baueKachelConfig(id, titel, gruppe) {
  return {
    schluessel: id + "_NONCOMM_NET", quelle: "sentiment", gruppe: gruppe,
    titel: titel,
    untertitel: "COT Netto-Position, Large Speculators vs. Commercials",
    frage: "Wie positionieren sich Hedgefonds/CTAs (Large Speculators) im Vergleich zu Banken/Hedgern (Commercials)?",
    einordnung: "Large Speculators (Non-Commercial, meist Hedgefonds/CTAs) sind laut COT Edge trendfolgend: Long in Bullenmärkten, Short in Bärenmärkten. Commercials (Banken/Hedger) stehen meist auf der Gegenseite. Reine Rohdaten ohne Extremwert- oder Flip-Einstufung, die genauen Schwellenregeln dafür sind noch offen (siehe Datenquellen_Sentiment.md).",
    format: "tausend", einheitFest: "Kontrakte", richtung: "neutral",
    hauptName: "Large Speculators (Netto)",
    zweitreihe: { schluessel: id + "_COMM_NET", quelle: "sentiment", name: "Commercials (Netto)" },
    vergleich: 1, vergleichName: "Vorwoche"
  };
}

window.KACHELN = [
  baueKachelConfig("EUR", "EUR (Euro FX)", "fx"),
  baueKachelConfig("GBP", "GBP (British Pound)", "fx"),
  baueKachelConfig("JPY", "JPY (Japanese Yen)", "fx"),
  baueKachelConfig("AUD", "AUD (Australian Dollar)", "fx"),
  baueKachelConfig("CAD", "CAD (Canadian Dollar)", "fx"),
  baueKachelConfig("CHF", "CHF (Swiss Franc)", "fx"),
  baueKachelConfig("NZD", "NZD (New Zealand Dollar)", "fx"),
  baueKachelConfig("DXY", "DXY (USD Index Future)", "sonstige"),
  baueKachelConfig("XAU", "XAU (Gold)", "sonstige")
];
