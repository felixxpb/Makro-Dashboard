# Daten-Abrufen-Kalender.ps1
# Holt den Wirtschaftskalender der laufenden Woche und schreibt ihn in eine
# Datendatei, die die Startseite direkt einliest.
#
#   Quelle: Forex Factory, oeffentlicher JSON-Feed
#           https://nfs.faireconomy.media/ff_calendar_thisweek.json
#           kostenlos, kein Schluessel noetig
#
# Felder im Feed: title, country, date, impact, forecast, previous
# Ein "actual"-Feld (tatsaechlich veroeffentlichter Wert) liefert der Feed
# nicht - siehe 03_Doku/Datenquellen_Kalender.md Abschnitt 4.
#
# Gefiltert wird auf Felix' acht Waehrungen (Vorgabe 2026-09-25):
#   USD, EUR, GBP, JPY, AUD, CAD, CHF, NZD
#
# WICHTIG - Rate-Limit: Der Feed antwortet nach wenigen Abrufen kurz
# hintereinander mit HTTP 429. Das Skript darf deshalb NICHT haeufig laufen
# (Richtwert: hoechstens ein paar Mal am Tag). Schlaegt der Abruf fehl, bleibt
# die bestehende Datendatei unveraendert stehen, statt sie zu leeren.
#
# Aufruf:
#   powershell -NoProfile -ExecutionPolicy Bypass -File "Daten-Abrufen-Kalender.ps1"
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
$zielDatei = Join-Path $zielOrdner "kalender.js"

$ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36"
$feedUrl = "https://nfs.faireconomy.media/ff_calendar_thisweek.json"

# Felix' acht Waehrungen. Alles andere (CNY etc.) wird verworfen.
$waehrungen = @("USD", "EUR", "GBP", "JPY", "AUD", "CAD", "CHF", "NZD")

# --- Abruf mit Ruecksicht auf das Rate-Limit --------------------------------
# Bei 429 wird deutlich laenger gewartet als bei einem normalen Fehler.
function Hole-Feed([string]$uri) {
  $versuch = 0
  while ($true) {
    $versuch++
    try {
      return Invoke-WebRequest -Uri $uri -Headers @{ "User-Agent" = $ua } -TimeoutSec 30 -UseBasicParsing
    } catch {
      $istRateLimit = ($_.Exception.Message -match "429")
      if ($versuch -ge 3) { throw }
      $warten = if ($istRateLimit) { 60 * $versuch } else { 5 * $versuch }
      Write-Host ("  Versuch {0} fehlgeschlagen ({1}), warte {2} s ..." -f $versuch, $(if ($istRateLimit) { "Rate-Limit" } else { "Fehler" }), $warten)
      Start-Sleep -Seconds $warten
    }
  }
}

Write-Host "Hole Wirtschaftskalender (Forex Factory) ..." -NoNewline

try {
  $antwort = Hole-Feed $feedUrl
} catch {
  Write-Host ""
  Write-Host ("FEHLER: Abruf nicht moeglich - {0}" -f $_.Exception.Message)
  if (Test-Path $zielDatei) {
    Write-Host "Die bestehende Datendatei bleibt unveraendert stehen (alte Termine)."
    Write-Host ("Datei: {0}" -f $zielDatei)
    exit 0
  } else {
    Write-Host "Es gibt noch keine Datendatei. Bitte spaeter erneut versuchen."
    exit 1
  }
}

$roh = $antwort.Content

# Die Datumsangaben muessen als ORIGINALTEXT erhalten bleiben. ConvertFrom-Json
# wandelt ISO-Zeitstempel sonst in DateTime-Objekte um und rechnet sie dabei
# auf die Zeitzone dieses Rechners um - dann liesse sich spaeter nicht mehr
# erkennen, ob ein Termin ganztaegig war (Uhrzeit 00:00 in der Quellzeitzone).
# Deshalb die Rohtexte in Reihenfolge separat herausziehen.
$datumsTexte = [regex]::Matches($roh, '"date"\s*:\s*"([^"]+)"') | ForEach-Object { $_.Groups[1].Value }
$eintraege = $roh | ConvertFrom-Json

Write-Host (" {0} Eintraege gesamt" -f $eintraege.Count)

if ($datumsTexte.Count -ne $eintraege.Count) {
  throw ("Datumsanzahl ({0}) passt nicht zur Eintragsanzahl ({1}) - Feedaufbau hat sich geaendert." -f $datumsTexte.Count, $eintraege.Count)
}

# --- Aufbereiten -------------------------------------------------------------
function Leer([string]$wert) {
  if ($null -eq $wert) { return "" }
  $w = $wert.Trim()
  if ($w -eq "" -or $w -eq "N/A") { return "" }
  return $w
}

$termine = @()
$verworfen = 0

for ($i = 0; $i -lt $eintraege.Count; $i++) {
  $e = $eintraege[$i]
  $waehrung = ("" + $e.country).Trim().ToUpper()

  if ($waehrungen -notcontains $waehrung) { $verworfen++; continue }

  $datumText = $datumsTexte[$i]
  $impact = ("" + $e.impact).Trim()

  # Ganztaegig ueber das Impact-Feld erkennen, NICHT ueber die Uhrzeit.
  # Grund (beim Bau geprueft, 2026-09-25): Forex Factory stempelt ganztaegige
  # Eintraege wie "Bank Holiday" nicht auf Mitternacht, sondern auf den Beginn
  # des Kalendertags in britischer Zeit - im Feed steht dann z. B.
  # "2026-09-20T19:00:00-04:00" fuer einen Feiertag am Montag, dem 21.
  # Eine Uhrzeitpruefung wuerde also nie anschlagen und die Website wuerde
  # "01:00" statt "Ganztaegig" anzeigen.
  $ganztaegig = ($impact -eq "Holiday")

  $termine += [ordered]@{
    d          = $datumText
    waehrung   = $waehrung
    titel      = ("" + $e.title).Trim()
    impact     = $impact
    prognose   = Leer $e.forecast
    vorher     = Leer $e.previous
    ganztaegig = [bool]$ganztaegig
  }
}

Write-Host ("Behalten: {0} Termine ({1} andere Waehrungen verworfen)" -f $termine.Count, $verworfen)

if ($termine.Count -eq 0) {
  Write-Host "WARNUNG: Keine Termine fuer die acht Waehrungen gefunden."
  if (Test-Path $zielDatei) {
    Write-Host "Bestehende Datendatei bleibt stehen."
    exit 0
  }
}

# Uebersicht je Impact-Stufe
$eintraege | Out-Null
$stufen = $termine | Group-Object { $_.impact } | Sort-Object Name
foreach ($s in $stufen) { Write-Host ("  {0,-10} {1}" -f $s.Name, $s.Count) }

# --- Schreiben ---------------------------------------------------------------
$paket = [ordered]@{
  bereich     = "Kalender"
  erzeugt     = (Get-Date).ToString("yyyy-MM-dd HH:mm")
  quelle      = "Forex Factory"
  quelleUrl   = "https://www.forexfactory.com/calendar"
  waehrungen  = $waehrungen
  termine     = $termine
}

$json = $paket | ConvertTo-Json -Depth 10 -Compress
$inhalt = "window.KALENDER_DATEN = $json;"
[System.IO.File]::WriteAllText($zielDatei, $inhalt, (New-Object System.Text.UTF8Encoding($false)))

Write-Host ""
Write-Host ("Fertig. Datendatei geschrieben: {0}" -f $zielDatei)
