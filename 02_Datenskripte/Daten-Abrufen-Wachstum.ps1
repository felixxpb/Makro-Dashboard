# Daten-Abrufen-Wachstum.ps1
# Holt alle Reihen MIT voller Historie fuer den Themenbereich Wachstum und
# schreibt sie in eine Datendatei, die die Website direkt einliest.
#
#   FRED:      GDPNow, Real GDP, Durable Goods Orders, Shipments (fuer das
#              Order-to-Shipment Ratio), Baugenehmigungen, 30Y Mortgage Rate
#   OECD:      Composite Leading Indicator USA (offizielle OECD-Schnittstelle)
#   Uni Mich.: Index of Consumer Expectations (CSV-Datei mit voller Historie)
#
# Die Kennzahlen ohne Historie (ISM New Orders, Backlog, Services Business
# Activity, NFIB, Conference Board) holt Daten-Abrufen-Webquellen.ps1.
#
# Aufruf:
#   powershell -NoProfile -ExecutionPolicy Bypass -File "Daten-Abrufen-Wachstum.ps1"
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

# Antworttext immer als Text lesen (Invoke-WebRequest liefert bei CSV-Dateien
# teils ein Byte-Feld statt Text)
function Get-Text([string]$url) {
  $r = Invoke-WebRequest -Uri $url -UseBasicParsing -UserAgent $ua -TimeoutSec 60
  if ($r.Content -is [byte[]]) { return [Text.Encoding]::UTF8.GetString($r.Content) }
  return [string]$r.Content
}

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

