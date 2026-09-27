# Historie-Nachtragen-Wachstum.ps1
#
# EINMAL-SKRIPT (2026-09-24). Traegt die von Felix gelieferte Historie
# Januar 2021 bis August 2026 fuer fuenf Wachstums-Reihen nach, fuer die es
# keine kostenlose API gibt und die sich das Dashboard bisher Monat fuer Monat
# selbst aufgebaut hat:
#
#   ISM_MFG_NO        ISM Manufacturing New Orders
#   ISM_MFG_BACKLOG   ISM Manufacturing Backlog of Orders
#   ISM_SVC_BUSACT     ISM Services Business Activity
#   CB_CCI             Consumer Confidence Index (Conference Board)
#   NFIB               NFIB Small Business Optimism
#
# Quelle: 02_Raw/US_Konjunktur_Stimmungsindikatoren_2021-2026.xlsx (Blatt
# "Daten", Herkunft je Reihe im Blatt "Quellen"). Die Rohdatei wird nur
# gelesen, nie veraendert (CLAUDE.md Abschnitt 5).
#
# Gleicher Aufbau wie Historie-Nachtragen-Arbeitsmarkt.ps1 (2026-09-24):
#   1. Schreibt die Monatswerte in verlauf/webquellen-verlauf.json, also in
#      genau den Speicher, den Daten-Abrufen-Webquellen.ps1 ohnehin fortschreibt.
#      Damit bleibt die automatische Aktualisierung unveraendert erhalten: jeder
#      neue Monat wird beim naechsten Abruf wie bisher hinten angehaengt.
#   2. Setzt die fertigen Verlaufspunkte direkt in 01_Website/daten/webquellen.js
#      ein, damit die Website sofort den vollen Chart zeigt, ohne dass erst alle
#      Webquellen neu abgerufen werden muessen.
#
# Bereits vorhandene Werte im Verlauf werden NICHT ueberschrieben. Abweichungen
# zwischen Tabelle und bereits gespeichertem Verlauf werden nur gemeldet.
#
# Aufruf:
#   powershell -NoProfile -ExecutionPolicy Bypass -File "Historie-Nachtragen-Wachstum.ps1"
#
# Hinweis: Das Skript enthaelt bewusst keine Umlaute (Windows PowerShell 5.1).

$ErrorActionPreference = "Stop"

$skriptOrdner  = $PSScriptRoot
$projektOrdner = Split-Path -Parent $skriptOrdner                 # 05_Dashboard
$vaultOrdner   = Split-Path -Parent $projektOrdner                # Trading Brain
$quellDatei    = Join-Path $vaultOrdner "02_Raw\US_Konjunktur_Stimmungsindikatoren_2021-2026.xlsx"
$verlaufDatei  = Join-Path $skriptOrdner "verlauf\webquellen-verlauf.json"
$webquellenJs  = Join-Path $projektOrdner "01_Website\daten\webquellen.js"

foreach ($p in @($quellDatei, $verlaufDatei, $webquellenJs)) {
  if (-not (Test-Path $p)) { throw "Datei nicht gefunden: $p" }
}

# --- 1. Tabelle lesen -------------------------------------------------------
# .xlsx ist ein ZIP-Archiv. Das Blatt liegt als XML darin, Texte stehen
# ausgelagert in sharedStrings.xml. Kein Excel noetig.

