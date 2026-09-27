# Daten-Abrufen-Zinsen.ps1
# Holt alle Reihen fuer den Themenbereich Zinsen und schreibt sie in eine
# Datendatei, die die Website direkt einliest.
#
#   Leitzinsen (8 Notenbanken), alle FRED:
#     FED   - DFEDTARU (Obergrenze) + DFEDTARL (Untergrenze), Mitte berechnet
#     EZB   - ECBDFR (Einlagensatz, der exakte operative Leitzins)
#     BoE   - IRSTCI01GBM156N (Naeherung: Interbank-Tagesgeldsatz, OECD)
#     BoJ   - IRSTCI01JPM156N (Naeherung: Interbank-Tagesgeldsatz, OECD)
#     RBA   - IRSTCI01AUM156N (Naeherung: Interbank-Tagesgeldsatz, OECD)
#     BoC   - IRSTCI01CAM156N (Naeherung: Interbank-Tagesgeldsatz, OECD)
#     SNB   - IR3TIB01CHM156N (Naeherung: 3-Monats-Interbankensatz, OECD -
#             der Tagesgeldsatz ist bei FRED seit 2024 eingestellt)
#     RBNZ  - IR3TIB01NZM156N (Naeherung: 3-Monats-Interbankensatz, OECD -
#             der Tagesgeldsatz ist bei FRED seit 2024 eingestellt)
#
#   Realrendite & Breakeven (USA), FRED:
#     DFII10 - Realrendite 10 Jahre (TIPS)
#     T10YIE - Breakeven-Inflation 10 Jahre
#
#   FED-Zinserwartung (Dot Plot), FRED, Sonderabschnitt (keine gewoehnliche
#   Kachel, siehe zinsen.html):
#     FEDTARMD   - FOMC Median-Projektion Fed Funds Rate je Zieljahr
#     FEDTARMDLR - FOMC Median-Projektion, langfristig
#
#   Zinsstrukturkurve (USA): NICHT hier abgerufen, sondern aus daten/regime.js
#   wiederverwendet (DGS2, DGS10, T10Y2Y), siehe bereiche/zinsen-kacheln.js.
#
# Details, Einordnung und alle Entscheidungen: 03_Doku/Datenquellen_Zinsen.md
#
# Aufruf:
#   powershell -NoProfile -ExecutionPolicy Bypass -File "Daten-Abrufen-Zinsen.ps1"
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
function Invoke-MitWiederholung([string]$uri, [int]$timeoutSec) {
  $versuch = 0
  while ($true) {
    $versuch++
    try { return Invoke-RestMethod -Uri $uri -TimeoutSec $timeoutSec }
    catch {
      if ($versuch -ge 3) { throw }
      Start-Sleep -Seconds (2 * $versuch)
    }
  }
}

function Hole-Fred([string]$id, [string]$titel, [string]$startDatum) {
  Write-Host ("Hole {0} ..." -f $id) -NoNewline
  $metaUrl = "https://api.stlouisfed.org/fred/series?series_id=$id&api_key=$key&file_type=json"
  $meta = (Invoke-MitWiederholung $metaUrl 30).seriess[0]

  $obsUrl = "https://api.stlouisfed.org/fred/series/observations?series_id=$id&api_key=$key&file_type=json&observation_start=$startDatum&sort_order=asc"
  $obs = (Invoke-MitWiederholung $obsUrl 60).observations

  $punkte = @()
  foreach ($o in $obs) {
    if ($o.value -eq ".") { continue }
    $punkte += [ordered]@{ d = $o.date; v = [double]$o.value }
  }

  if ($punkte.Count -gt 0) {
    Write-Host (" {0} Werte, zuletzt {1} = {2}" -f $punkte.Count, $punkte[-1].d, $punkte[-1].v)
  } else {
    Write-Host " 0 Werte"
  }

  return [ordered]@{
    id           = $id
    titel        = $titel
    fredTitel    = $meta.title
    frequenz     = $meta.frequency
    aktualisiert = $meta.last_updated
    quelle       = "FRED"
    quelleUrl    = "https://fred.stlouisfed.org/series/$id"
    punkte       = $punkte
  }
}

# --- Leitzinsen: einfache 1:1-FRED-Reihen -----------------------------------
$leitzinsReihen = @(
  @{ id = "ECBDFR";          titel = "EZB Leitzins (Einlagensatz)" }
  @{ id = "IRSTCI01GBM156N"; titel = "BoE Leitzins (Naeherung)" }
  @{ id = "IRSTCI01JPM156N"; titel = "BoJ Leitzins (Naeherung)" }
  @{ id = "IRSTCI01AUM156N"; titel = "RBA Leitzins (Naeherung)" }
  @{ id = "IRSTCI01CAM156N"; titel = "BoC Leitzins (Naeherung)" }
  @{ id = "IR3TIB01CHM156N"; titel = "SNB Leitzins (Naeherung)" }
  @{ id = "IR3TIB01NZM156N"; titel = "RBNZ Leitzins (Naeherung)" }
)
foreach ($r in $leitzinsReihen) {
  $ergebnis[$r.id] = Hole-Fred $r.id $r.titel $start
  Start-Sleep -Milliseconds 300
}