# --- FRED -------------------------------------------------------------------
# AMDMVS hat keine eigene Kachel, wird nur fuer das Order-to-Shipment Ratio
# gebraucht.
$reihen = @(
  @{ id = "GDPNOW";          titel = "GDPNow" }
  @{ id = "A191RL1Q225SBEA"; titel = "Real GDP, QoQ annualisiert" }
  @{ id = "DGORDER";         titel = "Durable Goods Orders" }
  @{ id = "AMDMVS";          titel = "Durable Goods Shipments" }
  @{ id = "PERMIT";          titel = "Baugenehmigungen" }
  @{ id = "MORTGAGE30US";    titel = "30Y Fixed Mortgage Rate" }
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

# --- Order-to-Shipment Ratio (berechnet) ------------------------------------
# New Orders geteilt durch Shipments, nur fuer Monate, die in beiden Reihen
# vorkommen. Beide Reihen: Census M3 Survey, saisonbereinigt, Mio. USD.
Write-Host "Berechne Order-to-Shipment Ratio ..." -NoNewline
$shipments = @{}
foreach ($p in $ergebnis["AMDMVS"].punkte) { $shipments[$p.d] = $p.v }
$ratio = @()
foreach ($p in $ergebnis["DGORDER"].punkte) {
  if ($shipments.ContainsKey($p.d) -and $shipments[$p.d] -gt 0) {
    $ratio += [ordered]@{ d = $p.d; v = [math]::Round($p.v / $shipments[$p.d], 4) }
  }
}
$ergebnis["DG_ORDER_SHIP"] = [ordered]@{
  id           = "DG_ORDER_SHIP"
  titel        = "Order-to-Shipment Ratio, Durable Goods"
  frequenz     = "Monthly"
  aktualisiert = $ergebnis["DGORDER"].aktualisiert
  quelle       = "FRED, berechnet aus DGORDER / AMDMVS"
  quelleUrl    = "https://fred.stlouisfed.org/graph/?id=DGORDER,AMDMVS"
  punkte       = $ratio
}
Write-Host (" {0} Werte, zuletzt {1} = {2}" -f $ratio.Count, $ratio[-1].d, $ratio[-1].v)

# --- OECD Composite Leading Indicator ---------------------------------------
# Die FRED-Kopie (USALOLITONOSTSAM) endet im Januar 2024, deshalb direkt von
# der OECD. Variante: amplitude adjusted (AA), Basis 100 = langfristiger Trend.
Write-Host "Hole OECD CLI USA ..." -NoNewline
$oecdUrl = "https://sdmx.oecd.org/public/rest/data/OECD.SDD.STES,DSD_STES@DF_CLI,/USA.M.LI...AA...H?startPeriod=2015-01&dimensionAtObservation=AllDimensions&format=csvfile"
$oecdText = Get-Text $oecdUrl
$oecdZeilen = @($oecdText -split "`r?`n" | Where-Object { $_.Trim() -ne "" })
$kopf = $oecdZeilen[0] -split ','
$iZeit = [array]::IndexOf($kopf, "TIME_PERIOD")
$iWert = [array]::IndexOf($kopf, "OBS_VALUE")
if ($iZeit -lt 0 -or $iWert -lt 0) { throw "OECD CLI: Spalten TIME_PERIOD/OBS_VALUE nicht gefunden - Dateiaufbau geaendert?" }
$cliListe = @()
for ($i = 1; $i -lt $oecdZeilen.Count; $i++) {
  $f = $oecdZeilen[$i] -split ','
  if ($f.Count -le $iWert -or $f[$iWert] -eq "") { continue }
  $cliListe += [pscustomobject]@{ d = ($f[$iZeit] + "-01"); v = [double]::Parse($f[$iWert], [Globalization.CultureInfo]::InvariantCulture) }
}
$cliPunkte = @()
foreach ($p in ($cliListe | Sort-Object d)) { $cliPunkte += [ordered]@{ d = $p.d; v = [math]::Round($p.v, 3) } }
$ergebnis["OECD_CLI"] = [ordered]@{
  id           = "OECD_CLI"
  titel        = "OECD Composite Leading Indicator USA"
  frequenz     = "Monthly"
  aktualisiert = (Get-Date).ToString("yyyy-MM-dd")
  quelle       = "OECD"
  quelleUrl    = "https://www.oecd.org/en/data/indicators/composite-leading-indicator-cli.html"
  punkte       = $cliPunkte
}
Write-Host (" {0} Werte, zuletzt {1} = {2}" -f $cliPunkte.Count, $cliPunkte[-1].d, $cliPunkte[-1].v)

# --- University of Michigan: Index of Consumer Expectations -----------------
# CSV mit voller Historie: Month, YYYY, ICC (Current Conditions), ICE
# (Expectations). Enthaelt nur finale Monatswerte, die Vorablesung zur
# Monatsmitte erscheint erst mit der finalen Zahl am Monatsende.
Write-Host "Hole Michigan Consumer Expectations ..." -NoNewline
$michUrl = "https://www.sca.isr.umich.edu/files/tbmiccice.csv"
$michZeilen = @((Get-Text $michUrl) -split "`r?`n" | Where-Object { $_.Trim() -ne "" })
$michKopf = $michZeilen[0] -split ','
$iIce = [array]::IndexOf($michKopf, "ICE")
if ($iIce -lt 0) { throw "Michigan: Spalte ICE nicht gefunden - Dateiaufbau geaendert?" }
$monate = @("January","February","March","April","May","June","July","August","September","October","November","December")
$michPunkte = @()
for ($i = 1; $i -lt $michZeilen.Count; $i++) {
  $f = $michZeilen[$i] -split ','
  if ($f.Count -le $iIce -or $f[$iIce].Trim() -eq "") { continue }
  $mn = [array]::IndexOf($monate, $f[0].Trim()) + 1
  $jahr = [int]$f[1]
  if ($mn -eq 0 -or $jahr -lt 2015) { continue }
  $michPunkte += [ordered]@{ d = ("{0}-{1:D2}-01" -f $jahr, $mn); v = [double]::Parse($f[$iIce].Trim(), [Globalization.CultureInfo]::InvariantCulture) }
}
$ergebnis["MICH_ICE"] = [ordered]@{
  id           = "MICH_ICE"
  titel        = "Michigan Index of Consumer Expectations"
  frequenz     = "Monthly"
  aktualisiert = (Get-Date).ToString("yyyy-MM-dd")
  quelle       = "University of Michigan, Surveys of Consumers"
  quelleUrl    = "https://www.sca.isr.umich.edu/"
  punkte       = $michPunkte
}
Write-Host (" {0} Werte, zuletzt {1} = {2}" -f $michPunkte.Count, $michPunkte[-1].d, $michPunkte[-1].v)

# --- Schreiben --------------------------------------------------------------
$paket = [ordered]@{
  bereich = "Wachstum"
  erzeugt = (Get-Date).ToString("yyyy-MM-dd HH:mm")
  reihen  = $ergebnis
}

$json = $paket | ConvertTo-Json -Depth 10 -Compress
$inhalt = "window.WACHSTUM_DATEN = $json;"

$zielDatei = Join-Path $zielOrdner "wachstum.js"
[System.IO.File]::WriteAllText($zielDatei, $inhalt, (New-Object System.Text.UTF8Encoding($false)))

Write-Host ""
Write-Host ("Fertig. Datendatei geschrieben: {0}" -f $zielDatei)
Write-Host ("Reihen: {0}" -f $ergebnis.Count)