function Read-XlsxBlatt([string]$datei, [string]$blattXml) {
  $tmp = Join-Path $env:TEMP ("xlsx_" + [Guid]::NewGuid().ToString("N"))
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  [System.IO.Compression.ZipFile]::ExtractToDirectory($datei, $tmp)
  try {
    [xml]$ssXml = Get-Content (Join-Path $tmp "xl\sharedStrings.xml") -Encoding UTF8
    $texte = @()
    foreach ($si in $ssXml.sst.si) {
      $t = ""
      if ($si.t)      { if ($si.t -is [string]) { $t = $si.t } else { $t = $si.t.'#text' } }
      elseif ($si.r)  { foreach ($r in $si.r) { if ($r.t -is [string]) { $t += $r.t } else { $t += $r.t.'#text' } } }
      $texte += $t
    }

    [xml]$shXml = Get-Content (Join-Path $tmp "xl\$blattXml") -Encoding UTF8
    $zeilen = @()
    foreach ($row in $shXml.worksheet.sheetData.row) {
      $zelle = @{}
      foreach ($c in $row.c) {
        $wert = $c.v
        if ($c.t -eq 's') { $wert = $texte[[int]$c.v] }
        elseif ($c.t -eq 'inlineStr') { $wert = $c.is.t }
        $zelle[($c.r -replace '\d', '')] = $wert
      }
      $zeilen += ,$zelle
    }
    return $zeilen
  } finally {
    Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
  }
}

Write-Host "Lese Tabelle ..." -NoNewline
$zeilen = Read-XlsxBlatt $quellDatei "worksheets\sheet1.xml"
Write-Host (" {0} Zeilen" -f $zeilen.Count)

# Spalten im Blatt "Daten":
#   A Monat (Excel-Datumszahl)               E Consumer Confidence Index
#   B ISM Manufacturing New Orders           G NFIB Small Business Optimism
#   C ISM Manufacturing Backlog of Orders
#   D ISM Services Business Activity
# (F und H sind Delta-zum-Vormonat-Hilfsspalten, werden nicht gebraucht)
$spalten = @(
  @{ schluessel = "ISM_MFG_NO";      spalte = "B"; titel = "ISM Manufacturing New Orders";        ganz = $false }
  @{ schluessel = "ISM_MFG_BACKLOG"; spalte = "C"; titel = "ISM Manufacturing Backlog of Orders";  ganz = $false }
  @{ schluessel = "ISM_SVC_BUSACT";  spalte = "D"; titel = "ISM Services Business Activity";       ganz = $false }
  @{ schluessel = "CB_CCI";          spalte = "E"; titel = "Consumer Confidence Index";            ganz = $false }
  @{ schluessel = "NFIB";            spalte = "G"; titel = "NFIB Small Business Optimism";         ganz = $false }
)

$ausTabelle = @{}
foreach ($s in $spalten) { $ausTabelle[$s.schluessel] = [ordered]@{} }

foreach ($z in $zeilen) {
  if (-not $z.ContainsKey("A")) { continue }
  $roh = $z["A"]
  if (-not ($roh -match '^\d+$')) { continue }          # Kopfzeile und Fussnote ueberspringen
  $datum = ([datetime]"1899-12-30").AddDays([int]$roh).ToString("yyyy-MM-01")
  foreach ($s in $spalten) {
    if (-not $z.ContainsKey($s.spalte)) { continue }
    $v = $z[$s.spalte]
    if ([string]::IsNullOrWhiteSpace($v)) { continue }
    $zahl = [double]::Parse($v, [Globalization.CultureInfo]::InvariantCulture)
    if ($s.ganz) { $zahl = [double][Math]::Round($zahl, 0) }
    $ausTabelle[$s.schluessel][$datum] = $zahl
  }
}

foreach ($s in $spalten) {
  Write-Host ("  {0,-38} {1} Monatswerte ({2} bis {3})" -f $s.titel,
    $ausTabelle[$s.schluessel].Count,
    ($ausTabelle[$s.schluessel].Keys | Select-Object -First 1),
    ($ausTabelle[$s.schluessel].Keys | Select-Object -Last 1))
}

# --- 2. Verlaufsdatei ergaenzen --------------------------------------------

$verlauf = @{}
$roh = Get-Content $verlaufDatei -Raw -Encoding UTF8 | ConvertFrom-Json
foreach ($p in $roh.PSObject.Properties) {
  $liste = @{}
  foreach ($e in $p.Value.PSObject.Properties) { $liste[$e.Name] = $e.Value }
  $verlauf[$p.Name] = $liste
}

