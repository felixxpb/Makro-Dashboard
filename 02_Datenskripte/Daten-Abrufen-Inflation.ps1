# Daten-Abrufen-Inflation.ps1
# Holt alle FRED-Datenreihen fuer den Themenbereich Inflation und schreibt sie
# in eine Datendatei, die die Website direkt einliest.
#
# Aufruf:
#   powershell -NoProfile -ExecutionPolicy Bypass -File "Daten-Abrufen-Inflation.ps1"
#
# Enthaelt neben den 9 Kennzahlen mit eigener Kachel zusaetzlich 5 CPI- und
# 6 PPI-Kategorien. Diese erscheinen nicht als Kachel, sondern als
# Balkenuebersicht in der Detailansicht von CPI (Headline) und PPI (Final
# Demand), siehe Datenquellen_Inflation.md Abschnitt 3.
#
# Hinweis: Das Skript enthaelt bewusst keine Umlaute (Windows PowerShell 5.1).

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$skriptOrdner = $PSScriptRoot
$projektOrdner = Split-Path -Parent $skriptOrdner
# Ausgabeordner: lokal "01_Website\daten" neben den Skripten. Auf GitHub
# Actions liegen die Website-Dateien direkt im Repo-Wurzelordner - dort setzt
# der Workflow die Umgebungsvariable DASHBOARD_DATEN auf den richtigen Pfad.
if ($env:DASHBOARD_DATEN) { $zielOrdner = $env:DASHBOARD_DATEN }
else { $zielOrdner = Join-Path $projektOrdner "01_Website\daten" }
if (-not (Test-Path $zielOrdner)) { New-Item -ItemType Directory -Force -Path $zielOrdner | Out-Null }

# --- Schluessel laden -------------------------------------------------------
# FRED-Schluessel: auf GitHub Actions aus dem Secret (Umgebungsvariable),
# lokal aus zugangsdaten.txt. Diese Datei kommt nie ins Repository.
if ($env:FRED_API_KEY) {
  $key = $env:FRED_API_KEY.Trim()
} else {
  $keyFile = Join-Path $skriptOrdner "zugangsdaten.txt"
  $zeile = Get-Content $keyFile | Where-Object { $_ -match '^FRED_API_KEY=' }
  $key = ($zeile -split '=', 2)[1].Trim()
}
if ($key -notmatch '^[0-9a-zA-Z]{32}$') { throw "FRED-Schluessel fehlt oder hat ein falsches Format." }

