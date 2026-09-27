# Daten-Abrufen-Webquellen.ps1
# Holt alle Kennzahlen, fuer die es keine kostenlose API gibt, ueber mehrere
# Themenbereiche hinweg:
#   Arbeitsmarkt:  ISM Manufacturing/Services Employment, Challenger Job Cuts,
#                  Average Hourly Earnings (MoM %)
#   Inflation:     ISM Manufacturing/Services Prices, Global Supply Chain
#                  Pressure Index (GSCPI)
#   Wachstum:      ISM Manufacturing New Orders + Backlog of Orders, ISM
#                  Services Business Activity, NFIB, Conference Board
#                  Consumer Confidence
#
# Vorgehen ISM/Challenger: Die Seiten enthalten mehrere Werte, teils veraltet.
# Das Skript sammelt ALLE gefundenen Werte mit ihrem Berichtsmonat ein und
# nimmt den juengsten. Damit ist die Formulierung auf der Seite egal.
# Fuer diese Reihen gibt es keine kostenlose Historie - das Dashboard baut sich
# seine eigene auf, Monat fuer Monat, in webquellen-verlauf.json.
#
# Vorgehen GSCPI: Anders als ISM/Challenger liefert die New York Fed die
# KOMPLETTE Historie seit September 1997 bei jedem Abruf. Diese Reihe braucht
# deshalb keine eigene Verlaufsdatei - die volle Historie kommt jedes Mal
# frisch aus der Quelle. Gelesen wird die CSV-Datei, die die Interaktivgrafik
# der New York Fed selbst verwendet (Details bei Get-GscpiPunkte weiter unten).
# Bis zum 2026-09-25 lief das ueber eine .xls-Datei und Excel-COM, brauchte
# also ein installiertes Excel. Seit dem 2026-09-26 nicht mehr - das war die
# Voraussetzung fuer den automatischen Abruf per GitHub Actions.
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
$verlaufOrdner = Join-Path $skriptOrdner "verlauf"
foreach ($o in @($zielOrdner, $verlaufOrdner)) {
  if (-not (Test-Path $o)) { New-Item -ItemType Directory -Force -Path $o | Out-Null }
}

$ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36"

# --- Hilfsfunktionen --------------------------------------------------------

# Editierdistanz, damit auch Tippfehler auf der Quellseite erkannt werden
# (die ISM-Seite schreibt zeitweise "Agust" statt "August").
function Get-Editierdistanz([string]$a, [string]$b) {
  # Bewusst mit zwei eindimensionalen Feldern statt einer Matrix:
  # Windows PowerShell 5.1 kann Ausdruecke als Index eines zweidimensionalen
  # Feldes nicht zuverlaessig lesen.
  $a = $a.ToLower(); $b = $b.ToLower()
  $n = $a.Length; $m = $b.Length
  if ($n -eq 0) { return $m }
  if ($m -eq 0) { return $n }

  $vorher = New-Object 'int[]' ($m + 1)
  $aktuell = New-Object 'int[]' ($m + 1)
  for ($j = 0; $j -le $m; $j++) { $vorher[$j] = $j }

  for ($i = 1; $i -le $n; $i++) {
    $aktuell[0] = $i
    for ($j = 1; $j -le $m; $j++) {
      $kosten = 1
      if ($a[$i - 1] -eq $b[$j - 1]) { $kosten = 0 }
      $loeschen  = $vorher[$j] + 1
      $einfuegen = $aktuell[$j - 1] + 1
      $ersetzen  = $vorher[$j - 1] + $kosten
      $kleinster = $loeschen
      if ($einfuegen -lt $kleinster) { $kleinster = $einfuegen }
      if ($ersetzen -lt $kleinster) { $kleinster = $ersetzen }
      $aktuell[$j] = $kleinster
    }
    for ($j = 0; $j -le $m; $j++) { $vorher[$j] = $aktuell[$j] }
  }
  return $vorher[$m]
}

$monate = @("January","February","March","April","May","June","July","August","September","October","November","December")

