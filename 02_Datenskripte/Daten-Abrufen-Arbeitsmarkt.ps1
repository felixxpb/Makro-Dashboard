# Daten-Abrufen-Arbeitsmarkt.ps1
# Holt alle FRED-Datenreihen fuer den Themenbereich Arbeitsmarkt und schreibt sie
# in eine Datendatei, die die Website direkt einliest.
#
# Aufruf:
#   powershell -NoProfile -ExecutionPolicy Bypass -File "Daten-Abrufen-Arbeitsmarkt.ps1"
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
# einheit:   wird auf der Kachel hinter dem Wert angezeigt
# anzeige:   wert = Reihe direkt zeigen | diff = Veraenderung zum Vormonat zeigen
# richtung:  hoch_gut | hoch_schlecht | neutral  (steuert die Farbe des Deltas)
# schwelle:  Linien im Graph aus dem Trading Plan (leer = keine)
# units:     optionale FRED-Umrechnung, z.B. pch = Veraenderung zum Vormonat in %
# schluessel: optionaler eigener Name in der Datendatei. Nur noetig, wenn
#            dieselbe FRED-Reihe zweimal mit unterschiedlichen units geholt
#            wird (Average Hourly Earnings: einmal als MoM %, einmal als
#            Dollar-Niveau fuer den Vorjahresvergleich).
$reihen = @(
  @{ id = "ICSA";      titel = "Initial Claims";            einheit = "";        anzeige = "wert"; richtung = "hoch_schlecht"; schwelle = @() }
  @{ id = "UNRATE";    titel = "Unemployment Rate";         einheit = "%";       anzeige = "wert"; richtung = "hoch_schlecht"; schwelle = @() }
  @{ id = "PAYEMS";    titel = "Nonfarm Payrolls";          einheit = "Tsd.";    anzeige = "diff"; richtung = "hoch_gut";      schwelle = @(0) }
  @{ id = "JTSJOR";    titel = "Job Openings Rate";         einheit = "%";       anzeige = "wert"; richtung = "hoch_gut";      schwelle = @() }
  @{ id = "JTSHIR";    titel = "Hires Rate";                einheit = "%";       anzeige = "wert"; richtung = "hoch_gut";      schwelle = @() }
  @{ id = "JTSTSR";    titel = "Total Separations Rate";    einheit = "%";       anzeige = "wert"; richtung = "neutral";       schwelle = @() }
  @{ id = "JTSQUR";    titel = "Quits Rate";                einheit = "%";       anzeige = "wert"; richtung = "hoch_gut";      schwelle = @() }
  @{ id = "ECIALLCIV"; titel = "Employment Cost Index";     einheit = "% QoQ";   anzeige = "qoq";  richtung = "neutral";       schwelle = @() }
  @{ id = "CES0500000003"; titel = "Average Hourly Earnings"; einheit = "% MoM"; anzeige = "wert"; richtung = "neutral";  schwelle = @(); units = "pch" }
  @{ id = "CES0500000003"; schluessel = "CES0500000003_LVL"; titel = "Average Hourly Earnings (Niveau)"; einheit = "USD"; anzeige = "wert"; richtung = "neutral"; schwelle = @() }
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
  $schluessel = if ($r.schluessel) { $r.schluessel } else { $r.id }
  Write-Host ("Hole {0} ..." -f $schluessel) -NoNewline

  $metaUrl = "https://api.stlouisfed.org/fred/series?series_id=$($r.id)&api_key=$key&file_type=json"
  $meta = (Invoke-FredMitWiederholung $metaUrl 30).seriess[0]

  $obsUrl = "https://api.stlouisfed.org/fred/series/observations?series_id=$($r.id)&api_key=$key&file_type=json&observation_start=$start&sort_order=asc"
  if ($r.units) { $obsUrl += "&units=$($r.units)" }
  $obs = (Invoke-FredMitWiederholung $obsUrl 60).observations

  $punkte = @()
  foreach ($o in $obs) {
    if ($o.value -eq ".") { continue }
    $punkte += [ordered]@{ d = $o.date; v = [double]$o.value }
  }

  $ergebnis[$schluessel] = [ordered]@{
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
  bereich      = "Arbeitsmarkt"
  erzeugt      = (Get-Date).ToString("yyyy-MM-dd HH:mm")
  reihen       = $ergebnis
}

$json = $paket | ConvertTo-Json -Depth 10 -Compress
$inhalt = "window.ARBEITSMARKT_DATEN = $json;"

$zielDatei = Join-Path $zielOrdner "arbeitsmarkt.js"
[System.IO.File]::WriteAllText($zielDatei, $inhalt, (New-Object System.Text.UTF8Encoding($false)))

Write-Host ""
Write-Host ("Fertig. Datendatei geschrieben: {0}" -f $zielDatei)
Write-Host ("Reihen: {0}" -f $ergebnis.Count)