# --- Definition der Kennzahlen ---------------------------------------------
# einheit:   wird auf der Kachel hinter dem Wert angezeigt (die Ableitung YoY
#            rechnet die Website selbst, einheit hier ist nur ein Rueckfall)
# anzeige:   wert = Reihe direkt zeigen | yoy = Website rechnet YoY
# richtung:  bewusst durchgehend neutral, siehe bereiche/inflation-kacheln.js
# schwelle:  Linien im Graph aus dem Trading Plan (leer = keine)
$reihen = @(
  @{ id = "CPIAUCSL";      titel = "CPI (Headline)";       einheit = "% YoY"; anzeige = "yoy"; richtung = "neutral"; schwelle = @() }
  @{ id = "CPILFESL";      titel = "Core CPI";              einheit = "% YoY"; anzeige = "yoy"; richtung = "neutral"; schwelle = @() }
  @{ id = "PPIFIS";        titel = "PPI (Final Demand)";    einheit = "% YoY"; anzeige = "yoy"; richtung = "neutral"; schwelle = @() }
  @{ id = "PPIFES";        titel = "Core PPI";              einheit = "% YoY"; anzeige = "yoy"; richtung = "neutral"; schwelle = @() }
  @{ id = "DCOILBRENTEU";  titel = "Brent-Rohoel";          einheit = "USD";   anzeige = "wert"; richtung = "neutral"; schwelle = @() }
  @{ id = "M2SL";          titel = "M2 Geldmenge";          einheit = "% YoY"; anzeige = "yoy"; richtung = "neutral"; schwelle = @() }
  @{ id = "T5YIE";         titel = "TIPS-Breakeven 5 Jahre"; einheit = "%";    anzeige = "wert"; richtung = "neutral"; schwelle = @() }
  @{ id = "T5YIFR";        titel = "5y5y Forward Breakeven"; einheit = "%";   anzeige = "wert"; richtung = "neutral"; schwelle = @() }
  @{ id = "MICH";          titel = "Michigan Inflationserwartung"; einheit = "%"; anzeige = "wert"; richtung = "neutral"; schwelle = @() }
  # Kategorien fuer die spaetere Aufschluesselung (noch nicht als Kachel):
  @{ id = "CUSR0000SAH1";  titel = "CPI: Shelter";          einheit = "% YoY"; anzeige = "yoy"; richtung = "neutral"; schwelle = @() }
  @{ id = "CPIENGSL";      titel = "CPI: Energy";           einheit = "% YoY"; anzeige = "yoy"; richtung = "neutral"; schwelle = @() }
  @{ id = "CPIUFDSL";      titel = "CPI: Food";             einheit = "% YoY"; anzeige = "yoy"; richtung = "neutral"; schwelle = @() }
  @{ id = "CUSR0000SACL1E"; titel = "CPI: Core Goods";      einheit = "% YoY"; anzeige = "yoy"; richtung = "neutral"; schwelle = @() }
  @{ id = "CUSR0000SASLE"; titel = "CPI: Core Services";    einheit = "% YoY"; anzeige = "yoy"; richtung = "neutral"; schwelle = @() }
  # PPI-Kategorien: die sechs Bausteine von PPI Final Demand, saisonbereinigt
  @{ id = "PPIDFS";        titel = "PPI: Food";             einheit = "% YoY"; anzeige = "yoy"; richtung = "neutral"; schwelle = @() }
  @{ id = "PPIDES";        titel = "PPI: Energy";           einheit = "% YoY"; anzeige = "yoy"; richtung = "neutral"; schwelle = @() }
  @{ id = "WPSFD413";      titel = "PPI: Core Goods";       einheit = "% YoY"; anzeige = "yoy"; richtung = "neutral"; schwelle = @() }
  @{ id = "PPITSS";        titel = "PPI: Trade Services";   einheit = "% YoY"; anzeige = "yoy"; richtung = "neutral"; schwelle = @() }
  @{ id = "PPIAWS";        titel = "PPI: Transport und Lager"; einheit = "% YoY"; anzeige = "yoy"; richtung = "neutral"; schwelle = @() }
  @{ id = "PPITWS";        titel = "PPI: Uebrige Services"; einheit = "% YoY"; anzeige = "yoy"; richtung = "neutral"; schwelle = @() }
)

$start = "2015-01-01"
$ergebnis = [ordered]@{}

# FRED antwortet gelegentlich mit einem kurzen 502, ohne dass etwas kaputt ist.
# Deshalb bei Bedarf bis zu dreimal erneut versuchen.
function Invoke-FredMitWiederholung([string]$uri, [int]$timeoutSec) {
  $versuch = 0
  while ($true) {
    $versuch++
    try {
      return Invoke-RestMethod -Uri $uri -TimeoutSec $timeoutSec
    } catch {
      if ($versuch -ge 3) { throw }
      Start-Sleep -Seconds (2 * $versuch)
    }
  }
}