# Wandelt einen Monatsnamen in eine Nummer, Tippfehler bis Distanz 1 erlaubt.
function Get-Monatsnummer([string]$name) {
  for ($i = 0; $i -lt 12; $i++) {
    if ($monate[$i].ToLower() -eq $name.ToLower()) { return $i + 1 }
  }
  for ($i = 0; $i -lt 12; $i++) {
    if ((Get-Editierdistanz $monate[$i] $name) -le 1) { return $i + 1 }
  }
  return 0
}

function Get-SeitenText([string]$url) {
  $r = Invoke-WebRequest -Uri $url -UseBasicParsing -UserAgent $ua -TimeoutSec 30
  return ($r.Content -replace '<[^>]+>', ' ' -replace '&nbsp;', ' ' -replace '&#8217;', "'" -replace '&amp;', '&' -replace '\s+', ' ')
}

# --- ISM-Seiten -------------------------------------------------------------

function Get-IsmWert([string]$url, [string]$titel) {
  $txt = Get-SeitenText $url
  $jetzt = Get-Date

  # Alle Vorkommen "<Zahl> points in <Monat> [of] [Jahr]" einsammeln
  $treffer = [regex]::Matches($txt, '([\d]+\.?[\d]*)\s*points\s+in\s+([A-Za-z]+)(?:\s+of)?\s*(\d{4})?')

  $kandidaten = @()
  foreach ($t in $treffer) {
    $mn = Get-Monatsnummer $t.Groups[2].Value
    if ($mn -eq 0) { continue }
    $jahr = if ($t.Groups[3].Success) { [int]$t.Groups[3].Value } else { $jetzt.Year }
    # Ohne Jahresangabe: ein Monat nach dem aktuellen gehoert zum Vorjahr
    # (Dezember-Wert, der im Januar erscheint)
    if (-not $t.Groups[3].Success -and $mn -gt ($jetzt.Month + 1)) { $jahr = $jahr - 1 }
    # Werte aus der Zukunft oder aus grauer Vorzeit ausschliessen
    $stand = Get-Date -Year $jahr -Month $mn -Day 1
    if ($stand -gt $jetzt.AddMonths(1)) { continue }
    if ($jahr -lt ($jetzt.Year - 2)) { continue }
    $kandidaten += [pscustomobject]@{
      wert  = [double]$t.Groups[1].Value
      monat = $mn
      jahr  = $jahr
      stand = $stand
    }
  }

  if ($kandidaten.Count -eq 0) { throw "$titel : kein Wert auf der Seite gefunden." }

  $neuester = $kandidaten | Sort-Object stand -Descending | Select-Object -First 1
  $abweichend = ($kandidaten | Where-Object { $_.stand -eq $neuester.stand -and $_.wert -ne $neuester.wert }).Count -gt 0

  $ergebnisWert = [ordered]@{
    titel        = $titel
    wert         = $neuester.wert
    monat        = $neuester.monat
    jahr         = $neuester.jahr
    stand        = $neuester.stand.ToString("yyyy-MM-01")
    unsicher     = $abweichend
    kandidaten   = $kandidaten.Count
    quelle       = "TradingEconomics"
    quelleUrl    = $url
    abgerufen    = $jetzt.ToString("yyyy-MM-dd HH:mm")
  }

  # Vormonat aus dem Einleitungssatz: "... to 53.70 points in August from
  # 56.70 points in July of 2026". Wird nur genutzt, um einen fehlenden
  # Vormonat im Verlauf nachzutragen - vorhandene Werte werden nie ueberschrieben.
  $satz = [regex]::Match($txt, 'to\s+([\d]+\.?[\d]*)\s*points\s+in\s+([A-Za-z]+)\s+from\s+([\d]+\.?[\d]*)\s*points\s+in\s+([A-Za-z]+)')
  if ($satz.Success -and (Get-Monatsnummer $satz.Groups[2].Value) -eq $neuester.monat -and [double]$satz.Groups[1].Value -eq $neuester.wert) {
    $vmn = Get-Monatsnummer $satz.Groups[4].Value
    if ($vmn -gt 0) {
      $vorStand = $neuester.stand.AddMonths(-1)
      if ($vorStand.Month -eq $vmn) {
        $ergebnisWert["vorwertStand"] = $vorStand.ToString("yyyy-MM-01")
        $ergebnisWert["vorwert"] = [double]$satz.Groups[3].Value
      }
    }
  }

  return $ergebnisWert
}

