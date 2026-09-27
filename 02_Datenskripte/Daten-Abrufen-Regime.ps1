# Daten-Abrufen-Regime.ps1
# Holt alle Reihen fuer den Themenbereich Regime und schreibt sie in eine
# Datendatei, die die Website direkt einliest.
#
#   FRED:   2Y-Rendite (DGS2), 10Y-Rendite (DGS10), 10Y-2Y-Spread (T10Y2Y)
#   Yahoo:  XLY/XLP, IYT/XLU, HYG/TLT, VUG/VTV (vier Konjunktur-Spreads
#           als Ratio berechnet)
#
# Dazu eine statische historische Referenztabelle (Performance je Regime).
#
# Stand Version 2 (2026-09-25, Vorgabe Felix):
#   - Die Regime-Einstufung wird NICHT mehr hier berechnet, sondern in
#     01_Website/regime-ansicht.js im Browser. Grund: Die Seite schaltet
#     zwischen D1 und W1 um und rechnet das Regime auf der jeweiligen
#     Zeitebene neu - das geht nur zur Laufzeit.
#   - DXY und ZB1 werden nicht mehr geholt, der DXY/ZB1-Quadrant ist
#     ersatzlos gestrichen.
#   - DGS2, DGS10 und T10Y2Y bleiben erhalten: die Regime-Seite braucht
#     DGS2 und DGS10, der Zinsen-Bereich alle drei (zinsen-kacheln.js
#     greift mit quelle "regime" darauf zu).
#
# Details je Quelle und Einstufungsregeln: 03_Doku/Datenquellen_Regime.md
#
# Aufruf:
#   powershell -NoProfile -ExecutionPolicy Bypass -File "Daten-Abrufen-Regime.ps1"
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

$ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36"

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

$start = "2015-01-01"
$ergebnis = [ordered]@{}

# FRED antwortet gelegentlich mit einem kurzen 502, ohne dass etwas kaputt ist.
function Invoke-MitWiederholung([string]$uri, [int]$timeoutSec, [hashtable]$headers) {
  $versuch = 0
  while ($true) {
    $versuch++
    try {
      if ($headers) { return Invoke-RestMethod -Uri $uri -TimeoutSec $timeoutSec -Headers $headers }
      return Invoke-RestMethod -Uri $uri -TimeoutSec $timeoutSec
    } catch {
      if ($versuch -ge 3) { throw }
      Start-Sleep -Seconds (2 * $versuch)
    }
  }
}

# --- FRED: 2Y, 10Y, 10Y-2Y-Spread --------------------------------------------
$fredReihen = @(
  @{ id = "DGS2";   titel = "2Y-Rendite" }
  @{ id = "DGS10";  titel = "10Y-Rendite" }
  @{ id = "T10Y2Y"; titel = "10Y-2Y-Spread" }
)

foreach ($r in $fredReihen) {
  Write-Host ("Hole {0} ..." -f $r.id) -NoNewline

  $metaUrl = "https://api.stlouisfed.org/fred/series?series_id=$($r.id)&api_key=$key&file_type=json"
  $meta = (Invoke-MitWiederholung $metaUrl 30 $null).seriess[0]

  $obsUrl = "https://api.stlouisfed.org/fred/series/observations?series_id=$($r.id)&api_key=$key&file_type=json&observation_start=$start&sort_order=asc"
  $obs = (Invoke-MitWiederholung $obsUrl 60 $null).observations

  $punkte = @()
  foreach ($o in $obs) {
    if ($o.value -eq ".") { continue }
    $punkte += [ordered]@{ d = $o.date; v = [double]$o.value }
  }

  $ergebnis[$r.id] = [ordered]@{
    id           = $r.id
    titel        = $r.titel
    fredTitel    = $meta.title
    frequenz     = $meta.frequency
    aktualisiert = $meta.last_updated
    quelle       = "FRED"
    quelleUrl    = "https://fred.stlouisfed.org/series/$($r.id)"
    punkte       = $punkte
  }

  Write-Host (" {0} Werte, zuletzt {1}" -f $punkte.Count, $punkte[-1].d)
  Start-Sleep -Milliseconds 300
}