$neu = 0; $schonDa = 0; $abweichend = @()
foreach ($s in $spalten) {
  $k = $s.schluessel
  if (-not $verlauf.ContainsKey($k)) { $verlauf[$k] = @{} }
  foreach ($d in $ausTabelle[$k].Keys) {
    if ($verlauf[$k].ContainsKey($d)) {
      $schonDa++
      if ([double]$verlauf[$k][$d] -ne $ausTabelle[$k][$d]) {
        $abweichend += ("{0} {1}: Verlauf {2} <-> Tabelle {3} (Verlauf bleibt stehen)" -f `
          $k, $d, $verlauf[$k][$d], $ausTabelle[$k][$d])
      }
      continue
    }
    $verlauf[$k][$d] = $ausTabelle[$k][$d]
    $neu++
  }
}

# Sicherungskopie, bevor geschrieben wird
$sicherung = $verlaufDatei + ".vor-historie-nachtrag-wachstum"
if (-not (Test-Path $sicherung)) { Copy-Item $verlaufDatei $sicherung }

($verlauf | ConvertTo-Json -Depth 10) | Out-File -FilePath $verlaufDatei -Encoding utf8

Write-Host ""
Write-Host ("Verlauf ergaenzt: {0} neue Monatswerte, {1} waren schon vorhanden." -f $neu, $schonDa)
if ($abweichend.Count -gt 0) {
  Write-Host "ACHTUNG, Abweichungen zwischen gespeichertem Verlauf und Tabelle:"
  foreach ($a in $abweichend) { Write-Host ("  - " + $a) }
}

# --- 3. webquellen.js sofort aktualisieren ----------------------------------
# Nur die fuenf "punkte"-Listen werden ersetzt, der Rest der Datei bleibt
# Zeichen fuer Zeichen unangetastet. Bewusst kein JSON-Hin-und-Rueck-Wandeln:
# das wuerde unnoetig alle uebrigen Reihen neu formatieren.

$inhalt = [System.IO.File]::ReadAllText($webquellenJs)

foreach ($s in $spalten) {
  $k = $s.schluessel

  $punkte = @()
  foreach ($d in ($verlauf[$k].Keys | Sort-Object)) {
    $v = $verlauf[$k][$d]
    $text = if ($s.ganz) { [string][int]$v } else { ([double]$v).ToString([Globalization.CultureInfo]::InvariantCulture) }
    $punkte += ('{{"d":"{0}","v":{1}}}' -f $d, $text)
  }
  $neuePunkte = '"punkte":[' + ($punkte -join ",") + ']'

  $start = $inhalt.IndexOf('"' + $k + '":{')
  if ($start -lt 0) { throw "Reihe $k in webquellen.js nicht gefunden." }
  $pStart = $inhalt.IndexOf('"punkte":[', $start)
  if ($pStart -lt 0) { throw "Verlaufspunkte von $k in webquellen.js nicht gefunden." }
  $pEnde = $inhalt.IndexOf(']', $pStart)
  if ($pEnde -lt 0) { throw "Ende der Verlaufspunkte von $k nicht gefunden." }

  $inhalt = $inhalt.Substring(0, $pStart) + $neuePunkte + $inhalt.Substring($pEnde + 1)
  Write-Host ("  {0,-38} {1} Punkte in webquellen.js gesetzt" -f $s.titel, $punkte.Count)
}

$sicherungJs = $webquellenJs + ".vor-historie-nachtrag-wachstum"
if (-not (Test-Path $sicherungJs)) { Copy-Item $webquellenJs $sicherungJs }
[System.IO.File]::WriteAllText($webquellenJs, $inhalt, (New-Object System.Text.UTF8Encoding($false)))

Write-Host ""
Write-Host ("Fertig. Aktualisiert: {0}" -f $webquellenJs)
Write-Host ("Sicherungskopien: *.vor-historie-nachtrag-wachstum")