# --- Conference Board Consumer Confidence -----------------------------------
# Die Themenseite hat eine feste Adresse und enthaelt immer den Text der
# neuesten Pressemitteilung, z.B. "Consumer Confidence Index decreased by 0.8
# points to 89.4 (1985=100) in August, down from 90.2 in July."

function Get-ConferenceBoardWert() {
  $jetzt = Get-Date
  $url = "https://www.conference-board.org/topics/consumer-confidence/"
  $txt = (Get-SeitenText $url) -replace '&reg;', '' -replace '&#174;', '' -replace '®', ''
  $m = [regex]::Match($txt, 'Consumer Confidence Index\s.{0,80}?\s([\d]+\.?[\d]*)\s*\(1985=100\)\s*in\s+([A-Za-z]+)(?:[^()]{0,40}?from\s+(?:an?\s+)?(?:[a-z]+\s+){0,3}([\d]+\.?[\d]*)\s+in\s+([A-Za-z]+))?')
  if (-not $m.Success) { throw "Conference Board: Wert im Seitentext nicht gefunden. URL: $url" }

  $mn = Get-Monatsnummer $m.Groups[2].Value
  if ($mn -eq 0) { throw "Conference Board: Monat nicht erkannt: $($m.Groups[2].Value)" }
  $jahr = $jetzt.Year
  if ($mn -gt $jetzt.Month) { $jahr = $jahr - 1 }
  $stand = Get-Date -Year $jahr -Month $mn -Day 1

  $ergebnisWert = [ordered]@{
    titel     = "Consumer Confidence Index"
    wert      = [double]$m.Groups[1].Value
    monat     = $mn
    jahr      = $jahr
    stand     = $stand.ToString("yyyy-MM-01")
    unsicher  = $false
    quelle    = "The Conference Board"
    quelleUrl = $url
    abgerufen = $jetzt.ToString("yyyy-MM-dd HH:mm")
  }
  if ($m.Groups[3].Success -and (Get-Monatsnummer $m.Groups[4].Value) -eq $stand.AddMonths(-1).Month) {
    $ergebnisWert["vorwertStand"] = $stand.AddMonths(-1).ToString("yyyy-MM-01")
    $ergebnisWert["vorwert"] = [double]$m.Groups[3].Value
  }
  return $ergebnisWert
}

# --- Challenger -------------------------------------------------------------

function Get-ChallengerWert() {
  $jetzt = Get-Date
  $uebersicht = "https://www.challengergray.com/blog/category/job-cuts-report/"
  $r = Invoke-WebRequest -Uri $uebersicht -UseBasicParsing -UserAgent $ua -TimeoutSec 30
  $links = [regex]::Matches($r.Content, 'href="(https://www\.challengergray\.com/blog/challenger-report-[^"]+)"')
  if ($links.Count -eq 0) { throw "Challenger: kein Bericht auf der Uebersichtsseite gefunden." }
  $berichtUrl = $links[0].Groups[1].Value

  $txt = Get-SeitenText $berichtUrl
  $m = [regex]::Match($txt, 'announced\s+([\d,]+)\s+job\s+cuts\s+in\s+([A-Za-z]+)[^.]*?(up|down)\s+([\d\.]+)%\s+from\s+the\s+([\d,]+)')
  if (-not $m.Success) { throw "Challenger: Zahlen im Bericht nicht gefunden. URL: $berichtUrl" }

  $mn = Get-Monatsnummer $m.Groups[2].Value
  if ($mn -eq 0) { throw "Challenger: Monat nicht erkannt: $($m.Groups[2].Value)" }
  # Bericht erscheint im Folgemonat: Dezember-Bericht im Januar
  $jahr = $jetzt.Year
  if ($mn -gt $jetzt.Month) { $jahr = $jahr - 1 }

  $wert = [double]($m.Groups[1].Value -replace ',', '')
  $vormonat = [double]($m.Groups[5].Value -replace ',', '')
  $vz = if ($m.Groups[3].Value -eq "down") { -1 } else { 1 }

  return [ordered]@{
    titel        = "Challenger Job Cuts"
    wert         = $wert
    vormonat     = $vormonat
    veraenderung = $vz * [double]$m.Groups[4].Value
    monat        = $mn
    jahr         = $jahr
    stand        = (Get-Date -Year $jahr -Month $mn -Day 1).ToString("yyyy-MM-01")
    unsicher     = $false
    quelle       = "Challenger, Gray & Christmas"
    quelleUrl    = $berichtUrl
    abgerufen    = $jetzt.ToString("yyyy-MM-dd HH:mm")
  }
}