# --- Yahoo Finance: ETF-Paare fuer die Konjunktur-Spreads -------------------
# Inoffizielle, aber kostenlose Chart-API.
$p1 = [DateTimeOffset]::Parse("$start`T00:00:00Z").ToUnixTimeSeconds()
$p2 = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()

function Hole-Yahoo([string]$symbol, [string]$titel, [string]$id) {
  Write-Host ("Hole {0} (Yahoo {1}) ..." -f $id, $symbol) -NoNewline
  $enc = [uri]::EscapeDataString($symbol)
  $url = "https://query1.finance.yahoo.com/v8/finance/chart/$enc`?period1=$p1&period2=$p2&interval=1d"
  $r = Invoke-MitWiederholung $url 30 @{ "User-Agent" = $ua }
  $res = $r.chart.result[0]
  $ts = $res.timestamp
  $close = $res.indicators.quote[0].close
  $punkte = @()
  for ($i = 0; $i -lt $ts.Count; $i++) {
    if ($null -eq $close[$i]) { continue }
    $datum = [DateTimeOffset]::FromUnixTimeSeconds($ts[$i]).UtcDateTime.ToString("yyyy-MM-dd")
    $punkte += [ordered]@{ d = $datum; v = [math]::Round([double]$close[$i], 4) }
  }
  Write-Host (" {0} Werte, zuletzt {1} = {2}" -f $punkte.Count, $punkte[-1].d, $punkte[-1].v)
  return [ordered]@{
    id           = $id
    titel        = $titel
    frequenz     = "Daily"
    aktualisiert = (Get-Date).ToString("yyyy-MM-dd")
    quelle       = "Yahoo Finance"
    quelleUrl    = "https://finance.yahoo.com/quote/$enc"
    punkte       = $punkte
  }
}

$etfRoh = @{}
foreach ($s in @(
  @{ sym = "XLY"; titel = "XLY" }, @{ sym = "XLP"; titel = "XLP" },
  @{ sym = "IYT"; titel = "IYT" }, @{ sym = "XLU"; titel = "XLU" },
  @{ sym = "HYG"; titel = "HYG" }, @{ sym = "TLT"; titel = "TLT" },
  @{ sym = "VUG"; titel = "VUG" }, @{ sym = "VTV"; titel = "VTV" }
)) {
  $etfRoh[$s.sym] = Hole-Yahoo $s.sym $s.titel $s.sym
  Start-Sleep -Milliseconds 300
}

# Ratio berechnen: nur Tage, die in beiden Reihen vorkommen
function Berechne-Ratio([string]$idA, [string]$idB, [string]$titel, [string]$id) {
  $bWerte = @{}
  foreach ($p in $etfRoh[$idB].punkte) { $bWerte[$p.d] = $p.v }
  $ratio = @()
  foreach ($p in $etfRoh[$idA].punkte) {
    if ($bWerte.ContainsKey($p.d) -and $bWerte[$p.d] -ne 0) {
      $ratio += [ordered]@{ d = $p.d; v = [math]::Round($p.v / $bWerte[$p.d], 4) }
    }
  }
  return [ordered]@{
    id           = $id
    titel        = $titel
    frequenz     = "Daily"
    aktualisiert = (Get-Date).ToString("yyyy-MM-dd")
    quelle       = "Yahoo Finance, berechnet"
    quelleUrl    = "https://finance.yahoo.com/quote/$idA"
    punkte       = $ratio
  }
}

