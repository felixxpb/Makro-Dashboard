/* ===========================================================================
   Konfiguration Plumbing
   Grundlage: 02_Raw/03_Strategien/00_Mein_Trading_Plan.docx, Abschnitt
   "Plumbing Framework" (Unterabschnitte "USD-Funding" und "Marktumfeld").
   "Flows Framework" im gleichen Kapitel ist ein eigener, spaeterer
   Themenbereich und taucht hier nicht auf. Details je Quelle stehen in
   03_Doku/Datenquellen_Plumbing.md. Wird vor motor.js geladen.

   Richtung durchgehend "neutral": keine Farbbewertung von Veraenderungen
   (CLAUDE.md Abschnitt 5). Nur VIX hat feste Schwellen aus dem Trading Plan
   und zeigt sie als Linien im Graph. Die anderen Kacheln (SOFR, REPO, ON RRP,
   Credit-Spread, FED Financial Stress Index) laufen bewusst ohne feste
   Schwelle, nur mit Richtungslogik - der FED Financial Stress Index hat im
   Trading Plan zwar Zahlen (0 / 1), laeuft aber auf Wunsch trotzdem ohne
   Markierung im Chart (Entscheidung 2026-09-17).
   =========================================================================== */

window.QUELLEN = {
  plumbing: window.PLUMBING_DATEN
};

window.GRUPPEN = [
  { id: "usdfunding", titel: "USD-Funding", hinweis: "Wie teuer und wie knapp ist es, sich kurzfristig Geld in USD zu leihen. Erhöhter Satz und knapperes Volumen zusammen gelesen = Systemstress." },
  { id: "marktumfeld", titel: "Marktumfeld", hinweis: "Wie angespannt ist das Finanzsystem insgesamt, gemessen über Absicherungsverhalten am Aktienmarkt und Risikoaufschlag am Kreditmarkt." }
];