# --- Average Hourly Earnings (AHE) -------------------------------------------
# TradingEconomics-Seite zeigt als Hauptwert die monatliche Veraenderungsrate
# (MoM %), nicht den Dollarbetrag - Seitentitel "United States Average Hourly
# Earnings MoM". Gleiches Muster wie Get-IsmWert (alle Kandidaten "X percent
# in Monat" einsammeln, juengsten nehmen), nur mit "percent" statt "points".
# Vormonat kommt aus einem eigenen Satzmuster, da der Einleitungssatz anders
# aufgebaut ist als bei den ISM-Seiten ("... to $37.75 in August 2026,
# following an upwardly revised 0.2% gain in July").

function Get-AheWert([string]$url) {
  $titel = "Average Hourly Earnings"
  $txt = Get-SeitenText $url
  $jetzt = Get-Date

  $treffer = [regex]::Matches($txt, '([\d]+\.?[\d]*)\s*percent\s+in\s+([A-Za-z]+)(?:\s+of)?\s*(\d{4})?')

  $kandidaten = @()
  foreach ($t in $treffer) {
    $mn = Get-Monatsnummer $t.Groups[2].Value
    if ($mn -eq 0) { continue }
    $jahr = if ($t.Groups[3].Success) { [int]$t.Groups[3].Value } else { $jetzt.Year }
    if (-not $t.Groups[3].Success -and $mn -gt ($jetzt.Month + 1)) { $jahr = $jahr - 1 }
    $stand = Get-Date -Year $jahr -Month $mn -Day 1
    if ($stand -gt $jetzt.AddMonths(1)) { continue }
    if ($jahr -lt ($jetzt.Year - 2)) { continue }
    $kandidaten += [pscustomobject]@{
      wert  = [double]$t.Groups[1].Value
      monat = $mn
      jahr  = $jahr
      stand = $stand
    }
  }

  if ($kandidaten.Count -eq 0) { throw "$titel : kein Wert auf der Seite gefunden." }

  $neuester = $kandidaten | Sort-Object stand -Descending | Select-Object -First 1
  $abweichend = ($kandidaten | Where-Object { $_.stand -eq $neuester.stand -and $_.wert -ne $neuester.wert }).Count -gt 0

  $ergebnisWert = [ordered]@{
    titel        = $titel
    wert         = $neuester.wert
    monat        = $neuester.monat
    jahr         = $neuester.jahr
    stand        = $neuester.stand.ToString("yyyy-MM-01")
    unsicher     = $abweichend
    kandidaten   = $kandidaten.Count
    quelle       = "TradingEconomics"
    quelleUrl    = $url
    abgerufen    = $jetzt.ToString("yyyy-MM-dd HH:mm")
  }

  # Vormonat aus dem Einleitungssatz, eigenes Muster (nicht das der ISM-Seiten):
  # "... or 0.3% over a month to $37.75 in August 2026, following an upwardly
  # revised 0.2% gain in July". Nur genutzt, um einen fehlenden Vormonat im
  # Verlauf nachzutragen - vorhandene Werte werden nie ueberschrieben.
  $satz = [regex]::Match($txt, 'or\s+([\d]+\.?[\d]*)%\s+over\s+a\s+month\s+to\s+\$[\d,.]+\s+in\s+([A-Za-z]+)\s+(\d{4}),\s+following\s+an?(?:\s+\w+ly)?\s*revised\s+([\d]+\.?[\d]*)%\s+(?:gain|increase|decline|loss|drop)\s+in\s+([A-Za-z]+)')
  if ($satz.Success -and (Get-Monatsnummer $satz.Groups[2].Value) -eq $neuester.monat -and [double]$satz.Groups[1].Value -eq $neuester.wert) {
    $vmn = Get-Monatsnummer $satz.Groups[5].Value
    if ($vmn -gt 0) {
      $vorStand = $neuester.stand.AddMonths(-1)
      if ($vorStand.Month -eq $vmn) {
        $ergebnisWert["vorwertStand"] = $vorStand.ToString("yyyy-MM-01")
        $ergebnisWert["vorwert"] = [double]$satz.Groups[4].Value
      }
    }
  }

  return $ergebnisWert
}