foreach ($r in $reihen) {
  Write-Host ("Hole {0} ..." -f $r.id) -NoNewline

  $metaUrl = "https://api.stlouisfed.org/fred/series?series_id=$($r.id)&api_key=$key&file_type=json"
  $meta = (Invoke-FredMitWiederholung $metaUrl 30).seriess[0]

  $obsUrl = "https://api.stlouisfed.org/fred/series/observations?series_id=$($r.id)&api_key=$key&file_type=json&observation_start=$start&sort_order=asc"
  $obs = (Invoke-FredMitWiederholung $obsUrl 60).observations

  $punkte = @()
  foreach ($o in $obs) {
    if ($o.value -eq ".") { continue }
    $punkte += [ordered]@{ d = $o.date; v = [double]$o.value }
  }

  $ergebnis[$r.id] = [ordered]@{
    id             = $r.id
    titel          = $r.titel
    fredTitel      = $meta.title
    einheit        = $r.einheit
    anzeige        = $r.anzeige
    richtung       = $r.richtung
    schwelle       = $r.schwelle
    frequenz       = $meta.frequency
    saisonbereinigt = $meta.seasonal_adjustment_short
    aktualisiert   = $meta.last_updated
    quelle         = "FRED"
    quelleUrl      = "https://fred.stlouisfed.org/series/$($r.id)"
    punkte         = $punkte
  }

  Write-Host (" {0} Werte, zuletzt {1}" -f $punkte.Count, $punkte[-1].d)
  Start-Sleep -Milliseconds 300
}

# --- Schreiben --------------------------------------------------------------
$paket = [ordered]@{
  bereich      = "Inflation"
  erzeugt      = (Get-Date).ToString("yyyy-MM-dd HH:mm")
  reihen       = $ergebnis
}

$json = $paket | ConvertTo-Json -Depth 10 -Compress
$inhalt = "window.INFLATION_DATEN = $json;"

$zielDatei = Join-Path $zielOrdner "inflation.js"
[System.IO.File]::WriteAllText($zielDatei, $inhalt, (New-Object System.Text.UTF8Encoding($false)))

Write-Host ""
Write-Host ("Fertig. Datendatei geschrieben: {0}" -f $zielDatei)
Write-Host ("Reihen: {0}" -f $ergebnis.Count)

# --- CPI-Kategorien von BLS (nur CPI Headline, PPI bleibt FRED-basiert) -----
# Entscheidung Felix, 2026-09-21: die Kategorie-Aufschluesselung der CPI
# (Headline)-Kachel kommt jetzt zusaetzlich von BLS (17 Kategorien, 13
# Monatswerte fuer eine 12-Monats-Navigation in der Detailansicht). Die
# bisherige FRED-Aufschluesselung (aufschluesselung-Feld, 5 Kategorien)
# bleibt unveraendert bestehen und wird weiter von der PPI-Kachel benutzt -
# das ist ein zweiter, unabhaengiger Mechanismus, kein Ersatz.
#
# Abweichung von der urspruenglichen Idee (HTML-Tabelle der BLS-Chartseite
# auslesen), gefunden und entschieden am 2026-09-21:
# 1) Die Chartseite blockt Abrufe ohne vollstaendige Browser-Kopfzeilen mit
#    403 - ein User-Agent allein reicht nicht, es braucht einen vollen Satz
#    Chrome-typischer Kopfzeilen (sec-ch-ua, Sec-Fetch-*, Accept-Language).
#    Das liess sich zwar loesen, ABER:
# 2) Die eingebettete Tabelle dieser Chartseite enthaelt nur ZWEIMONATLICHE
#    Werte (Aug, Oct, Dec, Feb, Apr, Jun, ...), keine echte Monatsreihe - das
#    ist die Tick-Beschriftung des Charts, nicht die volle BLS-Monatsreihe.
#    Damit waere eine echte "12 Monate zurueck"-Navigation nicht moeglich.
# Stattdessen: direkter Abruf ueber die oeffentliche BLS-API
# (api.bls.gov/publicAPI/v1, kein Schluessel noetig, keine Blockierung
# beobachtet), die fuer jede Kategorie den monatlichen Indexstand liefert.
# Die 12-Monats-Veraenderungsrate wird daraus im Skript berechnet (gleiche
# Rechnung wie die YoY-Ableitung im Dashboard selbst, nur hier vorab erledigt,
# weil die API Indexstaende statt fertiger Veraenderungsraten liefert).
# Gegengeprueft am 2026-09-21: die berechneten Werte fuer August 2026 (All
# items 3,4 % / Energy 16,3 % / Shelter 3,0 %) stimmen exakt mit den Werten
# der BLS-Chartseite ueberein.

