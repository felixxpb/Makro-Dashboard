# Daten-Abrufen-Plumbing.ps1
# Holt alle Reihen fuer den Themenbereich Plumbing und schreibt sie in eine
# Datendatei, die die Website direkt einliest.
#
#   NY Fed:  SOFR Satz und SOFR Volumen (eine Quelle, zwei Kacheln)
#   FRED:    REPO (RPONTSYD), Overnight Reverse Repo (RRPONTSYD), VIX (VIXCLS),
#            High Yield Credit Spread (BAMLH0A0HYM2), FED Financial Stress
#            Index (STLFSI4)
#
# Details je Quelle: 03_Doku/Datenquellen_Plumbing.md
#
# Aufruf:
#   powershell -NoProfile -ExecutionPolicy Bypass -File "Daten-Abrufen-Plumbing.ps1"
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

$start = "2015-01-01"
$ergebnis = [ordered]@{}

# FRED antwortet gelegentlich mit einem kurzen 502, ohne dass etwas kaputt ist.
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

# --- NY Fed: SOFR Satz und Volumen ------------------------------------------
# Eine Abfrage liefert beides (percentRate, volumeInBillions), aufgeteilt auf
# zwei Kacheln, weil Satz (%) und Volumen (Mrd. USD) nicht auf eine Achse
# gehoeren (Gestaltungsregel: nie zwei Wertachsen in einem Graph).
Write-Host "Hole SOFR (NY Fed) ..." -NoNewline
$sofrUrl = "https://markets.newyorkfed.org/api/rates/secured/sofr/search.json?startDate=$start&endDate=$(Get-Date -Format yyyy-MM-dd)"
$sofrDaten = Invoke-FredMitWiederholung $sofrUrl 60
$sofrRohListe = @($sofrDaten.refRates | Sort-Object effectiveDate)

$sofrSatzPunkte = @()
$sofrVolumenPunkte = @()
foreach ($e in $sofrRohListe) {
  if ($null -ne $e.percentRate) { $sofrSatzPunkte += [ordered]@{ d = $e.effectiveDate; v = [double]$e.percentRate } }
  if ($null -ne $e.volumeInBillions) { $sofrVolumenPunkte += [ordered]@{ d = $e.effectiveDate; v = [double]$e.volumeInBillions } }
}

$ergebnis["SOFR_RATE"] = [ordered]@{
  id           = "SOFR_RATE"
  titel        = "SOFR (Satz)"
  frequenz     = "Daily"
  aktualisiert = $sofrSatzPunkte[-1].d
  quelle       = "Federal Reserve Bank of New York"
  quelleUrl    = "https://www.newyorkfed.org/markets/reference-rates/sofr"
  punkte       = $sofrSatzPunkte
}
Write-Host (" {0} Werte, zuletzt {1} = {2}" -f $sofrSatzPunkte.Count, $sofrSatzPunkte[-1].d, $sofrSatzPunkte[-1].v)

Write-Host "SOFR Volumen ..." -NoNewline
$ergebnis["SOFR_VOLUME"] = [ordered]@{
  id           = "SOFR_VOLUME"
  titel        = "SOFR Volumen"
  frequenz     = "Daily"
  aktualisiert = $sofrVolumenPunkte[-1].d
  quelle       = "Federal Reserve Bank of New York"
  quelleUrl    = "https://www.newyorkfed.org/markets/reference-rates/sofr"
  punkte       = $sofrVolumenPunkte
}
Write-Host (" {0} Werte, zuletzt {1} = {2} Mrd. USD" -f $sofrVolumenPunkte.Count, $sofrVolumenPunkte[-1].d, $sofrVolumenPunkte[-1].v)

# --- FRED ---------------------------------------------------------------
$reihen = @(
  @{ id = "RPONTSYD";     titel = "REPO (Fed-Operationen)" }
  @{ id = "RRPONTSYD";    titel = "Overnight Reverse Repo" }
  @{ id = "VIXCLS";       titel = "VIX" }
  @{ id = "BAMLH0A0HYM2"; titel = "High Yield Credit Spread" }
  @{ id = "STLFSI4";      titel = "FED Financial Stress Index" }
)

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
    id              = $r.id
    titel           = $r.titel
    fredTitel       = $meta.title
    frequenz        = $meta.frequency
    saisonbereinigt = $meta.seasonal_adjustment_short
    aktualisiert    = $meta.last_updated
    quelle          = "FRED"
    quelleUrl       = "https://fred.stlouisfed.org/series/$($r.id)"
    punkte          = $punkte
  }

  Write-Host (" {0} Werte, zuletzt {1}" -f $punkte.Count, $punkte[-1].d)
  Start-Sleep -Milliseconds 300
}

# --- Schreiben --------------------------------------------------------------
$paket = [ordered]@{
  bereich = "Plumbing"
  erzeugt = (Get-Date).ToString("yyyy-MM-dd HH:mm")
  reihen  = $ergebnis
}

$json = $paket | ConvertTo-Json -Depth 10 -Compress
$inhalt = "window.PLUMBING_DATEN = $json;"

$zielDatei = Join-Path $zielOrdner "plumbing.js"
[System.IO.File]::WriteAllText($zielDatei, $inhalt, (New-Object System.Text.UTF8Encoding($false)))

Write-Host ""
Write-Host ("Fertig. Datendatei geschrieben: {0}" -f $zielDatei)
Write-Host ("Reihen: {0}" -f $ergebnis.Count)