# --- Global Supply Chain Pressure Index (GSCPI) ------------------------------
# Quelle ist die CSV-Datei, die die Interaktivgrafik der New York Fed selbst
# laedt. Sie enthaelt die komplette Historie seit September 1997.
#
# Aufbau der Datei (Revisionsmatrix):
#   Zeile 1  = Kopfzeile, ab Spalte 2 je ein Veroeffentlichungsstand
#              ("Jan-22", "Feb-22", ... bis zum aktuellen Monat)
#   Zeile 2+ = je ein Monat ("30-Sep-1997"), danach der GSCPI-Wert, wie er im
#              jeweiligen Stand veroeffentlicht war
# Die LETZTE Spalte ist der aktuellste Stand - genau die wird gelesen.
#
# WICHTIG - Umstellung am 2026-09-26: Frueher lief das ueber die .xls-Datei und
# Excel-COM-Automatisierung. Das funktioniert nur auf einem PC mit installiertem
# Excel und haette die Automatisierung per GitHub Actions unmoeglich gemacht
# (auf den Servern dort ist kein Excel vorhanden). Die .xls ist echtes
# OLE2-Binaerformat und ohne Excel nicht lesbar; als .csv oder .xlsx liefert
# der Server dieselbe Binaerdatei, das half also nicht weiter.
# Gegengeprueft: 344 gemeinsame Monate, KEINE einzige Abweichung ueber 0,005
# gegenueber der bisherigen Excel-Variante. Die CSV hat sogar vier Monate mehr
# Historie (ab Sep 1997 statt Jan 1998). Einziger Unterschied: die CSV ist auf
# zwei Nachkommastellen gerundet, was bei einer Anzeige mit einer
# Nachkommastelle nicht ins Gewicht faellt.

function Get-GscpiPunkte() {
  $url = "https://www.newyorkfed.org/medialibrary/research/interactives/data/gscpi/gscpi_interactive_data.csv"
  $inhalt = (Invoke-WebRequest -Uri $url -Headers @{ "User-Agent" = $ua } -UseBasicParsing -TimeoutSec 60).Content

  $zeilen = $inhalt -split "`r?`n" | Where-Object { $_.Trim() -ne "" }
  if ($zeilen.Count -lt 2) { throw "GSCPI-CSV ist leer oder unerwartet aufgebaut." }

  $kopf = $zeilen[0] -split ','
  $letzteSpalte = $kopf.Count - 1
  if ($letzteSpalte -lt 1) { throw "GSCPI-CSV hat keine Datenspalten." }

  $punkte = @()
  foreach ($z in $zeilen[1..($zeilen.Count - 1)]) {
    $teile = $z -split ','
    if ($teile.Count -le $letzteSpalte) { continue }
    $wertRoh = $teile[$letzteSpalte]
    if ([string]::IsNullOrWhiteSpace($wertRoh)) { continue }
    $datum = [DateTime]::ParseExact($teile[0].Trim(), "d-MMM-yyyy", [Globalization.CultureInfo]::InvariantCulture)
    $punkte += [ordered]@{ d = $datum.ToString("yyyy-MM-01"); v = [double]$wertRoh }
  }

  if ($punkte.Count -lt 100) { throw ("GSCPI: nur {0} Werte gelesen, das sieht nach einem Formatwechsel aus." -f $punkte.Count) }
  return $punkte
}