function Get-BlsCpiKategorien() {
  # BLS-Serienkennungen (CPI-U, US City Average, nicht saisonbereinigt "CUUR"),
  # Item-Codes entsprechen den Kategorien der BLS-Chartseite, Stand 2026-09-21.
  $kategorien = @(
    @{ key = "alleWaren";        name = "All items";                                    id = "CUUR0000SA0" }
    @{ key = "nahrung";          name = "Food";                                         id = "CUUR0000SAF1" }
    @{ key = "nahrungZuhause";   name = "Food at home";                                 id = "CUUR0000SAF11" }
    @{ key = "nahrungAuswaerts"; name = "Food away from home";                          id = "CUUR0000SEFV" }
    @{ key = "energie";          name = "Energy";                                       id = "CUUR0000SA0E" }
    @{ key = "benzin";           name = "Gasoline (all types)";                         id = "CUUR0000SETB01" }
    @{ key = "strom";            name = "Electricity";                                  id = "CUUR0000SEHF01" }
    @{ key = "erdgas";           name = "Natural gas (piped)";                          id = "CUUR0000SEHF02" }
    @{ key = "core";             name = "All items less food and energy";               id = "CUUR0000SA0L1E" }
    @{ key = "coreWaren";        name = "Commodities less food and energy commodities"; id = "CUUR0000SACL1E" }
    @{ key = "bekleidung";       name = "Apparel";                                      id = "CUUR0000SAA" }
    @{ key = "neuwagen";         name = "New vehicles";                                 id = "CUUR0000SETA02" }
    @{ key = "medizinWaren";     name = "Medical care commodities";                     id = "CUUR0000SAM1" }
    @{ key = "coreDienst";       name = "Services less energy services";                id = "CUUR0000SASLE" }
    @{ key = "wohnen";           name = "Shelter";                                      id = "CUUR0000SAH1" }
    @{ key = "medizinDienst";    name = "Medical care services";                        id = "CUUR0000SAM2" }
    @{ key = "bildung";          name = "Education and communication";                  id = "CUUR0000SAE" }
  )

  $ids = @($kategorien | ForEach-Object { $_.id })
  $antwortBody = (@{ seriesid = $ids } | ConvertTo-Json)
  $antwort = Invoke-RestMethod -Uri "https://api.bls.gov/publicAPI/v1/timeseries/data/" -Method Post -Body $antwortBody -ContentType "application/json" -TimeoutSec 30
  if ($antwort.status -ne "REQUEST_SUCCEEDED") {
    throw ("BLS API: {0} - {1}" -f $antwort.status, ($antwort.message -join " | "))
  }

  # Indexstand je Kategorie nach "JJJJ-MM" fuer die YoY-Berechnung
  $indexJeKategorie = @{}
  foreach ($s in $antwort.Results.series) {
    $kat = $kategorien | Where-Object { $_.id -eq $s.seriesID } | Select-Object -First 1
    if (-not $kat) { continue }
    $indexNachMonat = @{}
    foreach ($p in $s.data) {
      if ($p.period -notmatch '^M(0[1-9]|1[0-2])$') { continue }
      # Fehlende Werte stehen bei BLS als "-" (z.B. bei Erhebungsausfaellen),
      # analog zu FRED, das "." fuer fehlende Werte nutzt - ueberspringen.
      $wertRoh = [string]$p.value
      $wertGeprueft = 0.0
      if (-not [double]::TryParse($wertRoh, [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$wertGeprueft)) { continue }
      $monatsNr = [int]$p.period.Substring(1)
      $schluessel = "{0}-{1:00}" -f $p.year, $monatsNr
      $indexNachMonat[$schluessel] = $wertGeprueft
    }
    $indexJeKategorie[$kat.key] = $indexNachMonat
  }

  foreach ($kat in $kategorien) {
    if (-not $indexJeKategorie.ContainsKey($kat.key) -or $indexJeKategorie[$kat.key].Count -eq 0) {
      throw ("BLS API: keine Daten fuer {0} ({1})." -f $kat.name, $kat.id)
    }
  }

  # Gemeinsame Monatsliste, chronologisch aufsteigend, an "All items" ausgerichtet
  $alleMonate = $indexJeKategorie["alleWaren"].Keys | Sort-Object
  $yoyMonate = @()
  foreach ($m in $alleMonate) {
    $teile = $m -split '-'
    $jahr = [int]$teile[0]; $monat = [int]$teile[1]
    $vorJahrMonat = "{0}-{1:00}" -f ($jahr - 1), $monat

    $werte = [ordered]@{}
    $vollstaendig = $true
    foreach ($kat in $kategorien) {
      $idx = $indexJeKategorie[$kat.key]
      if (-not $idx.ContainsKey($m) -or -not $idx.ContainsKey($vorJahrMonat)) { $vollstaendig = $false; break }
      $werte[$kat.key] = [math]::Round((($idx[$m] / $idx[$vorJahrMonat]) - 1) * 100, 1)
    }
    if (-not $vollstaendig) { continue }

    $yoyMonate += [ordered]@{
      d     = ("{0:0000}-{1:00}-01" -f $jahr, $monat)
      werte = $werte
    }
  }

  if ($yoyMonate.Count -lt 13) { throw ("BLS API: zu wenige vollstaendige YoY-Monate ({0} von mindestens 13 noetig)." -f $yoyMonate.Count) }

  # Nur die letzten 13 Monate werden gebraucht (12 Monate Navigation + der
  # jeweilige Vormonat des aeltesten angezeigten Monats)
  $letzte13 = $yoyMonate[($yoyMonate.Count - 13)..($yoyMonate.Count - 1)]

  return [ordered]@{
    kategorien = @($kategorien | ForEach-Object { [ordered]@{ key = $_.key; name = $_.name } })
    monate     = $letzte13
    quelleUrl  = "https://www.bls.gov/charts/consumer-price-index/consumer-price-index-by-category-line-chart.htm"
  }
}

Write-Host ""
Write-Host "Hole CPI-Kategorien von BLS ..." -NoNewline
try {
  $bls = Get-BlsCpiKategorien
  $blsPaket = [ordered]@{
    bereich    = "Inflation - CPI-Kategorien (BLS, nur CPI Headline)"
    erzeugt    = (Get-Date).ToString("yyyy-MM-dd HH:mm")
    quelle     = "U.S. Bureau of Labor Statistics"
    quelleUrl  = $bls.quelleUrl
    abgerufen  = (Get-Date).ToString("yyyy-MM-dd HH:mm")
    kategorien = $bls.kategorien
    monate     = $bls.monate
  }
  $blsJson = $blsPaket | ConvertTo-Json -Depth 10 -Compress
  $blsInhalt = "window.CPI_KATEGORIEN_DATEN = $blsJson;"
  $blsZielDatei = Join-Path $zielOrdner "cpi-kategorien.js"
  [System.IO.File]::WriteAllText($blsZielDatei, $blsInhalt, (New-Object System.Text.UTF8Encoding($false)))
  Write-Host (" {0} Monate, {1} Kategorien, zuletzt {2}" -f $bls.monate.Count, $bls.kategorien.Count, $bls.monate[$bls.monate.Count - 1].d)
  Write-Host ("Datendatei geschrieben: {0}" -f $blsZielDatei)
} catch {
  Write-Host " FEHLER"
  Write-Host ("ACHTUNG: CPI-Kategorien von BLS konnten nicht abgerufen werden: {0}" -f $_.Exception.Message)
  Write-Host "Die vorhandene daten/cpi-kategorien.js (falls vorhanden) bleibt unveraendert stehen."
}
