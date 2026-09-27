# Daten-Abrufen-Sentiment.ps1
# Holt den woechentlichen CFTC Commitments-of-Traders-Report (Legacy, Futures
# Only) fuer neun Instrumente und schreibt sie in eine Datendatei, die die
# Website direkt einliest.
#
# Quelle: CFTC Socrata Open Data API, Legacy Futures Only, kostenlos, kein
# Schluessel noetig. Drei Parteien je Instrument: Commercials (Banken/Hedger),
# Non-Commercial (Large Speculators, Hedgefonds/CTAs), Nonreportable (Small
# Speculators). Das Skript berechnet je Partei die Netto-Position
# (Long minus Short), das ist die uebliche Darstellung eines COT-Charts.
#
# WICHTIG: Nur Rohdaten (Netto-Positionen), KEINE Extrempositions- oder
# COT-Flip-Einstufung. Die genauen Schwellenregeln aus COT Edge.docx sind
# nicht eindeutig (siehe 03_Doku/Datenquellen_Sentiment.md Abschnitt 5),
# Felix hat entschieden: erstmal nur Rohdaten zeigen (2026-09-18).
#
# Aufruf:
#   powershell -NoProfile -ExecutionPolicy Bypass -File "Daten-Abrufen-Sentiment.ps1"
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

$start = "2015-01-01"
$ergebnis = [ordered]@{}