$ergebnis["XLY_XLP"] = Berechne-Ratio "XLY" "XLP" "XLY/XLP" "XLY_XLP"
Write-Host ("XLY/XLP: {0} Werte, zuletzt {1} = {2}" -f $ergebnis["XLY_XLP"].punkte.Count, $ergebnis["XLY_XLP"].punkte[-1].d, $ergebnis["XLY_XLP"].punkte[-1].v)
$ergebnis["IYT_XLU"] = Berechne-Ratio "IYT" "XLU" "IYT/XLU" "IYT_XLU"
Write-Host ("IYT/XLU: {0} Werte, zuletzt {1} = {2}" -f $ergebnis["IYT_XLU"].punkte.Count, $ergebnis["IYT_XLU"].punkte[-1].d, $ergebnis["IYT_XLU"].punkte[-1].v)
$ergebnis["HYG_TLT"] = Berechne-Ratio "HYG" "TLT" "HYG/TLT" "HYG_TLT"
Write-Host ("HYG/TLT: {0} Werte, zuletzt {1} = {2}" -f $ergebnis["HYG_TLT"].punkte.Count, $ergebnis["HYG_TLT"].punkte[-1].d, $ergebnis["HYG_TLT"].punkte[-1].v)
$ergebnis["VUG_VTV"] = Berechne-Ratio "VUG" "VTV" "VUG/VTV" "VUG_VTV"
Write-Host ("VUG/VTV: {0} Werte, zuletzt {1} = {2}" -f $ergebnis["VUG_VTV"].punkte.Count, $ergebnis["VUG_VTV"].punkte[-1].d, $ergebnis["VUG_VTV"].punkte[-1].v)

# --- Regime-Einstufung -------------------------------------------------------
# Die Einstufung (Bull/Bear Steepener/Flattener, Twist) wird bewusst NICHT
# hier berechnet, sondern in 01_Website/regime-ansicht.js. Dort liegt sie
# einmal zentral und wird beim Umschalten zwischen D1 und W1 jeweils auf
# der gewaehlten Zeitebene neu gerechnet (20 Perioden = IPDA-Regime,
# 3 Perioden = Tages-Regime). Rueckblick zaehlt echte Handelstage, nicht
# Kalenderzeilen (Entscheidung Felix, 2026-09-25).


# --- Historische Referenztabelle (statisch, kein Live-Abruf) ---------------
# Werte aus Regime Theorie Zusammenfassung.docx / Regime Berechnung KOPIE.xlsx,
# Performance = Rendite ueber die Gesamtzeit im jeweiligen Regime seit Messbeginn
# im Rohmaterial. Rein historisch, KEINE aktuelle Empfehlung.
# Hinweistext steht statisch in regime-ansicht.js (Umlaute), hier nur die Zahlen.
# Die Regime-Spalte wird auf der Website in der Farbe des jeweiligen Regimes
# eingefaerbt (Vorgabe Felix, 2026-09-25).
$referenz = [ordered]@{
  zeilen  = @(
    [ordered]@{ regime = "Bull Steepener"; asset = "BTC";   performance = 63 }
    [ordered]@{ regime = "Bull Steepener"; asset = "Gold";  performance = 34 }
    [ordered]@{ regime = "Bull Steepener"; asset = "Oil";   performance = 29 }
    [ordered]@{ regime = "Bear Steepener"; asset = "US500"; performance = 43 }
    [ordered]@{ regime = "Bear Steepener"; asset = "BTC";   performance = 46 }
    [ordered]@{ regime = "Bear Steepener"; asset = "Oil";   performance = 80 }
    [ordered]@{ regime = "Bull Flattener"; asset = "Gold";  performance = 27 }
    [ordered]@{ regime = "Bull Flattener"; asset = "Oil";   performance = 72 }
    [ordered]@{ regime = "Bear Flattener"; asset = "US500"; performance = -3 }
    [ordered]@{ regime = "Bear Flattener"; asset = "Gold";  performance = -18 }
    [ordered]@{ regime = "Bear Flattener"; asset = "Oil";   performance = -181 }
  )
}

# --- Schreiben --------------------------------------------------------------
$paket = [ordered]@{
  bereich         = "Regime"
  erzeugt         = (Get-Date).ToString("yyyy-MM-dd HH:mm")
  reihen          = $ergebnis
  referenz        = $referenz
}

$json = $paket | ConvertTo-Json -Depth 10 -Compress
$inhalt = "window.REGIME_DATEN = $json;"

$zielDatei = Join-Path $zielOrdner "regime.js"
[System.IO.File]::WriteAllText($zielDatei, $inhalt, (New-Object System.Text.UTF8Encoding($false)))

Write-Host ""
Write-Host ("Fertig. Datendatei geschrieben: {0}" -f $zielDatei)
Write-Host ("Reihen: {0}" -f $ergebnis.Count)