# --- Abruf ------------------------------------------------------------------

$ergebnis = [ordered]@{}
# Reihen ohne eigene Historie: bauen sich ueber webquellen-verlauf.json auf.
$ohneHistorie = @("ISM_MFG_EMP", "ISM_SVC_EMP", "ISM_MFG_PRICE", "ISM_SVC_PRICE", "CHALLENGER",
                  "ISM_MFG_NO", "ISM_MFG_BACKLOG", "ISM_SVC_BUSACT", "NFIB", "CB_CCI", "AHE")
$warnungen = @()

Write-Host "Hole ISM Manufacturing Employment ..." -NoNewline
$ergebnis["ISM_MFG_EMP"] = Get-IsmWert "https://tradingeconomics.com/united-states/ism-manufacturing-employment" "ISM Manufacturing Employment"
Write-Host (" {0} ({1}/{2}){3}" -f $ergebnis["ISM_MFG_EMP"].wert, $ergebnis["ISM_MFG_EMP"].monat, $ergebnis["ISM_MFG_EMP"].jahr, $(if ($ergebnis["ISM_MFG_EMP"].unsicher) { " ACHTUNG: widerspruechliche Werte" } else { "" }))

Write-Host "Hole ISM Services Employment ..." -NoNewline
$ergebnis["ISM_SVC_EMP"] = Get-IsmWert "https://tradingeconomics.com/united-states/ism-non-manufacturing-employment" "ISM Services Employment"
Write-Host (" {0} ({1}/{2}){3}" -f $ergebnis["ISM_SVC_EMP"].wert, $ergebnis["ISM_SVC_EMP"].monat, $ergebnis["ISM_SVC_EMP"].jahr, $(if ($ergebnis["ISM_SVC_EMP"].unsicher) { " ACHTUNG: widerspruechliche Werte" } else { "" }))

Write-Host "Hole Challenger Job Cuts ..." -NoNewline
$ergebnis["CHALLENGER"] = Get-ChallengerWert
Write-Host (" {0} ({1}/{2})" -f $ergebnis["CHALLENGER"].wert, $ergebnis["CHALLENGER"].monat, $ergebnis["CHALLENGER"].jahr)

Write-Host "Hole ISM Manufacturing Prices ..." -NoNewline
$ergebnis["ISM_MFG_PRICE"] = Get-IsmWert "https://tradingeconomics.com/united-states/ism-manufacturing-prices" "ISM Manufacturing Prices"
Write-Host (" {0} ({1}/{2}){3}" -f $ergebnis["ISM_MFG_PRICE"].wert, $ergebnis["ISM_MFG_PRICE"].monat, $ergebnis["ISM_MFG_PRICE"].jahr, $(if ($ergebnis["ISM_MFG_PRICE"].unsicher) { " ACHTUNG: widerspruechliche Werte" } else { "" }))

Write-Host "Hole ISM Services Prices ..." -NoNewline
$ergebnis["ISM_SVC_PRICE"] = Get-IsmWert "https://tradingeconomics.com/united-states/ism-non-manufacturing-prices" "ISM Services Prices"
Write-Host (" {0} ({1}/{2}){3}" -f $ergebnis["ISM_SVC_PRICE"].wert, $ergebnis["ISM_SVC_PRICE"].monat, $ergebnis["ISM_SVC_PRICE"].jahr, $(if ($ergebnis["ISM_SVC_PRICE"].unsicher) { " ACHTUNG: widerspruechliche Werte" } else { "" }))

