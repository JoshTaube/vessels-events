/* SOUL PURPOSE — the share card: one 1080 x 1920 PNG (an Instagram story) drawn on a canvas.
 *   SP.share.makeCard(info) -> Promise<Blob>
 *   info: { archetype: {name, title}, place: 'light'|'dark', placeName, home: {name, description},
 *           homeSVG, garySVG, chips: [..], stats: 'line of text' }
 * Key content stays between y 120 and 1780, clear of the story app's top and bottom bars.
 */
(function (root) {
  'use strict';
  const W = 1080, H = 1920;
  const INK = '#2a2140';
  const DISPLAY = '"Lilita One", "Arial Rounded MT Bold", sans-serif';
  const BODY = '"Nunito", ui-rounded, system-ui, sans-serif';

  /** Turn one of our inline SVG strings into an <img> that can be drawn on a canvas. */
  function svgImage(svg, w, h) {
    let s = svg.trim();
    if (!/^<svg[^>]*xmlns=/.test(s)) s = s.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
    s = s.replace('<svg', `<svg width="${w}" height="${h}"`);
    // An SVG drawn as an image can't see the page's fonts or styles: give it the display font
    // and the one rule its drawings rely on (Gary's open mouth is only for talking).
    s = s.replace(/(<svg[^>]*>)/, `$1<style>${root.SP.fonts.lilitaCSS}.mouth-open{display:none}</style>`);
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('could not draw an illustration'));
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
    });
  }

  function rr(x, cx, cy, w, h, r) {
    x.beginPath();
    x.moveTo(cx + r, cy);
    x.arcTo(cx + w, cy, cx + w, cy + h, r);
    x.arcTo(cx + w, cy + h, cx, cy + h, r);
    x.arcTo(cx, cy + h, cx, cy, r);
    x.arcTo(cx, cy, cx + w, cy, r);
    x.closePath();
  }
  /** A cartoon box: drop shadow, fill, thick ink outline. */
  function box(x, cx, cy, w, h, r, fill, shadow = 14) {
    if (shadow) { rr(x, cx, cy + shadow, w, h, r); x.fillStyle = INK; x.fill(); }
    rr(x, cx, cy, w, h, r);
    x.fillStyle = fill; x.fill();
    x.lineWidth = 10; x.strokeStyle = INK; x.stroke();
  }
  function wrap(x, text, maxW) {
    const words = String(text).split(' ');
    const lines = [];
    let line = '';
    for (const w of words) {
      const t = line ? line + ' ' + w : w;
      if (x.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
    }
    if (line) lines.push(line);
    return lines;
  }
  /** Largest font size (from max down to min) that fits the text in maxLines lines. */
  function fit(x, text, font, max, min, maxW, maxLines) {
    let size = max, lines;
    for (; size >= min; size -= 4) {
      x.font = font(size);
      lines = wrap(x, text, maxW);
      if (lines.length <= maxLines) break;
    }
    return { size: Math.max(size, min), lines };
  }

  function puff(x, cx, cy, s, fill) {
    const p = [[30, 40, 18], [55, 30, 24], [82, 36, 20], [102, 44, 13], [16, 47, 11], [64, 48, 16]];
    x.fillStyle = INK;
    for (const [a, b, r] of p) { x.beginPath(); x.arc(cx + a * s, cy + b * s, (r + 3.5) * s, 0, 7); x.fill(); }
    x.fillStyle = fill;
    for (const [a, b, r] of p) { x.beginPath(); x.arc(cx + a * s, cy + b * s, r * s, 0, 7); x.fill(); }
  }
  function sparkle(x, cx, cy, s, c) {
    x.save(); x.translate(cx, cy); x.scale(s, s);
    x.beginPath(); x.moveTo(0, -10);
    x.quadraticCurveTo(1, -1, 10, 0); x.quadraticCurveTo(1, 1, 0, 10);
    x.quadraticCurveTo(-1, 1, -10, 0); x.quadraticCurveTo(-1, -1, 0, -10);
    x.fillStyle = c; x.fill(); x.restore();
  }

  function background(x, place) {
    const g = x.createLinearGradient(0, 0, 0, H);
    if (place === 'light') {
      g.addColorStop(0, '#bfe6ff'); g.addColorStop(0.62, '#ffd6ea'); g.addColorStop(1, '#ffe9b0');
      x.fillStyle = g; x.fillRect(0, 0, W, H);
      const glow = x.createRadialGradient(800, 260, 0, 800, 260, 700);
      glow.addColorStop(0, '#fff7c8'); glow.addColorStop(1, '#fff7c800');
      x.fillStyle = glow; x.fillRect(0, 0, W, H);
      puff(x, -90, 40, 2.4, '#fff'); puff(x, 790, 520, 2.0, '#ffe3f0'); puff(x, -120, 1180, 2.2, '#fff4c9');
      puff(x, 820, 1560, 2.3, '#fff');
      sparkle(x, 150, 420, 3, '#fff'); sparkle(x, 960, 140, 2.4, '#fff6a8'); sparkle(x, 90, 1640, 2.2, '#fff');
    } else {
      g.addColorStop(0, '#2b0f4f'); g.addColorStop(0.6, '#511c86'); g.addColorStop(1, '#7a2a8f');
      x.fillStyle = g; x.fillRect(0, 0, W, H);
      const blobs = [[-40, 300, 260, '#ff8a3d'], [1110, 760, 220, '#ff4fa3'], [880, -40, 230, '#c04dff'],
        [60, 1500, 200, '#ff7a3d'], [1000, 1700, 260, '#ffb347']];
      for (const [cx, cy, r, c] of blobs) {
        x.save(); x.shadowColor = c; x.shadowBlur = 90; x.globalAlpha = 0.85;
        x.beginPath(); x.ellipse(cx, cy, r, r * 0.86, 0.5, 0, 7); x.fillStyle = c; x.fill(); x.restore();
      }
      sparkle(x, 170, 470, 3, '#ffb37a'); sparkle(x, 960, 420, 2.4, '#7af0ff'); sparkle(x, 80, 1250, 2.2, '#ff7ad9'); sparkle(x, 1000, 1300, 2.6, '#ffb37a');
    }
  }

  function centerText(x, text, y, font, fill, stroke = 0, strokeColor = INK) {
    x.font = font; x.textAlign = 'center'; x.textBaseline = 'alphabetic';
    if (stroke) { x.lineWidth = stroke; x.strokeStyle = strokeColor; x.lineJoin = 'round'; x.strokeText(text, W / 2, y); }
    x.fillStyle = fill; x.fillText(text, W / 2, y);
  }

  async function makeCard(info) {
    if (document.fonts) {
      await Promise.all([document.fonts.load('100px "Lilita One"'), document.fonts.load('900 40px "Nunito"'), document.fonts.load('italic 800 40px "Nunito"')]);
    }
    const [homeImg, garyImg] = await Promise.all([svgImage(info.homeSVG, 720, 480), svgImage(info.garySVG, 512, 450)]);
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d');
    const light = info.place === 'light';
    background(x, info.place);

    const pw = 940, px = (W - pw) / 2, inner = pw - 100;

    // ---- measure first, so the home picture gets whatever height is left ----
    const name = fit(x, info.archetype.name, (s) => `${s}px ${DISPLAY}`, 92, 60, inner, 2);
    x.font = `italic 800 38px ${BODY}`;
    const tag = wrap(x, info.archetype.title, inner).slice(0, 2);
    const panelH = 64 + 14 + name.lines.length * name.size + 16 + tag.length * 46 + 26 + 56 + 34;
    const hn = fit(x, info.home.name, (s) => `${s}px ${DISPLAY}`, 56, 40, pw - 80, 2);
    x.font = `800 34px ${BODY}`;
    const hd = wrap(x, info.home.description, pw - 90).slice(0, 3);
    const homeTextH = 24 + hn.lines.length * hn.size * 1.06 + 10 + hd.length * 44 + 28;
    const VERDICT_H = 172, PAD = 24, TOP = 300;
    const fixed = TOP + panelH + 42 + VERDICT_H + 42 + PAD + homeTextH;
    const picH = Math.max(340, Math.min(560, 1740 - fixed));
    const picW = Math.min(picH * 1.5, pw - 2 * PAD);

    // ---- logo ----
    x.save();
    x.translate(W / 2, 200); x.rotate(-0.035); x.translate(-W / 2, -200);
    x.shadowColor = INK; x.shadowOffsetY = 14;
    centerText(x, 'SOUL PURPOSE', 245, `140px ${DISPLAY}`, '#fff', 26);
    x.shadowColor = 'transparent';
    x.font = `140px ${DISPLAY}`; x.textAlign = 'left';
    const full = x.measureText('SOUL PURPOSE').width, soulW = x.measureText('SOUL ').width;
    x.fillStyle = '#fff'; x.fillText('SOUL', W / 2 - full / 2, 245);
    x.fillStyle = '#ffd66b'; x.fillText('PURPOSE', W / 2 - full / 2 + soulW, 245);
    x.restore();

    // ---- archetype panel ----
    let y = TOP;
    x.save(); x.translate(W / 2, y + panelH / 2); x.rotate(-0.018); x.translate(-W / 2, -(y + panelH / 2));
    box(x, px, y, pw, panelH, 44, INK, 0);
    let ty = y + 64;
    centerText(x, "I'M", ty, `900 40px ${BODY}`, '#ffd66b');
    ty += 14;
    for (const line of name.lines) { ty += name.size; centerText(x, line, ty, `${name.size}px ${DISPLAY}`, '#fff'); }
    ty += 16;
    for (const line of tag) { ty += 46; centerText(x, line, ty, `italic 800 38px ${BODY}`, '#ffd66b'); }
    ty += 26;
    x.font = `900 32px ${BODY}`;
    const chipW = info.chips.map((t) => x.measureText(t).width + 52);
    let cx = W / 2 - (chipW.reduce((a, b) => a + b, 0) + 18 * (chipW.length - 1)) / 2;
    info.chips.forEach((t, i) => {
      rr(x, cx, ty, chipW[i], 56, 28); x.fillStyle = '#fff'; x.fill();
      x.fillStyle = INK; x.textAlign = 'center'; x.fillText(t, cx + chipW[i] / 2, ty + 39);
      cx += chipW[i] + 18;
    });
    x.restore();

    // ---- verdict ----
    y += panelH + 42;
    const vg = x.createLinearGradient(px, y, px + pw, y + VERDICT_H);
    if (light) { vg.addColorStop(0, '#ffffff'); vg.addColorStop(0.5, '#ffc6de'); vg.addColorStop(1, '#ffd66b'); }
    else { vg.addColorStop(0, '#2b0f4f'); vg.addColorStop(0.55, '#6c2fa3'); vg.addColorStop(1, '#ff8a3d'); }
    box(x, px, y, pw, VERDICT_H, 40, vg);
    centerText(x, "AND I'M GOING TO", y + 54, `900 36px ${BODY}`, light ? INK : '#fff');
    if (!light) { x.save(); x.shadowColor = '#ff8a3d'; x.shadowBlur = 30; }
    centerText(x, info.placeName.toUpperCase(), y + 144, `100px ${DISPLAY}`, light ? INK : '#fff3e6');
    if (!light) x.restore();

    // ---- home postcard: picture, name, description ----
    y += VERDICT_H + 42;
    const cardH = PAD + picH + homeTextH;
    box(x, px, y, pw, cardH, 40, '#fff');
    const picX = (W - picW) / 2, picY = y + PAD;
    x.save(); rr(x, picX, picY, picW, picH, 24); x.clip(); x.drawImage(homeImg, picX, picY, picW, picH); x.restore();
    rr(x, picX, picY, picW, picH, 24); x.lineWidth = 8; x.strokeStyle = INK; x.stroke();
    ty = picY + picH + 24;
    for (const line of hn.lines) { ty += hn.size * 1.06; centerText(x, line, ty, `${hn.size}px ${DISPLAY}`, INK); }
    ty += 10;
    for (const line of hd) { ty += 44; centerText(x, line, ty, `800 34px ${BODY}`, '#4a4060'); }

    // ---- footer: Gary signs off ----
    const fy = y + cardH + 30;
    box(x, 200, fy + 22, W - 200 - px, 118, 30, '#fff', 0);
    x.drawImage(garyImg, 70, fy, 170, 150);
    x.textAlign = 'left';
    x.font = `900 36px ${BODY}`; x.fillStyle = INK;
    x.fillText('Reviewed by Gary, Afterlife Front Desk.', 280, fy + 66);
    x.font = `800 30px ${BODY}`;
    x.fillText(info.stats, 280, fy + 110);

    return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('could not make the image'))), 'image/png'));
  }

  root.SP = root.SP || {};
  root.SP.share = { makeCard, W, H };
})(typeof self !== 'undefined' ? self : this);