# --- FED Leitzins: Mitte aus Ober- und Untergrenze --------------------------
$oben = Hole-Fred "DFEDTARU" "FED Leitzins Obergrenze" $start
$unten = Hole-Fred "DFEDTARL" "FED Leitzins Untergrenze" $start
Start-Sleep -Milliseconds 300

Write-Host "Berechne FED-Leitzins (Mitte) ..." -NoNewline
$untenWerte = @{}
foreach ($p in $unten.punkte) { $untenWerte[$p.d] = $p.v }
$mitte = @()
foreach ($p in $oben.punkte) {
  if ($untenWerte.ContainsKey($p.d)) {
    $mitte += [ordered]@{ d = $p.d; v = [math]::Round((($p.v + $untenWerte[$p.d]) / 2), 3) }
  }
}
$ergebnis["FED_LEITZINS"] = [ordered]@{
  id           = "FED_LEITZINS"
  titel        = "FED Leitzins (Target Range Mitte)"
  fredTitel    = "Federal Funds Target Range, Mitte aus Ober- und Untergrenze"
  frequenz     = $oben.frequenz
  aktualisiert = $oben.aktualisiert
  quelle       = "FRED, berechnet"
  quelleUrl    = "https://fred.stlouisfed.org/series/DFEDTARU"
  punkte       = $mitte
}
Write-Host (" {0} Werte, zuletzt {1} = {2}" -f $mitte.Count, $mitte[-1].d, $mitte[-1].v)

# --- Realrendite & Breakeven (USA) ------------------------------------------
$ergebnis["DFII10"] = Hole-Fred "DFII10" "Realrendite (10 Jahre)" $start
Start-Sleep -Milliseconds 300
$ergebnis["T10YIE"] = Hole-Fred "T10YIE" "Breakeven-Inflation (10 Jahre)" $start
Start-Sleep -Milliseconds 300

# --- FED-Zinserwartung (Dot Plot), Sonderabschnitt --------------------------
# FEDTARMD ist keine gewoehnliche Zeitreihe: pro Beobachtungsdatum (Jahresanfang
# des Zieljahres) steht der aktuelle FOMC-Median fuer GENAU dieses Zieljahr.
# Bei jeder neuen SEP-Veroeffentlichung (Maerz/Juni/September/Dezember) werden
# die Werte fuer die noch offenen Zieljahre ueberschrieben, alte Zieljahre
# verschwinden (Wert "."). Deshalb hier NICHT als Kachel mit Verlaufsgraph,
# sondern als eigene kleine Tabelle in zinsen.html (wie die
# Regime-Klassifikation in regime.html).
Write-Host "Hole FEDTARMD (FOMC Dot Plot, Median) ..." -NoNewline
$dotUrl = "https://api.stlouisfed.org/fred/series/observations?series_id=FEDTARMD&api_key=$key&file_type=json&sort_order=asc"
$dotObs = (Invoke-MitWiederholung $dotUrl 30).observations
$dotMeta = (Invoke-MitWiederholung "https://api.stlouisfed.org/fred/series?series_id=FEDTARMD&api_key=$key&file_type=json" 30).seriess[0]
$ziele = @()
foreach ($o in $dotObs) {
  if ($o.value -eq ".") { continue }
  $jahr = ([DateTime]::Parse($o.date)).Year
  $ziele += [ordered]@{ jahr = $jahr; wert = [double]$o.value }
}
Write-Host (" {0} Zieljahre" -f $ziele.Count)
Start-Sleep -Milliseconds 300

Write-Host "Hole FEDTARMDLR (FOMC Dot Plot, langfristig) ..." -NoNewline
$lrUrl = "https://api.stlouisfed.org/fred/series/observations?series_id=FEDTARMDLR&api_key=$key&file_type=json&sort_order=desc&limit=1"
$lrObs = (Invoke-MitWiederholung $lrUrl 30).observations
$langfristig = $null
if ($lrObs.Count -gt 0 -and $lrObs[0].value -ne ".") { $langfristig = [double]$lrObs[0].value }
Write-Host (" {0}" -f $langfristig)

$dotplot = [ordered]@{
  rundeDatum   = $dotMeta.last_updated
  ziele        = $ziele
  langfristig  = $langfristig
  quelle       = "FRED"
  quelleUrl    = "https://fred.stlouisfed.org/series/FEDTARMD"
  hinweis      = "FOMC Summary of Economic Projections, oeffentlich vierteljaehrlich veroeffentlicht (Maerz/Juni/September/Dezember)."
}

# --- Schreiben ---------------------------------------------------------------
$paket = [ordered]@{
  bereich = "Zinsen"
  erzeugt = (Get-Date).ToString("yyyy-MM-dd HH:mm")
  reihen  = $ergebnis
  dotplot = $dotplot
}

$json = $paket | ConvertTo-Json -Depth 10 -Compress
$inhalt = "window.ZINSEN_DATEN = $json;"

$zielDatei = Join-Path $zielOrdner "zinsen.js"
[System.IO.File]::WriteAllText($zielDatei, $inhalt, (New-Object System.Text.UTF8Encoding($false)))

Write-Host ""
Write-Host ("Fertig. Datendatei geschrieben: {0}" -f $zielDatei)
Write-Host ("Reihen: {0}" -f $ergebnis.Count)