Write-Host "Hole Average Hourly Earnings ..." -NoNewline
try {
  $ergebnis["AHE"] = Get-AheWert "https://tradingeconomics.com/united-states/average-hourly-earnings"
  Write-Host (" {0} ({1}/{2}){3}" -f $ergebnis["AHE"].wert, $ergebnis["AHE"].monat, $ergebnis["AHE"].jahr, $(if ($ergebnis["AHE"].unsicher) { " ACHTUNG: widerspruechliche Werte" } else { "" }))
} catch {
  Write-Host " FEHLER"
  $warnungen += ("Average Hourly Earnings: {0}" -f $_.Exception.Message)
}

Write-Host "Hole Global Supply Chain Pressure Index ..." -NoNewline
$gscpiPunkte = Get-GscpiPunkte
$gscpiLetzter = $gscpiPunkte[$gscpiPunkte.Count - 1]
$ergebnis["GSCPI"] = [ordered]@{
  titel      = "Global Supply Chain Pressure Index"
  wert       = $gscpiLetzter.v
  monat      = [int]$gscpiLetzter.d.Substring(5, 2)
  jahr       = [int]$gscpiLetzter.d.Substring(0, 4)
  stand      = $gscpiLetzter.d
  unsicher   = $false
  quelle     = "Federal Reserve Bank of New York"
  quelleUrl  = "https://www.newyorkfed.org/research/policy/gscpi"
  abgerufen  = (Get-Date).ToString("yyyy-MM-dd HH:mm")
  punkte     = $gscpiPunkte
}
Write-Host (" {0} ({1} Monatswerte seit {2})" -f $gscpiLetzter.v, $gscpiPunkte.Count, $gscpiPunkte[0].d)

# --- Wachstum ---------------------------------------------------------------
# Anders als oben mit Fehlerabfang: Faellt eine dieser Quellen aus, laufen
# Arbeitsmarkt und Inflation trotzdem durch. Die Kachel zeigt dann den letzten
# gespeicherten Wert aus dem Verlauf (siehe unten).

$wachstumTe = @(
  @{ id = "ISM_MFG_NO";      titel = "ISM Manufacturing New Orders";      url = "https://tradingeconomics.com/united-states/ism-manufacturing-new-orders" }
  @{ id = "ISM_MFG_BACKLOG"; titel = "ISM Manufacturing Backlog of Orders"; url = "https://tradingeconomics.com/united-states/ism-manufacturing-backlog-of-orders" }
  @{ id = "ISM_SVC_BUSACT";  titel = "ISM Services Business Activity";    url = "https://tradingeconomics.com/united-states/ism-non-manufacturing-business-activity" }
  @{ id = "NFIB";            titel = "NFIB Small Business Optimism";      url = "https://tradingeconomics.com/united-states/nfib-business-optimism-index" }
)
foreach ($w in $wachstumTe) {
  Write-Host ("Hole {0} ..." -f $w.titel) -NoNewline
  try {
    $ergebnis[$w.id] = Get-IsmWert $w.url $w.titel
    Write-Host (" {0} ({1}/{2}){3}" -f $ergebnis[$w.id].wert, $ergebnis[$w.id].monat, $ergebnis[$w.id].jahr, $(if ($ergebnis[$w.id].unsicher) { " ACHTUNG: widerspruechliche Werte" } else { "" }))
  } catch {
    Write-Host " FEHLER"
    $warnungen += ("{0}: {1}" -f $w.titel, $_.Exception.Message)
  }
  Start-Sleep -Milliseconds 800
}

Write-Host "Hole Conference Board Consumer Confidence ..." -NoNewline
try {
  $ergebnis["CB_CCI"] = Get-ConferenceBoardWert
  Write-Host (" {0} ({1}/{2})" -f $ergebnis["CB_CCI"].wert, $ergebnis["CB_CCI"].monat, $ergebnis["CB_CCI"].jahr)
} catch {
  Write-Host " FEHLER"
  $warnungen += ("Conference Board: {0}" -f $_.Exception.Message)
}

