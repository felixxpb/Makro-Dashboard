// scripts/update-webquellen-ism.js
const fs = require('fs');
const path = require('path');

const DATEN_PATH = path.join(__dirname, '..', 'daten', 'webquellen.js');

const QUELLEN = [
  { schluessel: 'ISM_MFG_NO', url: 'https://tradingeconomics.com/united-states/ism-manufacturing-new-orders' },
  { schluessel: 'ISM_MFG_BACKLOG', url: 'https://tradingeconomics.com/united-states/ism-manufacturing-backlog-of-orders' },
  { schluessel: 'ISM_SVC_BUSACT', url: 'https://tradingeconomics.com/united-states/ism-non-manufacturing-business-activity' },
];

const MONATE = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

async function holeWert(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
  });
  if (!res.ok) throw new Error(`Fehler beim Abruf von ${url}: ${res.status}`);
  const html = await res.text();

  const meta = html.match(/name="description" content="([^"]+)"/i);
  if (!meta) throw new Error(`Keine Meta-Beschreibung gefunden für ${url}`);

  const m = meta[1].match(
    /to ([\d.]+)\s*(?:points|percent)?\s*in (\w+) from ([\d.]+)\s*(?:points|percent)?\s*in (\w+) of (\d{4})/i
  );
  if (!m) throw new Error(`Konnte Wert nicht aus Meta-Text parsen: "${meta[1]}"`);

  const [, wertStr, monatName, vorwertStr, vorMonatName, jahrStr] = m;
  const jahr = parseInt(jahrStr, 10);
  const monat = MONATE[monatName.toLowerCase()];
  const vorMonat = MONATE[vorMonatName.toLowerCase()];
  const vorJahr = vorMonat > monat ? jahr - 1 : jahr;

  return {
    wert: parseFloat(wertStr),
    monat,
    jahr,
    stand: `${jahr}-${String(monat).padStart(2, '0')}-01`,
    vorwert: parseFloat(vorwertStr),
    vorwertStand: `${vorJahr}-${String(vorMonat).padStart(2, '0')}-01`,
  };
}

async function main() {
  const raw = fs.readFileSync(DATEN_PATH, 'utf8');
  const jsonText = raw.replace(/^window\.WEBQUELLEN_DATEN\s*=\s*/, '').replace(/;\s*$/, '');
  const daten = JSON.parse(jsonText);

  let geaendert = false;

  for (const q of QUELLEN) {
    try {
      const info = await holeWert(q.url);
      const eintrag = daten.reihen[q.schluessel];
      if (!eintrag) {
        console.warn(`Kein bestehender Eintrag für ${q.schluessel}, überspringe.`);
        continue;
      }

      const schonDrin = eintrag.punkte.some(p => p.d === info.stand);
      if (!schonDrin) {
        eintrag.punkte.push({ d: info.stand, v: info.wert });
        eintrag.punkte.sort((a, b) => a.d.localeCompare(b.d));
        geaendert = true;
      }

      eintrag.wert = info.wert;
      eintrag.monat = info.monat;
      eintrag.jahr = info.jahr;
      eintrag.stand = info.stand;
      eintrag.vorwert = info.vorwert;
      eintrag.vorwertStand = info.vorwertStand;
      eintrag.abgerufen = new Date().toISOString().slice(0, 16).replace('T', ' ');

      console.log(`${q.schluessel}: ${info.wert} (${info.stand}) ${schonDrin ? '(kein neuer Punkt)' : '(neuer Punkt hinzugefügt)'}`);
    } catch (err) {
      console.error(`Fehler bei ${q.schluessel}: ${err.message}`);
    }
  }

  if (geaendert) {
    daten.erzeugt = new Date().toISOString().slice(0, 16).replace('T', ' ');
  }

  const output = `window.WEBQUELLEN_DATEN = ${JSON.stringify(daten, null, 2)};\n`;
  fs.writeFileSync(DATEN_PATH, output, 'utf8');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
