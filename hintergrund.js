/* ===========================================================================
   hintergrund.js - Bewegter Hintergrund fuer die Startseite
   ---------------------------------------------------------------------------
   Laeuft NUR auf index.html (Entscheidung Felix 2026-09-29: die Detailseiten
   sollen exakt so schnell bleiben wie bisher - Regime und Tracking haben
   grosse Charts und lange Tabellen, dort kostet eine Dauer-Animation
   Scroll-Leistung).

   Gesteuert wird alles ueber einstellungen.js. Diese Datei hoert nur auf das
   Ereignis "hintergrund-geaendert" und richtet sich danach.

   Rechenlast, bewusst gedeckelt:
   - Bildrate auf 30 oder 60 begrenzt (Einstellung), nie mehr
   - pausiert vollstaendig, sobald der Tab im Hintergrund ist
   - pausiert im Hellmodus (der Hintergrund ist fuer Dunkel gebaut)
   - Geraete-Pixelverhaeltnis auf 2 gedeckelt (sonst rechnen Handys mit 3x
     und mehr Flaeche als noetig)
   - Systemeinstellung "Bewegung reduzieren" wird beachtet: dann nur ein
     Standbild statt einer Animation
   =========================================================================== */

(function () {
  "use strict";

  /* --- Hilfsmittel ------------------------------------------------------ */

  function zuf(a, b) { return a + Math.random() * (b - a); }
  function klemm(v, a, b) { return v < a ? a : (v > b ? b : v); }

  /* Weiche Ein- und Ausblendung ueber einen Zyklus: 0 -> 1 -> 0 */
  function huelle(p, ein, aus) {
    if (p < ein) { return p / ein; }
    if (p > 1 - aus) { return (1 - p) / aus; }
    return 1;
  }

  function rgba(r, g, b, a) { return "rgba(" + r + "," + g + "," + b + "," + a.toFixed(3) + ")"; }

  function reihe(n, trend, vola, start) {
    var a = [], v = start, i;
    for (i = 0; i < n; i++) {
      v += trend + (Math.random() - 0.5) * vola;
      a.push(v);
    }
    return a;
  }

  function spanne(werte) {
    var mn = Infinity, mx = -Infinity, i;
    for (i = 0; i < werte.length; i++) {
      if (werte[i] > mx) { mx = werte[i]; }
      if (werte[i] < mn) { mn = werte[i]; }
    }
    if (mx - mn < 1e-9) { mx = mn + 1; }
    return { mn: mn, mx: mx };
  }

  /* --- Instrumente und plausible Kurswerte ------------------------------ */

  var INSTRUMENTE = [
    { n: "EUR/USD", b: 1.10344, s: 0.0040, k: 5 },
    { n: "GBP/USD", b: 1.27185, s: 0.0050, k: 5 },
    { n: "USD/JPY", b: 148.732, s: 0.450, k: 3 },
    { n: "AUD/USD", b: 0.65420, s: 0.0035, k: 5 },
    { n: "USD/CAD", b: 1.36890, s: 0.0040, k: 5 },
    { n: "USD/CHF", b: 0.88215, s: 0.0035, k: 5 },
    { n: "NZD/USD", b: 0.59870, s: 0.0030, k: 5 },
    { n: "XAU/USD", b: 2384.15, s: 9.50, k: 2 },
    { n: "S&P 500", b: 7235, s: 26, k: 0 },
    { n: "NASDAQ", b: 23480, s: 90, k: 0 },
    { n: "DAX", b: 24115, s: 75, k: 0 },
    { n: "DXY", b: 98.42, s: 0.28, k: 2 },
    { n: "US 10Y", b: 4.182, s: 0.035, k: 3 },
    { n: "US 02Y", b: 3.647, s: 0.030, k: 3 },
    { n: "WTI", b: 71.35, s: 0.60, k: 2 },
    { n: "BRENT", b: 75.08, s: 0.60, k: 2 },
    { n: "VIX", b: 16.84, s: 0.70, k: 2 },
    { n: "BTC/USD", b: 94820, s: 620, k: 0 }
  ];

  function zahlDE(v, k) {
    var s = v.toFixed(k).split(".");
    s[0] = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    return s.join(",");
  }

  function kursSchnipsel() {
    var it = INSTRUMENTE[(Math.random() * INSTRUMENTE.length) | 0];
    var wert = it.b + (Math.random() - 0.5) * it.s * 4;
    var dp = (Math.random() - 0.48) * 0.9;
    return {
      name: it.n,
      wert: zahlDE(wert, it.k),
      delta: (dp >= 0 ? "+" : "−") + Math.abs(dp).toFixed(2) + " %",
      auf: dp >= 0
    };
  }

  /* --- Farbwelt --------------------------------------------------------- */

  var F = {
    raster: [104, 150, 210],
    auf: [96, 178, 255],
    ab: [225, 108, 78],
    text: [168, 200, 240]
  };

  var SCHRIFT = "ui-monospace, 'SF Mono', 'Cascadia Mono', Consolas, monospace";

  function zeichneKurs(ctx, k, x, y, alpha, groesse) {
    ctx.font = "600 " + groesse + "px " + SCHRIFT;
    ctx.textBaseline = "middle";
    ctx.fillStyle = rgba(F.text[0], F.text[1], F.text[2], alpha * 0.85);
    ctx.fillText(k.name, x, y);
    var bn = ctx.measureText(k.name + "  ").width;
    ctx.fillStyle = rgba(255, 255, 255, alpha * 0.92);
    ctx.fillText(k.wert, x + bn, y);
    var bw = ctx.measureText(k.wert + "  ").width;
    var fa = k.auf ? F.auf : F.ab;
    ctx.font = "500 " + (groesse * 0.88) + "px " + SCHRIFT;
    ctx.fillStyle = rgba(fa[0], fa[1], fa[2], alpha * 0.9);
    ctx.fillText(k.delta, x + bn + bw, y);
  }

  function zeichneLinie(ctx, daten, geo, fortschritt, alpha, farbe, dicke) {
    var n = daten.length;
    var bisF = n * fortschritt;
    var bis = Math.floor(bisF);
    if (bis < 2) { return; }
    var sp = spanne(daten);
    var dx = geo.w / (n - 1);
    var i;

    function px(i) { return geo.x + i * dx; }
    function py(i) { return geo.y + geo.h - (daten[i] - sp.mn) / (sp.mx - sp.mn) * geo.h; }

    ctx.beginPath();
    ctx.moveTo(px(0), py(0));
    for (i = 1; i < bis; i++) { ctx.lineTo(px(i), py(i)); }
    ctx.strokeStyle = rgba(farbe[0], farbe[1], farbe[2], alpha);
    ctx.lineWidth = dicke;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke();
  }

  /* =========================================================================
     Vorlage 1: Kurstafel
     Eine Wand aus Notierungen, die einzeln auf- und abblenden. Bewusst ohne
     wanderndes Zentrum, damit der Blick nicht von den Kacheln weggezogen wird.
     ======================================================================= */

  var KURSTAFEL = {
    id: "kurstafel",

    init: function (W, H) {
      this.gr = Math.max(10.5, Math.min(14, W * 0.0082));
      this.spalten = Math.max(2, Math.floor(W / Math.max(210, W * 0.185)));
      this.zeilen = Math.max(6, Math.floor(H / 54));
      this.zellen = [];
      for (var s = 0; s < this.spalten; s++) {
        for (var z = 0; z < this.zeilen; z++) {
          this.zellen.push({
            sx: s, sz: z,
            k: kursSchnipsel(),
            p: Math.random(),
            d: zuf(11, 24),
            funke: Math.random() < 0.34 ? reihe(26, zuf(-0.6, 0.7), 1.8, 50) : null
          });
        }
      }
    },

    zeichne: function (ctx, dt, W, H) {
      var bw = W / this.spalten, bh = H / this.zeilen, gr = this.gr;
      for (var i = 0; i < this.zellen.length; i++) {
        var c = this.zellen[i];
        c.p += dt / c.d;
        if (c.p >= 1) {
          c.p = 0;
          c.k = kursSchnipsel();
          c.d = zuf(11, 24);
          c.funke = Math.random() < 0.34 ? reihe(26, zuf(-0.6, 0.7), 1.8, 50) : null;
        }
        var a = huelle(c.p, 0.24, 0.3) * 0.8;
        if (a <= 0.015) { continue; }

        var x = c.sx * bw + bw * 0.1;
        var y = c.sz * bh + bh * 0.5;
        zeichneKurs(ctx, c.k, x, y, a, gr);

        if (c.funke) {
          var fo = klemm((c.p - 0.15) / 0.5, 0, 1);
          var fa = c.k.auf ? F.auf : F.ab;
          zeichneLinie(ctx, c.funke, { x: x, y: y + gr * 0.9, w: bw * 0.52, h: bh * 0.24 }, fo, a * 0.55, fa, 1.2);
        }

        ctx.strokeStyle = rgba(F.raster[0], F.raster[1], F.raster[2], a * 0.13);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y + bh * 0.36);
        ctx.lineTo(x + bw * 0.78, y + bh * 0.36);
        ctx.stroke();
      }
    }
  };

  /* =========================================================================
     Vorlage "Handelssaal" (Felix' Wahl vom 2026-09-30, Variante "Parkett bei
     Nacht" aus 04_Entwuerfe/proben/vorlage4.js - dort ausfuehrlich mit
     mehreren Varianten erprobt).

     NYSE-Schriftzug oben, eine Indextafel, ringsum kleine Tickerscreens.
     Bewusst OHNE das Nachrichten-Laufband der Probe-Fassung: Felix wollte
     "die schnell durchlaufende Anzeige unten komplett raus" (2026-09-30).

     Eigene Farb- und Hilfsfunktionen (Praefix hs*), weil die Palette warmes
     Gold statt Blau ist und nicht mit der Kurstafel-Farbwelt (F, zeichneKurs)
     kollidieren soll - beide Vorlagen laufen unabhaengig nebeneinander.
     ======================================================================= */

  var HS_GOLD = [240, 185, 90];
  var HS_GOLD_HELL = [255, 224, 160];
  var HS_GRUEN = [90, 214, 120];
  var HS_ROT = [230, 90, 70];
  var HS_GRAU = [176, 158, 128];

  var HS_TICKER = ["HNZ", "PM", "BOH", "ALV", "BBT", "RNDY", "PB", "SKX", "BID", "KSU",
    "TUC", "MAN", "VOC", "ASGN", "NSP", "VVI", "PWR", "AF", "CNO", "PFG", "SAFL", "LNC"];
  var HS_INDIZES = ["INDU", "INDP", "NYSE", "NYA", "UTIL", "TRIN", "TRAN", "VOLU"];

  function hsWert(kuerzel) {
    return {
      kuerzel: kuerzel,
      wert: zuf(9, 780).toFixed(2),
      delta: ((Math.random() < 0.5 ? -1 : 1) * zuf(0.1, 2.4)).toFixed(2),
      auf: Math.random() < 0.55
    };
  }
  function hsNeueZeile() { return hsWert(HS_TICKER[(Math.random() * HS_TICKER.length) | 0]); }
  function hsNeuerIndex() { return hsWert(HS_INDIZES[(Math.random() * HS_INDIZES.length) | 0]); }

  function hsAktualisiere(z, dt) {
    z.naechste = (z.naechste === undefined ? zuf(2, 8) : z.naechste) - dt;
    if (z.naechste <= 0) {
      var neu = hsWert(z.kuerzel);
      z.wert = neu.wert; z.delta = neu.delta; z.auf = neu.auf;
      z.blitz = 1; z.naechste = zuf(2, 8);
    }
    if (z.blitz) { z.blitz = Math.max(0, z.blitz - dt * 0.9); }
  }

  function hsZeile(ctx, z, x, y, breite, gr, alpha) {
    var farbe = z.auf ? HS_GRUEN : HS_ROT;
    if (z.blitz > 0.02) {
      ctx.fillStyle = rgba(farbe[0], farbe[1], farbe[2], z.blitz * 0.14 * alpha);
      ctx.fillRect(x - 3, y - gr * 0.8, breite, gr * 1.6);
    }
    ctx.font = "700 " + gr + "px " + SCHRIFT;
    ctx.textBaseline = "middle";
    ctx.fillStyle = rgba(HS_GRAU[0], HS_GRAU[1], HS_GRAU[2], alpha * 0.85);
    ctx.fillText(z.kuerzel, x, y);
    ctx.fillStyle = rgba(farbe[0], farbe[1], farbe[2], alpha * 0.95);
    ctx.fillText(z.auf ? "▲" : "▼", x + breite * 0.36, y);
    ctx.fillStyle = rgba(255, 250, 240, alpha * 0.92);
    ctx.fillText(z.wert, x + breite * 0.47, y);
    ctx.font = "600 " + (gr * 0.9) + "px " + SCHRIFT;
    ctx.fillStyle = rgba(farbe[0], farbe[1], farbe[2], alpha * 0.9);
    ctx.fillText((z.auf ? "+" : "") + z.delta, x + breite * 0.80, y);
  }

  function hsSchirmRahmen(ctx, b, alpha, kopf) {
    ctx.fillStyle = rgba(8, 6, 4, alpha * 0.55);
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = rgba(HS_GOLD[0], HS_GOLD[1], HS_GOLD[2], alpha * 0.22);
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(b.x) + 0.5, Math.round(b.y) + 0.5, Math.round(b.w), Math.round(b.h));
    if (kopf) {
      ctx.fillStyle = rgba(HS_GOLD[0], HS_GOLD[1], HS_GOLD[2], alpha * 0.16);
      ctx.fillRect(b.x, b.y, b.w, 17);
      ctx.font = "700 9.5px " + SCHRIFT;
      ctx.textBaseline = "middle";
      ctx.fillStyle = rgba(HS_GOLD_HELL[0], HS_GOLD_HELL[1], HS_GOLD_HELL[2], alpha * 0.8);
      ctx.fillText(kopf, b.x + 7, b.y + 8.5);
    }
  }

  function hsSchriftzug(ctx, W, H, cx, cy, groesse, alpha, puls) {
    var s = 0.85 + Math.sin(puls) * 0.06;
    var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, groesse * 2.6 * s);
    g.addColorStop(0, rgba(HS_GOLD_HELL[0], HS_GOLD_HELL[1], HS_GOLD_HELL[2], alpha * 0.20));
    g.addColorStop(1, rgba(HS_GOLD_HELL[0], HS_GOLD_HELL[1], HS_GOLD_HELL[2], 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "800 " + groesse + "px " + SCHRIFT;
    ctx.shadowColor = rgba(HS_GOLD_HELL[0], HS_GOLD_HELL[1], HS_GOLD_HELL[2], alpha * 0.9);
    ctx.shadowBlur = groesse * 0.5 * s;
    ctx.fillStyle = rgba(255, 250, 240, alpha * 0.95);
    ctx.fillText("NYSE", cx, cy);
    ctx.shadowBlur = 0;
    ctx.font = "600 " + (groesse * 0.22) + "px " + SCHRIFT;
    ctx.fillStyle = rgba(HS_GOLD[0], HS_GOLD[1], HS_GOLD[2], alpha * 0.75);
    ctx.fillText("P O S T   5", cx, cy + groesse * 0.62);
    ctx.restore();
    ctx.textAlign = "left";
  }

  function hsHalo(ctx, W, H, puls) {
    var s = 0.22 + Math.sin(puls * 0.4) * 0.03;
    var g = ctx.createRadialGradient(W * 0.5, H * 0.08, 0, W * 0.5, H * 0.08, H * 1.1);
    g.addColorStop(0, rgba(HS_GOLD[0], HS_GOLD[1], HS_GOLD[2], s));
    g.addColorStop(0.4, rgba(HS_GOLD[0], HS_GOLD[1], HS_GOLD[2], s * 0.25));
    g.addColorStop(1, rgba(HS_GOLD[0], HS_GOLD[1], HS_GOLD[2], 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  var HANDELSSAAL = {
    id: "handelssaal",

    init: function (W, H) {
      this.indizes = []; for (var i = 0; i < 4; i++) { this.indizes.push(hsNeuerIndex()); }
      this.schirme = [];
      var sp = Math.max(3, Math.round(W / 300)), ze = Math.max(2, Math.round(H / 230));
      var bw = W / sp, bh = H / ze;
      for (var s = 0; s < sp; s++) {
        for (var z = 0; z < ze; z++) {
          if (s === Math.floor(sp / 2) && z === 0) { continue; }  /* Platz fuer den Schriftzug */
          var n = Math.max(3, Math.floor(bh / 28)), zeilen = [];
          for (i = 0; i < n; i++) { zeilen.push(hsNeueZeile()); }
          this.schirme.push({
            box: { x: s * bw + bw * 0.08, y: z * bh + bh * 0.10, w: bw * 0.84, h: bh * 0.78 },
            zeilen: zeilen
          });
        }
      }
      this.puls = 0;
    },

    zeichne: function (ctx, dt, W, H) {
      this.puls += dt;
      hsHalo(ctx, W, H, this.puls);

      for (var i = 0; i < this.schirme.length; i++) {
        var s = this.schirme[i];
        hsSchirmRahmen(ctx, s.box, 0.62, null);
        var zh = (s.box.h - 4) / s.zeilen.length;
        for (var j = 0; j < s.zeilen.length; j++) {
          hsAktualisiere(s.zeilen[j], dt);
          hsZeile(ctx, s.zeilen[j], s.box.x + 6, s.box.y + 4 + zh * j + zh * 0.5, s.box.w - 12, Math.max(8, zh * 0.5), 0.6);
        }
      }

      hsSchriftzug(ctx, W, H, W * 0.5, H * 0.10, Math.min(W * 0.05, H * 0.09), 0.9, this.puls);

      var mitte = { x: W * 0.38, y: H * 0.16, w: W * 0.24, h: H * 0.10 };
      hsSchirmRahmen(ctx, mitte, 0.85, null);
      var zh2 = mitte.h / this.indizes.length;
      for (i = 0; i < this.indizes.length; i++) {
        hsAktualisiere(this.indizes[i], dt);
        hsZeile(ctx, this.indizes[i], mitte.x + 6, mitte.y + zh2 * i + zh2 * 0.5, mitte.w - 12, Math.max(8, zh2 * 0.42), 0.85);
      }
    }
  };

  /* =========================================================================
     Vorlage "Bulle und Bär" (Felix' Wahl vom 2026-10-01, Variante
     "Foto-Duell" aus 04_Entwuerfe/proben/vorlage3.js - dort mit drei
     weiteren Varianten erprobt, siehe proben/README.md).

     Felix wollte hier ausdruecklich KEINE Nachzeichnung, sondern sein
     eigenes Referenzbild 1:1: Baer (rot) und Bulle (gruen) sind deshalb
     echte Fotoausschnitte (bilder/bild-baer.png, bilder/bild-bulle.png),
     keine Vektor-Silhouetten. Der fast schwarze Bildhintergrund wurde per
     Einmal-Skript ueber die Helligkeit weich in Transparenz umgewandelt
     (Chroma-Key mit zusaetzlichem Rand-Verlauf, siehe proben/README.md,
     Abschnitt "Foto-Duell"), damit die Kante nirgends hart wirkt.

     Aufbau: die Koepfe sitzen gross und weit oben (ragen bewusst leicht
     ueber Bildrand/Kopfzeile hinaus, der Koerper darf hinter der ersten
     Kachelreihe verschwinden - Felix' ausdrueckliche Vorgabe, anders als bei
     Kurstafel/Handelssaal). Ein wanderndes weisses Leuchtband ueberzieht
     jeden Kopf periodisch (rot-weiss bzw. gruen-weiss "schimmernd"), darunter
     laufen viele einzelne rote/gruene Kurslinien diagonal von den oberen/
     unteren Bildecken zu einem kleinen, pulsierenden Ball in der Bildmitte.

     Eigene Farb- und Hilfsfunktionen (Praefix fd*), unabhaengig von der
     Kurstafel-/Handelssaal-Farbwelt. */

  var FD_ROT = [235, 45, 40];
  var FD_GRUEN = [50, 214, 110];
  var TAU = Math.PI * 2;

  function fdLadeFoto(datei) {
    var img = new Image();
    var stand = { bild: null, breite: 1, hoehe: 1, geladen: false };
    img.onload = function () {
      stand.bild = img;
      stand.breite = img.naturalWidth;
      stand.hoehe = img.naturalHeight;
      stand.geladen = true;
    };
    img.src = datei;
    return stand;
  }

  var FD_FOTO_BAER = fdLadeFoto("bilder/bild-baer.png");
  var FD_FOTO_BULLE = fdLadeFoto("bilder/bild-bulle.png");

  /* Wanderndes weisses Leuchtband ueber dem schon eingefaerbten Foto -
     arbeitet auf einer kleinen Offscreen-Kopie, damit nur die Silhouette
     selbst getroffen wird (globalCompositeOperation "source-atop"), nicht
     der Bildhintergrund. */
  function fdZeichneKopfSchimmer(ctx, kopf, cx, cy, R, farbe, alpha, glut, zeit, periode, versatz) {
    if (!kopf.geladen) { return; }
    var h = R * 2, w = h * (kopf.breite / kopf.hoehe);
    var x = cx - w / 2, y = cy - h / 2;

    var tmp = kopf._schimmer;
    if (!tmp) {
      tmp = document.createElement("canvas");
      tmp.width = kopf.breite; tmp.height = kopf.hoehe;
      kopf._schimmer = tmp;
    }
    var tcx = tmp.getContext("2d");
    tcx.clearRect(0, 0, tmp.width, tmp.height);
    tcx.drawImage(kopf.bild, 0, 0);

    var phase = ((zeit / periode) + versatz) % 1;
    var bandMitte = phase * 2.6 - 0.8;
    tcx.globalCompositeOperation = "source-atop";
    var g = tcx.createLinearGradient(
      (bandMitte - 0.32) * tmp.width, 0,
      (bandMitte + 0.32) * tmp.width, tmp.height
    );
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.5, "rgba(255,255,255,.9)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    tcx.fillStyle = g;
    tcx.fillRect(0, 0, tmp.width, tmp.height);
    tcx.globalCompositeOperation = "source-over";

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowColor = rgba(farbe[0], farbe[1], farbe[2], Math.min(1, glut));
    ctx.shadowBlur = R * (0.16 + glut * 0.22);
    ctx.drawImage(tmp, x, y, w, h);
    ctx.shadowBlur = 0;
    ctx.drawImage(tmp, x, y, w, h);
    ctx.restore();
  }

  /* Kursbaender: viele einzelne, jagged Kurslinien von der oberen linken bzw.
     unteren rechten Bildecke zu einem gemeinsamen Zielpunkt (der Ball). Der
     seitliche Streuversatz jeder Linie klingt zur Mitte hin ab, so treffen
     sich alle Linien im selben Punkt. */
  function fdNeuesKursband(vonObenLinks, startVerteilt) {
    return {
      vonObenLinks: vonObenLinks,
      t0: startVerteilt ? zuf(-0.4, 1) : -zuf(0.05, 0.35),
      tempo: zuf(0.045, 0.09),
      laenge: zuf(0.24, 0.46),
      versatz: zuf(-70, 70),
      amp: zuf(10, 26),
      freq: zuf(2.6, 6),
      phase: zuf(0, TAU),
      dicke: zuf(0.9, 1.8),
      hell: zuf(0.6, 1)
    };
  }

  function fdKursPunkt(band, t, sx, sy, mx, my) {
    var x0 = sx + (mx - sx) * t, y0 = sy + (my - sy) * t;
    var dx = mx - sx, dy = my - sy, len = Math.hypot(dx, dy) || 1;
    var nx = -dy / len, ny = dx / len;
    var wiggle = Math.sin(t * band.freq * TAU + band.phase) * band.amp * (1 - t * 0.4) +
      band.versatz * (1 - t);
    return { x: x0 + nx * wiggle, y: y0 + ny * wiggle };
  }

  function fdAktualisiereKursband(band, dt) {
    band.t0 += dt * band.tempo;
    if (band.t0 > 1) {
      band.t0 = -zuf(0.05, 0.35);
      band.tempo = zuf(0.045, 0.09);
      band.laenge = zuf(0.24, 0.46);
      band.versatz = zuf(-70, 70);
      band.amp = zuf(10, 26);
      band.freq = zuf(2.6, 6);
      band.phase = zuf(0, TAU);
      band.dicke = zuf(0.9, 1.8);
      band.hell = zuf(0.6, 1);
    }
  }

  function fdZeichneKursband(ctx, band, sx, sy, mx, my, farbe) {
    var a = Math.max(0, band.t0), b = Math.min(1, band.t0 + band.laenge);
    if (b <= a) { return; }
    var schritte = 18, i, t, p;
    var pStart = fdKursPunkt(band, a, sx, sy, mx, my);
    var pEnd = fdKursPunkt(band, b, sx, sy, mx, my);

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineWidth = band.dicke;
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    ctx.shadowColor = rgba(farbe[0], farbe[1], farbe[2], band.hell * 0.6);
    ctx.shadowBlur = 6;
    var grad = ctx.createLinearGradient(pStart.x, pStart.y, pEnd.x, pEnd.y);
    grad.addColorStop(0, rgba(farbe[0], farbe[1], farbe[2], 0));
    grad.addColorStop(1, rgba(farbe[0], farbe[1], farbe[2], band.hell * 0.9));
    ctx.strokeStyle = grad;
    ctx.beginPath();
    for (i = 0; i <= schritte; i++) {
      t = a + (b - a) * (i / schritte);
      p = fdKursPunkt(band, t, sx, sy, mx, my);
      if (i === 0) { ctx.moveTo(p.x, p.y); } else { ctx.lineTo(p.x, p.y); }
    }
    ctx.stroke();
    ctx.restore();
  }

  /* Ball in der Bildmitte: Buendelungspunkt der Kursstroeme. */
  function fdZeichneBall(ctx, x, y, zeit) {
    var puls = 1 + Math.sin(zeit * 1.6) * 0.14;
    var R = 15 * puls;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    var gr = ctx.createRadialGradient(x - R * 0.3, y, 0, x - R * 0.3, y, R * 2.4);
    gr.addColorStop(0, rgba(FD_ROT[0], FD_ROT[1], FD_ROT[2], 0.5));
    gr.addColorStop(1, rgba(FD_ROT[0], FD_ROT[1], FD_ROT[2], 0));
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.arc(x, y, R * 2.4, 0, TAU); ctx.fill();

    var gg = ctx.createRadialGradient(x + R * 0.3, y, 0, x + R * 0.3, y, R * 2.4);
    gg.addColorStop(0, rgba(FD_GRUEN[0], FD_GRUEN[1], FD_GRUEN[2], 0.5));
    gg.addColorStop(1, rgba(FD_GRUEN[0], FD_GRUEN[1], FD_GRUEN[2], 0));
    ctx.fillStyle = gg;
    ctx.beginPath(); ctx.arc(x, y, R * 2.4, 0, TAU); ctx.fill();

    var gw = ctx.createRadialGradient(x, y, 0, x, y, R);
    gw.addColorStop(0, "rgba(255,255,255,.95)");
    gw.addColorStop(0.55, "rgba(255,255,255,.5)");
    gw.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gw;
    ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.fill();

    ctx.restore();
  }

  var BULLE_BAER = {
    id: "bulle-baer",

    init: function (W, H) {
      this.zeit = 0;
      var n = 26, i;
      this.rot = [];
      this.gruen = [];
      for (i = 0; i < n; i++) { this.rot.push(fdNeuesKursband(true, true)); }
      for (i = 0; i < n; i++) { this.gruen.push(fdNeuesKursband(false, true)); }
    },

    zeichne: function (ctx, dt, W, H) {
      this.zeit += dt;
      var mx = W * 0.5, my = H * 0.52;
      var i;

      for (i = 0; i < this.rot.length; i++) {
        fdAktualisiereKursband(this.rot[i], dt);
        fdZeichneKursband(ctx, this.rot[i], 0, 0, mx, my, FD_ROT);
      }
      for (i = 0; i < this.gruen.length; i++) {
        fdAktualisiereKursband(this.gruen[i], dt);
        fdZeichneKursband(ctx, this.gruen[i], W, H, mx, my, FD_GRUEN);
      }

      fdZeichneBall(ctx, mx, my, this.zeit);

      var zielH = Math.min(H * 0.74, 520);

      if (FD_FOTO_BAER.geladen) {
        var bwL = zielH * (FD_FOTO_BAER.breite / FD_FOTO_BAER.hoehe);
        var cxL = -bwL * 0.06 + bwL / 2;
        var cyL = -zielH * 0.07 + zielH / 2;
        fdZeichneKopfSchimmer(ctx, FD_FOTO_BAER, cxL, cyL, zielH / 2, FD_ROT, 0.98, 0.5, this.zeit, 6, 0);
      }
      if (FD_FOTO_BULLE.geladen) {
        var bwR = zielH * (FD_FOTO_BULLE.breite / FD_FOTO_BULLE.hoehe);
        var cxR = W + bwR * 0.06 - bwR / 2;
        var cyR = -zielH * 0.07 + zielH / 2;
        fdZeichneKopfSchimmer(ctx, FD_FOTO_BULLE, cxR, cyR, zielH / 2, FD_GRUEN, 0.98, 0.5, this.zeit, 6, 0.5);
      }
    }
  };

  var VORLAGEN = {};
  VORLAGEN[KURSTAFEL.id] = KURSTAFEL;
  VORLAGEN[HANDELSSAAL.id] = HANDELSSAAL;
  VORLAGEN[BULLE_BAER.id] = BULLE_BAER;
  /* Hologramm kommt hierher, sobald Felix sich fuer eine Variante
     entscheidet (Konzepte stehen in 04_Entwuerfe/proben). */

  /* =========================================================================
     Motor
     ======================================================================= */

  var leinwand = null, ctx = null, schleier = null;
  var W = 0, H = 0;
  var aktiv = null, bereit = false;
  var an = false, tempo = 1, deckkraft = 1, bildrate = 60;
  var sichtbar = true, laeuft = false;
  var letzte = 0, akku = 0, angefordert = false;

  var wenigerBewegung = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function dunkelModus() {
    return document.documentElement.getAttribute("data-theme") === "dark";
  }

  function baueSchichten() {
    if (leinwand) { return; }
    leinwand = document.createElement("canvas");
    leinwand.className = "hg-leinwand";
    leinwand.setAttribute("aria-hidden", "true");
    ctx = leinwand.getContext("2d");

    schleier = document.createElement("div");
    schleier.className = "hg-schleier";
    schleier.setAttribute("aria-hidden", "true");

    document.body.insertBefore(schleier, document.body.firstChild);
    document.body.insertBefore(leinwand, document.body.firstChild);
  }

  function groesse() {
    if (!leinwand) { return; }
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = leinwand.clientWidth;
    H = leinwand.clientHeight;
    if (W < 1 || H < 1) { return; }
    leinwand.width = Math.round(W * dpr);
    leinwand.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    bereit = false;
  }

  function pruefeInit() {
    if (!aktiv) { return false; }
    if (!bereit) {
      if (W < 1 || H < 1) { return false; }
      aktiv.init(W, H);
      bereit = true;
    }
    return true;
  }

  function sollLaufen() {
    return an && aktiv && sichtbar && dunkelModus() && !wenigerBewegung;
  }

  function einzelbild() {
    /* Fuer "Bewegung reduzieren": einmal zeichnen, dann stehen lassen */
    if (!an || !aktiv || !dunkelModus()) { return; }
    if (!pruefeInit()) { return; }
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.globalAlpha = deckkraft;
    aktiv.zeichne(ctx, 8, W, H);
    ctx.restore();
  }

  function schleife(t) {
    angefordert = false;
    if (!sollLaufen()) { laeuft = false; return; }
    requestAnimationFrame(schleife);
    angefordert = true;

    var dt = (t - letzte) / 1000;
    letzte = t;
    if (dt > 0.5) { dt = 0.5; }
    if (dt <= 0) { return; }

    if (bildrate <= 30) {
      akku += dt;
      if (akku < 1 / 31) { return; }
      dt = akku;
      akku = 0;
    }

    if (!pruefeInit()) { return; }

    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.globalAlpha = deckkraft;
    aktiv.zeichne(ctx, dt * tempo, W, H);
    ctx.restore();
  }

  function starten() {
    if (laeuft || angefordert) { return; }
    if (!sollLaufen()) { return; }
    laeuft = true;
    letzte = performance.now();
    akku = 0;
    angefordert = true;
    requestAnimationFrame(schleife);
  }

  function anwenden(stand) {
    an = stand.an;
    tempo = stand.werte.tempo / 100;
    deckkraft = stand.werte.deckkraft / 100;
    bildrate = stand.werte.bildrate;
    aktiv = VORLAGEN[stand.vorlage] || null;
    bereit = false;

    if (!an || !aktiv || !dunkelModus()) {
      laeuft = false;
      if (ctx && W > 0 && H > 0) { ctx.clearRect(0, 0, W, H); }
      if (leinwand) { leinwand.hidden = true; }
      if (schleier) { schleier.hidden = true; }
      return;
    }

    baueSchichten();
    leinwand.hidden = false;
    schleier.hidden = false;
    groesse();

    if (wenigerBewegung) { einzelbild(); } else { starten(); }
  }

  /* --- Ereignisse ------------------------------------------------------- */

  document.addEventListener("hintergrund-geaendert", function (e) {
    baueSchichten();
    anwenden(e.detail);
  });

  document.addEventListener("visibilitychange", function () {
    sichtbar = !document.hidden;
    if (sichtbar) { starten(); } else { laeuft = false; }
  });

  window.addEventListener("resize", function () {
    clearTimeout(window.__hgResize);
    window.__hgResize = setTimeout(function () {
      groesse();
      if (wenigerBewegung) { einzelbild(); } else { starten(); }
    }, 160);
  });

  /* Der Hell/Dunkel-Schalter liegt weiter in der bestehenden Logik. Statt
     dort einzugreifen, wird das Attribut beobachtet - das greift zuverlaessig,
     egal wer das Thema umstellt. */
  if (window.MutationObserver) {
    new MutationObserver(function () {
      var stand = window.DASHBOARD_EINSTELLUNGEN
        ? window.DASHBOARD_EINSTELLUNGEN.lesen()
        : null;
      if (stand) { anwenden(stand); }
    }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  }

  function start() {
    baueSchichten();
    groesse();
    if (window.DASHBOARD_EINSTELLUNGEN) {
      anwenden(window.DASHBOARD_EINSTELLUNGEN.lesen());
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }

})();