# --- Verlauf fortschreiben (nur Reihen ohne eigene Historie) ----------------
# Jeder Monatswert wird einmal gespeichert. Erneutes Ausfuehren im selben Monat
# aktualisiert den Eintrag, legt aber keinen zweiten an.

$verlaufDatei = Join-Path $verlaufOrdner "webquellen-verlauf.json"
$verlauf = @{}
if (Test-Path $verlaufDatei) {
  $roh = Get-Content $verlaufDatei -Raw -Encoding UTF8 | ConvertFrom-Json
  foreach ($p in $roh.PSObject.Properties) {
    $liste = @{}
    foreach ($e in $p.Value.PSObject.Properties) { $liste[$e.Name] = $e.Value }
    $verlauf[$p.Name] = $liste
  }
}

foreach ($k in $ohneHistorie) {
  if (-not $ergebnis.Contains($k)) { continue }
  if (-not $verlauf.ContainsKey($k)) { $verlauf[$k] = @{} }
  $verlauf[$k][$ergebnis[$k].stand] = $ergebnis[$k].wert
  # Fehlenden Vormonat aus dem Seitentext nachtragen, nie ueberschreiben
  if ($ergebnis[$k].Contains("vorwertStand") -and -not $verlauf[$k].ContainsKey($ergebnis[$k].vorwertStand)) {
    $verlauf[$k][$ergebnis[$k].vorwertStand] = $ergebnis[$k].vorwert
  }
}

($verlauf | ConvertTo-Json -Depth 10) | Out-File -FilePath $verlaufDatei -Encoding utf8

# Verlauf in die Ergebnisse einhaengen, aufsteigend sortiert (GSCPI hat seine
# Historie schon direkt aus der Excel-Datei und wird hier nicht angefasst).
# Ist eine Quelle ausgefallen, wird der Eintrag aus dem Verlauf aufgebaut,
# damit die Kachel den letzten bekannten Wert zeigt statt "keine Daten".
foreach ($k in $ohneHistorie) {
  if (-not $verlauf.ContainsKey($k)) { continue }
  $punkte = @()
  foreach ($d in ($verlauf[$k].Keys | Sort-Object)) {
    $punkte += [ordered]@{ d = $d; v = $verlauf[$k][$d] }
  }
  if (-not $ergebnis.Contains($k)) {
    $ergebnis[$k] = [ordered]@{
      titel     = $k
      wert      = $punkte[-1].v
      stand     = $punkte[-1].d
      unsicher  = $true
      quelle    = "letzter gespeicherter Wert (Abruf fehlgeschlagen)"
      abgerufen = (Get-Date).ToString("yyyy-MM-dd HH:mm")
    }
  }
  $ergebnis[$k]["punkte"] = $punkte
}

# --- Schreiben --------------------------------------------------------------
$paket = [ordered]@{
  bereich = "Webquellen (Arbeitsmarkt, Inflation, Wachstum)"
  erzeugt = (Get-Date).ToString("yyyy-MM-dd HH:mm")
  reihen  = $ergebnis
}

$json = $paket | ConvertTo-Json -Depth 10 -Compress
$inhalt = "window.WEBQUELLEN_DATEN = $json;"
$zielDatei = Join-Path $zielOrdner "webquellen.js"
[System.IO.File]::WriteAllText($zielDatei, $inhalt, (New-Object System.Text.UTF8Encoding($false)))

Write-Host ""
Write-Host ("Fertig. Datendatei geschrieben: {0}" -f $zielDatei)
Write-Host ("Verlaufsdatei: {0}" -f $verlaufDatei)
if ($warnungen.Count -gt 0) {
  Write-Host ""
  Write-Host "ACHTUNG, folgende Quellen konnten nicht abgerufen werden (letzter Wert bleibt stehen):"
  foreach ($w in $warnungen) { Write-Host (" - " + $w) }
}