function Invoke-MitWiederholung([string]$uri, [int]$timeoutSec) {
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

# CFTC Legacy Futures Only, Socrata-Endpunkt
$basisUrl = "https://publicreporting.cftc.gov/resource/6dca-aqww.json"

# Die CFTC hat mehrere Marktnamen ab dem 08.02.2022 umbenannt (beim Bau
# festgestellt: GBP, NZD und DXY liefen vorher unter anderem Namen, sonst
# waere die Historie an dieser Stelle abgeschnitten). Pro Instrument werden
# deshalb ggf. mehrere Namen abgefragt und zusammengefuehrt.
$instrumente = @(
  @{ id = "EUR"; marktnamen = @("EURO FX - CHICAGO MERCANTILE EXCHANGE");             titel = "EUR (Euro FX)" }
  @{ id = "GBP"; marktnamen = @("BRITISH POUND STERLING - CHICAGO MERCANTILE EXCHANGE", "BRITISH POUND - CHICAGO MERCANTILE EXCHANGE"); titel = "GBP (British Pound)" }
  @{ id = "JPY"; marktnamen = @("JAPANESE YEN - CHICAGO MERCANTILE EXCHANGE");        titel = "JPY (Japanese Yen)" }
  @{ id = "AUD"; marktnamen = @("AUSTRALIAN DOLLAR - CHICAGO MERCANTILE EXCHANGE");   titel = "AUD (Australian Dollar)" }
  @{ id = "CAD"; marktnamen = @("CANADIAN DOLLAR - CHICAGO MERCANTILE EXCHANGE");     titel = "CAD (Canadian Dollar)" }
  @{ id = "CHF"; marktnamen = @("SWISS FRANC - CHICAGO MERCANTILE EXCHANGE");         titel = "CHF (Swiss Franc)" }
  @{ id = "NZD"; marktnamen = @("NEW ZEALAND DOLLAR - CHICAGO MERCANTILE EXCHANGE", "NZ DOLLAR - CHICAGO MERCANTILE EXCHANGE"); titel = "NZD (New Zealand Dollar)" }
  @{ id = "DXY"; marktnamen = @("U.S. DOLLAR INDEX - ICE FUTURES U.S.", "USD INDEX - ICE FUTURES U.S."); titel = "DXY (USD Index Future)" }
  @{ id = "XAU"; marktnamen = @("GOLD - COMMODITY EXCHANGE INC.");                    titel = "XAU (Gold)" }
)

foreach ($inst in $instrumente) {
  Write-Host ("Hole COT {0} ..." -f $inst.id) -NoNewline

  $namensBedingung = ($inst.marktnamen | ForEach-Object { "market_and_exchange_names = '$_'" }) -join " OR "
  $whereClause = "($namensBedingung) AND report_date_as_yyyy_mm_dd >= '$start'"
  $wo = [uri]::EscapeDataString($whereClause)
  $url = "$basisUrl`?`$where=$wo&`$limit=50000&`$order=report_date_as_yyyy_mm_dd ASC" +
         "&`$select=report_date_as_yyyy_mm_dd,comm_positions_long_all,comm_positions_short_all," +
         "noncomm_positions_long_all,noncomm_positions_short_all," +
         "nonrept_positions_long_all,nonrept_positions_short_all,open_interest_all"

  $rows = Invoke-MitWiederholung $url 60

  $nonCommNet = @()
  $commNet = @()
  $nonReptNet = @()
  $openInterest = @()

  foreach ($r in $rows) {
    $datum = ($r.report_date_as_yyyy_mm_dd -split 'T')[0]
    $nonCommNet  += [ordered]@{ d = $datum; v = [int]$r.noncomm_positions_long_all - [int]$r.noncomm_positions_short_all }
    $commNet     += [ordered]@{ d = $datum; v = [int]$r.comm_positions_long_all - [int]$r.comm_positions_short_all }
    $nonReptNet  += [ordered]@{ d = $datum; v = [int]$r.nonrept_positions_long_all - [int]$r.nonrept_positions_short_all }
    $openInterest += [ordered]@{ d = $datum; v = [int]$r.open_interest_all }
  }

  $quelleUrl = "https://publicreporting.cftc.gov/Commitments-of-Traders/Legacy-Combined/jun7-fc8e"

  $ergebnis[$inst.id + "_NONCOMM_NET"] = [ordered]@{
    id = $inst.id + "_NONCOMM_NET"; titel = $inst.titel + " - Large Speculators (Netto)"
    frequenz = "Weekly"; aktualisiert = (Get-Date).ToString("yyyy-MM-dd")
    quelle = "CFTC (Legacy Futures Only)"; quelleUrl = $quelleUrl; punkte = $nonCommNet
  }
  $ergebnis[$inst.id + "_COMM_NET"] = [ordered]@{
    id = $inst.id + "_COMM_NET"; titel = $inst.titel + " - Commercials (Netto)"
    frequenz = "Weekly"; aktualisiert = (Get-Date).ToString("yyyy-MM-dd")
    quelle = "CFTC (Legacy Futures Only)"; quelleUrl = $quelleUrl; punkte = $commNet
  }
  $ergebnis[$inst.id + "_NONREPT_NET"] = [ordered]@{
    id = $inst.id + "_NONREPT_NET"; titel = $inst.titel + " - Small Speculators (Netto)"
    frequenz = "Weekly"; aktualisiert = (Get-Date).ToString("yyyy-MM-dd")
    quelle = "CFTC (Legacy Futures Only)"; quelleUrl = $quelleUrl; punkte = $nonReptNet
  }
  $ergebnis[$inst.id + "_OI"] = [ordered]@{
    id = $inst.id + "_OI"; titel = $inst.titel + " - Open Interest"
    frequenz = "Weekly"; aktualisiert = (Get-Date).ToString("yyyy-MM-dd")
    quelle = "CFTC (Legacy Futures Only)"; quelleUrl = $quelleUrl; punkte = $openInterest
  }

  Write-Host (" {0} Wochen, zuletzt {1}: Large Spec Netto {2}, Commercials Netto {3}" -f `
    $nonCommNet.Count, $nonCommNet[-1].d, $nonCommNet[-1].v, $commNet[-1].v)
  Start-Sleep -Milliseconds 300
}

# --- Schreiben --------------------------------------------------------------
$paket = [ordered]@{
  bereich = "Sentiment"
  erzeugt = (Get-Date).ToString("yyyy-MM-dd HH:mm")
  reihen  = $ergebnis
}

$json = $paket | ConvertTo-Json -Depth 10 -Compress
$inhalt = "window.SENTIMENT_DATEN = $json;"

$zielDatei = Join-Path $zielOrdner "sentiment.js"
[System.IO.File]::WriteAllText($zielDatei, $inhalt, (New-Object System.Text.UTF8Encoding($false)))

Write-Host ""
Write-Host ("Fertig. Datendatei geschrieben: {0}" -f $zielDatei)
Write-Host ("Reihen: {0}" -f $ergebnis.Count)
