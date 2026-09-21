name: Update ISM PMI Data

on:
  schedule:
    - cron: '0 6 1-7 * 3'   # jeden 1. Mittwoch im Monat, 6 Uhr UTC (PMI erscheint i.d.R. Anfang Monats)
  workflow_dispatch:         # erlaubt manuellen Start über den "Run workflow"-Button

permissions:
  contents: write

jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: PMI-Daten abrufen und Datei aktualisieren
        run: node scripts/update-pmi.js

      - name: Änderungen committen
        run: |
          git config user.name "PMI-Update-Bot"
          git config user.email "actions@github.com"
          git add daten/wachstum.js
          git diff --staged --quiet || git commit -m "Auto-Update: ISM PMI Daten"
          git push
