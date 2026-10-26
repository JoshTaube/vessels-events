// Vessels Events: QR codes made on the laptop (no network), as a crisp SVG of square modules. The colours come from
// CSS (fill: currentColor on the modules, the tile behind them), so each game's look can theme it.
'use strict';
const qrcode = require('qrcode-generator');

// url -> '<svg ...>'; quiet: the blank border in modules (4 is the standard; the tile adds a little more).
function svg(url, quiet) {
  const q = quiet == null ? 2 : quiet;
  const qr = qrcode(0, 'M');   // smallest version that fits, medium error correction (survives a projector's glare)
  qr.addData(String(url));
  qr.make();
  const n = qr.getModuleCount(), size = n + q * 2;
  let d = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + q} ${r + q}h1v1h-1z`;
  }
  return `<svg class="qr" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><path fill="currentColor" d="${d}"/></svg>`;
}

module.exports = { svg };