window.KACHELN = [
  /* --- USD-Funding ------------------------------------------------------- */
  {
    schluessel: "SOFR_RATE", quelle: "plumbing", gruppe: "usdfunding",
    titel: "SOFR (Satz)",
    untertitel: "Secured Overnight Financing Rate, Overnight-Finanzierungsrate im USD",
    frage: "Wie teuer ist es, sich kurzfristig Geld zu leihen?",
    einordnung: "Misst, wie teuer eine Übernachtfinanzierung besichert mit US-Staatsanleihen ist. Laut Trading Plan: Stress-Spike, Langfristigkeit des Stresses und Level des Stresses beobachten. Erhöhter SOFR zusammen mit knapperem Volumen (eigene Kachel daneben) = Systemstress. Kein fester Schwellenwert im Trading Plan.",
    format: "faktor", einheitFest: "%", richtung: "neutral",
    vergleich: 1, vergleichName: "Vortag"
  },
  {
    schluessel: "SOFR_VOLUME", quelle: "plumbing", gruppe: "usdfunding",
    titel: "SOFR Volumen",
    untertitel: "Transaktionsvolumen hinter dem SOFR-Satz, Mrd. USD",
    frage: "Wie viel Volumen steckt hinter dem aktuellen SOFR-Satz?",
    einordnung: "Gleiche Quelle wie der SOFR-Satz (NY Fed), eigene Kachel wegen der Gestaltungsregel 'nie zwei Wertachsen in einem Graph'. Laut Trading Plan gemeinsam mit dem Satz lesen: erhöhter Satz und knapperes Volumen = Systemstress.",
    format: "tausend", einheitFest: "Mrd. USD", richtung: "neutral",
    vergleich: 1, vergleichName: "Vortag"
  },
  {
    schluessel: "RPONTSYD", quelle: "plumbing", gruppe: "usdfunding",
    titel: "REPO",
    untertitel: "Fed-Repo-Operationen: von der Fed an Institutionen verliehenes Geld gegen Sicherheiten, Mrd. USD",
    frage: "Kann sich der Markt selbst mit Liquidität versorgen, oder braucht er das Fed-Polster?",
    einordnung: "Kurzfristiger Kredit zwischen Finanzinstitutionen und der Fed, zentraler Weg der täglichen Bankenfinanzierung. Laut Trading Plan: viel Volumen im REPO = Institutionen sind auf das Fed-Polster angewiesen, zeigt wie gesund das Liquiditätssystem im Hintergrund ist. Kein fester Schwellenwert im Trading Plan. Bildet die Repo-Operationen der Fed selbst ab (FRED RPONTSYD), nicht den gesamten Interbanken-Repo-Markt. Aktuell (2026) meist nahe null, daher zwei Nachkommastellen statt gerundet auf ganze Milliarden.",
    format: "faktor", einheitFest: "Mrd. USD", richtung: "neutral",
    vergleich: 1, vergleichName: "Vortag"
  },
  {
    schluessel: "RRPONTSYD", quelle: "plumbing", gruppe: "usdfunding",
    titel: "Overnight Reverse Repo (ON RRP)",
    untertitel: "Von der Fed aufgenommenes Geld gegen Staatsanleihen, Mrd. USD",
    frage: "Wie viel Liquidität parkt bei der Zentralbank statt im System zu arbeiten?",
    einordnung: "Die Fed nimmt hier Geld von Institutionen auf, Cash gegen Staatsanleihen. Laut Trading Plan: hoher Reverse Repo = viel Geld bei der Zentralbank geparkt (Sicherheit), zeigt wie viel Geld aktiv im System arbeitet oder rumliegt. Schnelle Veränderungen deuten auf Systemanpassungen und Stress hin. Kein fester Schwellenwert im Trading Plan. Aktuell (2026) meist nur einstellig, daher zwei Nachkommastellen statt gerundet auf ganze Milliarden.",
    format: "faktor", einheitFest: "Mrd. USD", richtung: "neutral",
    vergleich: 1, vergleichName: "Vortag"
  },

  /* --- Marktumfeld -------------------------------------------------------- */
  {
    schluessel: "VIXCLS", quelle: "plumbing", gruppe: "marktumfeld",
    titel: "VIX",
    untertitel: "CBOE Volatility Index, basiert auf Optionen des S&P 500",
    frage: "Wie stark sichern sich Marktteilnehmer gegen Schwankungen am Aktienmarkt ab?",
    einordnung: "Hohe Volatilität = starke Absicherungen, ein schneller Anstieg zeigt, dass sich Institutionen stärker absichern müssen. Laut Trading Plan die einzige Plumbing-Kennzahl mit festen Schwellen: unter 16 ruhige Märkte, 16 bis 20 Normalbereich, 20 bis 30 erhöhte Volatilität, über 30 Marktstress.",
    format: "punkte", richtung: "neutral",
    schwellen: [{ wert: 30, text: "30 Marktstress" }, { wert: 20, text: "20" }, { wert: 16, text: "16 ruhige Märkte" }],
    stufen: [
      { ueber: 30, text: "über 30, Marktstress" },
      { ab: 20, text: "20 bis 30, erhöhte Volatilität" },
      { ab: 16, text: "16 bis 20, Normalbereich" },
      { text: "unter 16, ruhige Märkte" }
    ],
    vergleich: 1, vergleichName: "Vortag"
  },
  {
    schluessel: "BAMLH0A0HYM2", quelle: "plumbing", gruppe: "marktumfeld",
    titel: "High Yield Credit Spread",
    untertitel: "ICE BofA US High Yield Index Option-Adjusted Spread",
    frage: "Wie viel zusätzlichen Zins verlangen Investoren für riskantere Unternehmensanleihen?",
    einordnung: "Der Kreditmarkt läuft laut Trading Plan vor dem Aktienmarkt: teure Kredite bedeuten steigenden Druck im Finanzsystem. Misst den Unterschied zwischen dem Zinssatz einer sicheren Staatsanleihe und einer riskanteren Unternehmensanleihe. Hoher Spread = Zeichen für Stress im Finanzsystem. Kein fester Schwellenwert im Trading Plan, nur Richtungslogik (Wert und Veränderung).",
    format: "faktor", einheitFest: "%", richtung: "neutral",
    vergleich: 1, vergleichName: "Vortag"
  },
  {
    schluessel: "STLFSI4", quelle: "plumbing", gruppe: "marktumfeld",
    titel: "FED Financial Stress Index",
    untertitel: "St. Louis Fed Financial Stress Index",
    frage: "Wie angespannt ist das gesamte Finanzsystem aktuell?",
    einordnung: "Zusammengesetzter Index aus 18 wöchentlichen Reihen (Zinsen, Spreads, weitere Indikatoren). Laut Trading Plan auf Wert, Trend und Geschwindigkeit schauen. Der Trading Plan nennt zwar Zahlen (über/unter 0, über/unter 1 = Extrem), läuft hier aber auf Wunsch ohne feste Markierung im Chart wie die übrigen Plumbing-Kacheln (Entscheidung 2026-09-17) - zur Einordnung: 0 = durchschnittliche Bedingungen laut St. Louis Fed, darüber überdurchschnittlicher Stress, darunter unterdurchschnittlicher Stress.",
    format: "faktor", einheitFest: "Index", richtung: "neutral",
    vergleich: 1, vergleichName: "Vorwoche"
  }
];
